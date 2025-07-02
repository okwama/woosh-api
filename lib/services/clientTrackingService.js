const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ClientTrackingService {
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
        // Default to current month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    return { startDate, endDate };
  }

  /**
   * Get new clients progress for a sales rep
   */
  async getNewClientsProgress(userId, startDate, endDate, period) {
    // Get sales rep info including their new clients target
    const salesRep = await prisma.salesRep.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        new_clients: true, // This is the target
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
      // Default to current month
      dateRange = this.getPeriodDateRange('current_month');
    }

    // Count new clients added by this sales rep in the period
    const newClientsAdded = await prisma.clients.count({
      where: {
        added_by: userId,
        created_at: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        }
      }
    });

    // Calculate progress
    const target = salesRep.new_clients || 0;
    const progress = target > 0 ? Math.round((newClientsAdded / target) * 100) : 0;
    const remaining = Math.max(0, target - newClientsAdded);

    return {
      userId,
      salesRepName: salesRep.name,
      period: period || 'custom',
      dateRange: {
        startDate: dateRange.startDate.toISOString().split('T')[0],
        endDate: dateRange.endDate.toISOString().split('T')[0]
      },
      newClientsTarget: target,
      newClientsAdded,
      remainingClients: remaining,
      progress,
      status: newClientsAdded >= target ? 'Target Achieved' : 'In Progress',
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get detailed list of new clients added by sales rep
   */
  async getNewClientsDetails(userId, startDate, endDate, period) {
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

    // Get detailed list of new clients
    const newClients = await prisma.clients.findMany({
      where: {
        added_by: userId,
        created_at: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        }
      },
      select: {
        id: true,
        name: true,
        contact: true,
        region: true,
        route_name: true,
        client_type: true,
        created_at: true,
        status: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    return {
      userId,
      period: period || 'custom',
      dateRange: {
        startDate: dateRange.startDate.toISOString().split('T')[0],
        endDate: dateRange.endDate.toISOString().split('T')[0]
      },
      totalNewClients: newClients.length,
      newClients,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Update new clients target for a sales rep
   */
  async updateNewClientsTarget(userId, newTarget) {
    const updatedSalesRep = await prisma.salesRep.update({
      where: { id: userId },
      data: {
        new_clients: newTarget,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        new_clients: true,
        updatedAt: true
      }
    });

    return {
      message: 'New clients target updated successfully',
      salesRep: updatedSalesRep
    };
  }

  /**
   * Get new clients statistics by time period
   */
  async getNewClientsStatistics(userId, year) {
    const targetYear = year || new Date().getFullYear();
    
    // Get monthly statistics for the year
    const monthlyStats = [];
    
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(targetYear, month, 1);
      const endDate = new Date(targetYear, month + 1, 0, 23, 59, 59);
      
      const count = await prisma.clients.count({
        where: {
          added_by: userId,
          created_at: {
            gte: startDate,
            lte: endDate,
          }
        }
      });

      monthlyStats.push({
        month: month + 1,
        monthName: startDate.toLocaleString('default', { month: 'long' }),
        newClientsAdded: count,
        year: targetYear
      });
    }

    // Get total for the year
    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);
    
    const yearlyTotal = await prisma.clients.count({
      where: {
        added_by: userId,
        created_at: {
          gte: yearStart,
          lte: yearEnd,
        }
      }
    });

    return {
      userId,
      year: targetYear,
      yearlyTotal,
      monthlyBreakdown: monthlyStats,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = new ClientTrackingService(); 