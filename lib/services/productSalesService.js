const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ProductSalesService {
  /**
   * Category ID mapping for product classification
   * Update these IDs based on your actual category setup
   */
  static CATEGORY_MAPPING = {
    VAPES: [1, 3],    // Category IDs for vapes
    POUCHES: [4, 5]   // Category IDs for pouches
  };

  /**
   * Get the period date range based on period string
   */
  getPeriodDateRange(period) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'current_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'current_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    return { startDate, endDate };
  }

  /**
   * Identify if a product is a vape based on category_id
   * Category IDs: 1 and 3 are vapes, 4 and 5 are pouches
   */
     isVapeProduct(productName, category, categoryId) {
     // Primary classification by category_id
     if (categoryId && ProductSalesService.CATEGORY_MAPPING.VAPES.includes(categoryId)) {
       return true;
     }
    
    // Fallback to name-based classification if category_id is not set
    const vapeKeywords = ['vape', 'e-cig', 'electronic', 'vapor', 'mod', 'pod', 'cartridge'];
    const nameCheck = vapeKeywords.some(keyword => 
      productName.toLowerCase().includes(keyword.toLowerCase())
    );
    const categoryCheck = category && vapeKeywords.some(keyword => 
      category.toLowerCase().includes(keyword.toLowerCase())
    );
    
    return nameCheck || categoryCheck;
  }

  /**
   * Identify if a product is a pouch based on category_id
   * Category IDs: 1 and 3 are vapes, 4 and 5 are pouches
   */
     isPouchProduct(productName, category, categoryId) {
     // Primary classification by category_id
     if (categoryId && ProductSalesService.CATEGORY_MAPPING.POUCHES.includes(categoryId)) {
       return true;
     }
    
    // Fallback to name-based classification if category_id is not set
    const pouchKeywords = ['pouch', 'nicotine pouch', 'tobacco pouch', 'snus'];
    const nameCheck = pouchKeywords.some(keyword => 
      productName.toLowerCase().includes(keyword.toLowerCase())
    );
    const categoryCheck = category && pouchKeywords.some(keyword => 
      category.toLowerCase().includes(keyword.toLowerCase())
    );
    
    return nameCheck || categoryCheck;
  }

  /**
   * Get product sales progress for a sales rep
   */
  async getProductSalesProgress(userId, productType = 'all', startDate, endDate, period) {
    // Get sales rep info including their targets
    const salesRep = await prisma.salesRep.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        vapes_targets: true,
        pouches_targets: true,
      }
    });

    if (!salesRep) {
      throw new Error('Sales rep not found');
    }

    // Determine date range
    let dateRange;
    if (period) {
      dateRange = this.getPeriodDateRange(period);
    } else if (startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      };
    } else {
      dateRange = this.getPeriodDateRange('current_month');
    }

    // Get all orders for this sales rep in the period
    const orders = await prisma.myOrder.findMany({
      where: {
        userId: userId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        }
      },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: true,
                category_id: true
              }
            }
          }
        }
      }
    });

    // Calculate sales by product type
    let vapesSold = 0;
    let pouchesSold = 0;
    let totalQuantity = 0;
    let productBreakdown = [];

    orders.forEach(order => {
      order.orderItems.forEach(item => {
        const product = item.product;
        const quantity = item.quantity;
        
        totalQuantity += quantity;

        const isVape = this.isVapeProduct(product.name, product.category, product.category_id);
        const isPouch = this.isPouchProduct(product.name, product.category, product.category_id);

        if (isVape) {
          vapesSold += quantity;
        }
        if (isPouch) {
          pouchesSold += quantity;
        }

        // Add to product breakdown
        const existingProduct = productBreakdown.find(p => p.productId === product.id);
        if (existingProduct) {
          existingProduct.quantity += quantity;
        } else {
          productBreakdown.push({
            productId: product.id,
            productName: product.name,
            category: product.category,
            categoryId: product.category_id,
            quantity: quantity,
            isVape,
            isPouch
          });
        }
      });
    });

    // Calculate progress
    const vapesTarget = salesRep.vapes_targets || 0;
    const pouchesTarget = salesRep.pouches_targets || 0;
    
    const vapesProgress = vapesTarget > 0 ? Math.round((vapesSold / vapesTarget) * 100) : 0;
    const pouchesProgress = pouchesTarget > 0 ? Math.round((pouchesSold / pouchesTarget) * 100) : 0;

    const result = {
      userId,
      salesRepName: salesRep.name,
      period: period || 'custom',
      dateRange: {
        startDate: dateRange.startDate.toISOString().split('T')[0],
        endDate: dateRange.endDate.toISOString().split('T')[0]
      },
      summary: {
        totalOrders: orders.length,
        totalQuantitySold: totalQuantity,
        vapes: {
          target: vapesTarget,
          sold: vapesSold,
          remaining: Math.max(0, vapesTarget - vapesSold),
          progress: vapesProgress,
          status: vapesSold >= vapesTarget ? 'Target Achieved' : 'In Progress'
        },
        pouches: {
          target: pouchesTarget,
          sold: pouchesSold,
          remaining: Math.max(0, pouchesTarget - pouchesSold),
          progress: pouchesProgress,
          status: pouchesSold >= pouchesTarget ? 'Target Achieved' : 'In Progress'
        }
      },
      generatedAt: new Date().toISOString()
    };

    // Filter results based on productType parameter
    if (productType === 'vapes') {
      result.productBreakdown = productBreakdown.filter(p => p.isVape);
      result.focusedMetric = result.summary.vapes;
    } else if (productType === 'pouches') {
      result.productBreakdown = productBreakdown.filter(p => p.isPouch);
      result.focusedMetric = result.summary.pouches;
    } else {
      result.productBreakdown = productBreakdown;
    }

    return result;
  }

  /**
   * Get category information and mapping
   */
  async getCategoryMapping() {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true
      }
    });

    return {
      categories,
      mapping: ProductSalesService.CATEGORY_MAPPING,
      vapeCategories: categories.filter(cat => ProductSalesService.CATEGORY_MAPPING.VAPES.includes(cat.id)),
      pouchCategories: categories.filter(cat => ProductSalesService.CATEGORY_MAPPING.POUCHES.includes(cat.id))
    };
  }

  /**
   * Get detailed product sales breakdown
   */
  async getDetailedProductSales(userId, startDate, endDate, period) {
    let dateRange;
    if (period) {
      dateRange = this.getPeriodDateRange(period);
    } else if (startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      };
    } else {
      dateRange = this.getPeriodDateRange('current_month');
    }

    // Get detailed order information
    const orders = await prisma.myOrder.findMany({
      where: {
        userId: userId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        }
      },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            region: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const detailedSales = orders.map(order => {
      const vapeItems = [];
      const pouchItems = [];
      let totalVapes = 0;
      let totalPouches = 0;

      order.orderItems.forEach(item => {
        const isVape = this.isVapeProduct(item.product.name, item.product.category, item.product.category_id);
        const isPouch = this.isPouchProduct(item.product.name, item.product.category, item.product.category_id);

        if (isVape) {
          vapeItems.push({
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity
          });
          totalVapes += item.quantity;
        }

        if (isPouch) {
          pouchItems.push({
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity
          });
          totalPouches += item.quantity;
        }
      });

      return {
        orderId: order.id,
        orderDate: order.createdAt.toISOString().split('T')[0],
        client: order.client,
        totalAmount: order.totalAmount,
        vapes: {
          items: vapeItems,
          totalQuantity: totalVapes
        },
        pouches: {
          items: pouchItems,
          totalQuantity: totalPouches
        }
      };
    });

    return {
      userId,
      period: period || 'custom',
      dateRange: {
        startDate: dateRange.startDate.toISOString().split('T')[0],
        endDate: dateRange.endDate.toISOString().split('T')[0]
      },
      totalOrders: orders.length,
      detailedSales,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Update product targets for a sales rep
   */
  async updateProductTargets(userId, vapesTarget, pouchesTarget) {
    const updatedSalesRep = await prisma.salesRep.update({
      where: { id: userId },
      data: {
        ...(vapesTarget !== undefined && { vapes_targets: vapesTarget }),
        ...(pouchesTarget !== undefined && { pouches_targets: pouchesTarget }),
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        vapes_targets: true,
        pouches_targets: true,
        updatedAt: true
      }
    });

    return {
      message: 'Product targets updated successfully',
      salesRep: updatedSalesRep
    };
  }

  /**
   * Get monthly product sales statistics
   */
  async getMonthlyProductStatistics(userId, year) {
    const targetYear = year || new Date().getFullYear();
    
    const monthlyStats = [];
    
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(targetYear, month, 1);
      const endDate = new Date(targetYear, month + 1, 0, 23, 59, 59);
      
      const monthData = await this.getProductSalesProgress(userId, 'all', startDate, endDate);
      
      monthlyStats.push({
        month: month + 1,
        monthName: startDate.toLocaleString('default', { month: 'long' }),
        year: targetYear,
        vapesSold: monthData.summary.vapes.sold,
        pouchesSold: monthData.summary.pouches.sold,
        totalOrders: monthData.summary.totalOrders
      });
    }

    return {
      userId,
      year: targetYear,
      monthlyBreakdown: monthlyStats,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = new ProductSalesService(); 