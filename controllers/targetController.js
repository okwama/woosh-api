const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all targets with calculated progress
exports.getAllTargets = async (req, res) => {
  try {
    const targets = await prisma.Target.findMany();

    // For each target, calculate achievedValue and progress
    const targetsWithProgress = await Promise.all(targets.map(async (target) => {
      // Find all orders for this sales rep within the target period
      const orders = await prisma.MyOrder.findMany({
        where: {
          userId: target.salesRepId,
          createdAt: {
            gte: target.createdAt,
            lte: target.updatedAt,
          },
        },
        select: { id: true },
      });
      const orderIds = orders.map(o => o.id);

      // Sum up all quantities from OrderItem for these orders
      let achievedValue = 0;
      if (orderIds.length > 0) {
        const { _sum } = await prisma.OrderItem.aggregate({
          where: { orderId: { in: orderIds } },
          _sum: { quantity: true },
        });
        achievedValue = _sum.quantity || 0;
      }
      const progress = target.targetValue > 0 ? (achievedValue / target.targetValue) * 100 : 0;

      return {
        ...target,
        achievedValue,
        progress,
      };
    }));

    res.json(targetsWithProgress);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch targets', details: error.message });
  }
};

// Get a target by ID
exports.getTargetById = async (req, res) => {
  const { id } = req.params;
  try {
    const target = await prisma.Target.findUnique({ where: { id: Number(id) } });
    if (!target) return res.status(404).json({ error: 'Target not found' });
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch target', details: error.message });
  }
};

// Create a new target
exports.createTarget = async (req, res) => {
  const { salesRepId, isCurrent, targetValue, achievedValue, achieved } = req.body;
  try {
    const target = await prisma.Target.create({
      data: { salesRepId, isCurrent, targetValue, achievedValue, achieved },
    });
    res.status(201).json(target);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create target', details: error.message });
  }
};

// Update a target
exports.updateTarget = async (req, res) => {
  const { id } = req.params;
  const { isCurrent, targetValue, achievedValue, achieved } = req.body;
  try {
    const target = await prisma.Target.update({
      where: { id: Number(id) },
      data: { isCurrent, targetValue, achievedValue, achieved },
    });
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update target', details: error.message });
  }
};

// Delete a target
exports.deleteTarget = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.Target.delete({ where: { id: Number(id) } });
    res.json({ message: 'Target deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete target', details: error.message });
  }
}; 