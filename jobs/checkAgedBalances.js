const cron = require('node-cron');
const prisma = require('../config/prisma');

// Threshold for considering a balance as old (in days)
const OLD_BALANCE_THRESHOLD = 30;

const checkAgedBalances = async () => {
  try {
    console.log('[Aged Balance Check] Starting daily check...');

    // Get all clients with unpaid orders
    const clientsWithUnpaidOrders = await prisma.myOrder.groupBy({
      by: ['clientId'],
      where: {
        balance: { gt: 0 }  // Only orders with remaining balance
      }
    });

    console.log(`[Aged Balance Check] Found ${clientsWithUnpaidOrders.length} clients with unpaid orders`);

    for (const client of clientsWithUnpaidOrders) {
      const oldestUnpaidOrder = await prisma.myOrder.findFirst({
        where: {
          clientId: client.clientId,
          balance: { gt: 0 }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (oldestUnpaidOrder) {
        const daysOld = Math.floor((new Date() - new Date(oldestUnpaidOrder.createdAt)) / (1000 * 60 * 60 * 24));
        
        if (daysOld > OLD_BALANCE_THRESHOLD) {
          // Get total outstanding balance
          const totalBalance = await prisma.myOrder.aggregate({
            where: {
              clientId: client.clientId,
              balance: { gt: 0 }
            },
            _sum: {
              balance: true
            }
          });

          // Record in client history
          await prisma.clientHistory.create({
            data: {
              client_id: client.clientId,
              order_id: oldestUnpaidOrder.id,
              amount_in: 0,
              amount_out: 0,
              balance: totalBalance._sum.balance || 0,
              my_date: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              staff: 0,  // System generated
              reference: `Aged balance alert: ${daysOld} days old`
            }
          });

          console.log(`[Aged Balance Alert] Client ${client.clientId} has an aged balance of ${daysOld} days`);
        }
      }
    }

    console.log('[Aged Balance Check] Completed successfully');
  } catch (error) {
    console.error('[Aged Balance Check] Error:', error);
  }
};

// Schedule the job to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('[Aged Balance Check] Running scheduled check...');
  checkAgedBalances();
});

// Export for testing purposes
module.exports = {
  checkAgedBalances,
  OLD_BALANCE_THRESHOLD
}; 