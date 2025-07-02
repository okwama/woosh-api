const prisma = require('../lib/prisma');
const asyncHandler = require('express-async-handler');

// Update order balances and client balance
const updateOrderBalances = asyncHandler(async (req, res) => {
  const { clientId, paymentAmount } = req.body;

  if (!clientId || !paymentAmount) {
    return res.status(400).json({ error: 'Client ID and payment amount are required' });
  }

  try {
    // Get all unpaid orders for the client
    const unpaidOrders = await prisma.myOrder.findMany({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (unpaidOrders.length === 0) {
      return res.status(400).json({ error: 'No outstanding balances found' });
    }

    // Calculate total outstanding balance from MyOrder
    const totalOutstanding = unpaidOrders.reduce((sum, order) => sum + order.balance, 0);
    const amount = parseFloat(paymentAmount);

    if (amount > totalOutstanding) {
      return res.status(400).json({ 
        error: `Payment amount (${amount}) exceeds total outstanding balance (${totalOutstanding})` 
      });
    }

    // Apply payment to oldest orders first
    let remainingPayment = amount;
    const updatedOrders = [];

    for (const order of unpaidOrders) {
      if (remainingPayment <= 0) break;

      const paymentForOrder = Math.min(remainingPayment, order.balance);
      remainingPayment -= paymentForOrder;

      // Update order balance and amountPaid
      const updatedOrder = await prisma.myOrder.update({
        where: { id: order.id },
        data: {
          balance: order.balance - paymentForOrder,
          amountPaid: order.amountPaid + paymentForOrder
        }
      });

      updatedOrders.push(updatedOrder);
    }

    // Calculate new total outstanding balance from MyOrder
    const newTotalOutstanding = await prisma.myOrder.aggregate({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }
      },
      _sum: {
        balance: true
      }
    });

    // Update client balance to reflect total from MyOrder
    const updatedClient = await prisma.clients.update({
      where: { id: parseInt(clientId) },
      data: {
        balance: (newTotalOutstanding._sum.balance || 0).toString()
      }
    });

    res.json({
      success: true,
      data: {
        client: updatedClient,
        updatedOrders,
        previousBalance: totalOutstanding,
        newBalance: newTotalOutstanding._sum.balance || 0
      }
    });
  } catch (error) {
    console.error('Error updating order balances:', error);
    res.status(500).json({ error: 'Failed to update order balances' });
  }
});

// Get client's order balances
const getClientOrderBalances = asyncHandler(async (req, res) => {
  const { clientId } = req.params;

  try {
    // Get all orders with remaining balance
    const orders = await prisma.myOrder.findMany({
      where: {
        clientId: parseInt(clientId),
        balance: { gt: 0 }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Calculate total from MyOrder balances
    const totalOutstanding = orders.reduce((sum, order) => sum + order.balance, 0);

    res.json({
      success: true,
      data: {
        orders,
        totalOutstanding
      }
    });
  } catch (error) {
    console.error('Error getting client order balances:', error);
    res.status(500).json({ error: 'Failed to get client order balances' });
  }
});

module.exports = {
  updateOrderBalances,
  getClientOrderBalances
}; 