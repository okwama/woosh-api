const prisma = require('../lib/prisma');

// Create a new uplift sale
exports.createUpliftSale = async (req, res) => {
  try {
    console.log('[UpliftSale] Received request body:', req.body);
    const { clientId, userId, items } = req.body;

    // Validate required fields
    if (!clientId || !userId || !items || !Array.isArray(items) || items.length === 0) {
      console.log('[UpliftSale] Validation failed:', { clientId, userId, items });
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: clientId, userId, and items are required' 
      });
    }

    console.log('[UpliftSale] Looking up client and sales rep:', { clientId, userId });
    // Verify client and sales rep exist
    const [client, salesRep] = await Promise.all([
      prisma.clients.findUnique({ where: { id: clientId } }),
      prisma.salesRep.findUnique({ where: { id: userId } })
    ]);

    console.log('[UpliftSale] Found client:', client);
    console.log('[UpliftSale] Found salesRep:', salesRep);

    if (!client) {
      return res.status(404).json({ 
        success: false,
        message: 'Client not found' 
      });
    }

    if (!salesRep) {
      return res.status(404).json({ 
        success: false,
        message: 'Sales representative not found' 
      });
    }

    // Create the uplift sale with items in a transaction
    const upliftSale = await prisma.$transaction(async (tx) => {
      console.log('[UpliftSale] Creating sale record');
      // Create the uplift sale
      const sale = await tx.upliftSale.create({
        data: {
          clientId,
          userId,
          status: 'pending',
          totalAmount: 0 // Will be calculated from items
        }
      });

      console.log('[UpliftSale] Created sale:', sale);

      // Create sale items and calculate total
      let totalAmount = 0;
      const saleItems = await Promise.all(items.map(async (item) => {
        console.log('[UpliftSale] Processing item:', item);
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        const itemTotal = item.unitPrice * item.quantity;
        totalAmount += itemTotal;

        const saleItem = await tx.upliftSaleItem.create({
          data: {
            upliftSaleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: itemTotal
          }
        });
        console.log('[UpliftSale] Created sale item:', saleItem);
        return saleItem;
      }));

      console.log('[UpliftSale] Updating total amount:', totalAmount);
      // Update total amount
      await tx.upliftSale.update({
        where: { id: sale.id },
        data: { totalAmount }
      });

      return {
        ...sale,
        items: saleItems
      };
    });

    console.log('[UpliftSale] Successfully created sale:', upliftSale);
    res.status(201).json({
      success: true,
      message: 'Uplift sale created successfully',
      data: upliftSale
    });
  } catch (error) {
    console.error('[UpliftSale] Error creating uplift sale:', error);
    console.error('[UpliftSale] Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Error creating uplift sale',
      error: error.message 
    });
  }
};

// Get uplift sales with optional filters
exports.getUpliftSales = async (req, res) => {
  try {
    const { status, startDate, endDate, clientId, userId } = req.query;
    
    const where = {};
    
    if (status) where.status = status;
    if (clientId) where.clientId = parseInt(clientId);
    if (userId) where.userId = parseInt(userId);
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const upliftSales = await prisma.upliftSale.findMany({
      where,
      include: {
        items: {
          include: {
            product: true
          }
        },
        client: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: upliftSales
    });
  } catch (error) {
    console.error('Error fetching uplift sales:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching uplift sales',
      error: error.message 
    });
  }
};

// Get a single uplift sale by ID
exports.getUpliftSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const upliftSale = await prisma.upliftSale.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            product: true
          }
        },
        client: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!upliftSale) {
      return res.status(404).json({ 
        success: false,
        message: 'Uplift sale not found' 
      });
    }

    res.json({
      success: true,
      data: upliftSale
    });
  } catch (error) {
    console.error('Error fetching uplift sale:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching uplift sale',
      error: error.message 
    });
  }
};

// Update uplift sale status
exports.updateUpliftSaleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ 
        success: false,
        message: 'Status is required' 
      });
    }

    const upliftSale = await prisma.upliftSale.findUnique({
      where: { id: parseInt(id) }
    });

    if (!upliftSale) {
      return res.status(404).json({ 
        success: false,
        message: 'Uplift sale not found' 
      });
    }

    const updatedSale = await prisma.upliftSale.update({
      where: { id: parseInt(id) },
      data: { status }
    });

    res.json({ 
      success: true,
      message: 'Status updated successfully',
      data: updatedSale 
    });
  } catch (error) {
    console.error('Error updating uplift sale status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating uplift sale status',
      error: error.message 
    });
  }
};

// Delete an uplift sale
exports.deleteUpliftSale = async (req, res) => {
  try {
    const { id } = req.params;
    
    const upliftSale = await prisma.upliftSale.findUnique({
      where: { id: parseInt(id) }
    });

    if (!upliftSale) {
      return res.status(404).json({ 
        success: false,
        message: 'Uplift sale not found' 
      });
    }

    // Delete associated items first
    await prisma.upliftSaleItem.deleteMany({
      where: { upliftSaleId: parseInt(id) }
    });
    
    // Then delete the sale
    await prisma.upliftSale.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({ 
      success: true,
      message: 'Uplift sale deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting uplift sale:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting uplift sale',
      error: error.message 
    });
  }
};
