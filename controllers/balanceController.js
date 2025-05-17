const prisma = require('../lib/prisma');
const asyncHandler = require('express-async-handler');

// Threshold for considering a balance as old (in days)
const OLD_BALANCE_THRESHOLD = 3;

// Get client's balance age and details
const getClientBalanceAge = asyncHandler(async (req, res) => {
  const { clientId } = req.params;

  try {
    // Get the oldest unpaid order
    const oldestUnpaidOrder = await prisma.myOrder.findFirst({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }  // Only orders with remaining balance
      },
      orderBy: { createdAt: 'asc' }
    });

    if (!oldestUnpaidOrder) {
      return res.json({
        success: true,
        data: {
          hasBalance: false,
          balanceAge: 0,
          lastUpdated: null,
          balance: 0
        }
      });
    }

    const daysOld = Math.floor((new Date() - new Date(oldestUnpaidOrder.createdAt)) / (1000 * 60 * 60 * 24));

    // Get total outstanding balance
    const totalBalance = await prisma.myOrder.aggregate({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }
      },
      _sum: {
        balance: true
      }
    });

    res.json({
      success: true,
      data: {
        hasBalance: true,
        balanceAge: daysOld,
        lastUpdated: oldestUnpaidOrder.createdAt,
        balance: totalBalance._sum.balance || 0,
        isOldBalance: daysOld > OLD_BALANCE_THRESHOLD,
        oldestOrder: {
          id: oldestUnpaidOrder.id,
          createdAt: oldestUnpaidOrder.createdAt,
          balance: oldestUnpaidOrder.balance
        }
      }
    });
  } catch (error) {
    console.error('Error getting client balance age:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get client balance age'
    });
  }
});

// Check if client has old balance
const hasOldBalance = async (clientId) => {
  try {
    // Get the oldest unpaid order
    const oldestUnpaidOrder = await prisma.myOrder.findFirst({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }  // Only orders with remaining balance
      },
      orderBy: { createdAt: 'asc' }
    });

    if (!oldestUnpaidOrder) {
      return { hasOldBalance: false };
    }

    const daysOld = Math.floor((new Date() - new Date(oldestUnpaidOrder.createdAt)) / (1000 * 60 * 60 * 24));

    // Get total outstanding balance
    const totalBalance = await prisma.myOrder.aggregate({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }
      },
      _sum: {
        balance: true
      }
    });

    return {
      hasOldBalance: daysOld > OLD_BALANCE_THRESHOLD,
      balanceAge: daysOld,
      lastUpdated: oldestUnpaidOrder.createdAt,
      balance: totalBalance._sum.balance || 0,
      oldestOrder: {
        id: oldestUnpaidOrder.id,
        createdAt: oldestUnpaidOrder.createdAt,
        balance: oldestUnpaidOrder.balance
      }
    };
  } catch (error) {
    console.error('Error checking old balance:', error);
    return { hasOldBalance: false };
  }
};

module.exports = {
  getClientBalanceAge,
  hasOldBalance
};
