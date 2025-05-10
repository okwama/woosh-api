const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Function to check for aged balances
const checkAgedBalances = async () => {
  try {
    // Get all clients with unpaid orders
    const clientsWithUnpaidOrders = await prisma.myOrder.groupBy({
      by: ['clientId'],
      where: {
        OR: [
          {
            amountPaid: 0,
          },
          {
            AND: [
              {
                amountPaid: {
                  not: 0,
                }
              },
              {
                amountPaid: {
                  lt: totalAmount
                }
              }
            ]
          }
        ]
      }
    });

    // Check each client's oldest unpaid order
    for (const client of clientsWithUnpaidOrders) {
      const oldestUnpaidOrder = await prisma.myOrder.findFirst({
        where: {
          clientId: client.clientId,
          OR: [
            {
              amountPaid: 0,
            },
            {
              AND: [
                {
                  amountPaid: {
                    not: 0,
                  }
                },
                {
                  amountPaid: {
                    lt: totalAmount
                  }
                }
              ]
            }
          ]
        },
        select: {
          id: true,
          createdAt: true,
          amountPaid: true,
          totalAmount: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (oldestUnpaidOrder) {
        const daysOld = Math.floor((new Date() - new Date(oldestUnpaidOrder.createdAt)) / (1000 * 60 * 60 * 24));
        
        if (daysOld > 120) {
          // Log the aged balance
          console.log(`[Aged Balance Alert] Client ${client.clientId} has an aged balance of ${daysOld} days`);
          
          // You can add additional actions here, such as:
          // - Sending notifications
          // - Creating reports
          // - Updating client status
        }
      }
    }
  } catch (error) {
    console.error('[Aged Balance Check] Error:', error);
  }
};

// Schedule the job to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('[Aged Balance Check] Starting daily check...');
  checkAgedBalances();
});

module.exports = {
  checkAgedBalances
}; 