const prisma = require('../lib/prisma');

const createProductReturn = async (req, res) => {
  const { clientId, userId, journeyPlanId, details } = req.body;
  try {
    // 1. Create the report
    const report = await prisma.report.create({
      data: {
        type: 'PRODUCT_RETURN',
        clientId,
        userId,
        journeyPlanId,
      },
    });

    // 2. Create the ProductReturn
    const productReturn = await prisma.productReturn.create({
      data: {
        clientId,
        reportId: report.id,
        productName: details.productName,
        quantity: details.quantity,
        reason: details.reason,
        imageUrl: details.imageUrl,
      },
    });

    // 3. Create ProductReturnItems if provided
    let items = [];
    if (Array.isArray(details.items)) {
      items = await Promise.all(details.items.map(item =>
        prisma.productReturnItem.create({
          data: {
            productReturnId: productReturn.id,
            productName: item.productName || 'Unknown',
            quantity: item.quantity || 0,
            reason: item.reason || '',
            imageUrl: item.imageUrl || '',
          },
        })
      ));
    }

    res.status(201).json({ report, productReturn, items });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product return', details: error.message });
  }
};

const updateProductReturn = async (req, res) => {
  const { id } = req.params;
  const { productName, quantity, reason, imageUrl } = req.body;
  try {
    const updated = await prisma.productReturn.update({
      where: { id: parseInt(id) },
      data: { productName, quantity, reason, imageUrl }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product return' });
  }
};

module.exports = { createProductReturn, updateProductReturn };
