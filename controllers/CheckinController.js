const { getPrismaClient } = require('../lib/prisma');
const prisma = getPrismaClient();

exports.checkIn = async (req, res) => {
  const { clientId, latitude, longitude, notes, imageUrl } = req.body;
  const managerId = req.user.id;

  try {
    // 1. Manager verification
    const manager = await prisma.manager.findUnique({
      where: { userId: managerId },
    });

    if (!manager) {
      return res.status(400).json({ message: 'Invalid manager ID' });
    }

    // 2. Get client's timezone and current time
    const timezone = req.headers['timezone'] || 'UTC';
    const now = new Date();
    
    // Convert to client's timezone for date
    const clientTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    // Create date object for today in client's timezone
    const today = new Date(clientTime);
    today.setHours(0, 0, 0, 0);

    // 3. Check for recent check-in (10-minute cooldown)
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const recentCheckin = await prisma.managerCheckin.findFirst({
      where: {
        managerId: manager.id,
        clientId: parseInt(clientId),
        checkInAt: {
          gte: tenMinutesAgo
        }
      },
      orderBy: {
        checkInAt: 'desc'
      }
    });

    if (recentCheckin) {
      const timeSinceLastCheckin = Math.floor((now - recentCheckin.checkInAt) / 1000 / 60);
      const minutesLeft = 10 - timeSinceLastCheckin;
      return res.status(400).json({ 
        message: `Please wait ${minutesLeft} more minutes before checking in again at this location.`,
        lastCheckin: recentCheckin.checkInAt,
        cooldownMinutes: minutesLeft
      });
    }

    // 4. Get today's check-ins count for visit number
    const todaysCheckins = await prisma.managerCheckin.findMany({
      where: { 
        managerId: manager.id, 
        clientId: parseInt(clientId),
        date: today
      },
      orderBy: { checkInAt: 'asc' }
    });

    const visitNumber = todaysCheckins.length + 1;

    // 5. Client verification
    const client = await prisma.clients.findUnique({
      where: { id: parseInt(clientId) },
    });

    if (!client) {
      return res.status(400).json({ message: 'Invalid client ID' });
    }

    // 6. Create check-in record
    const checkin = await prisma.managerCheckin.create({
      data: {
        managerId: manager.id,
        clientId: parseInt(clientId),
        date: today,
        checkInAt: now,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        notes,
        imageUrl,
        visitNumber,
        timezone
      },
    });

    // Format response time in client's timezone
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timezone
    });

    res.status(201).json({ 
      message: `Checked in successfully (Visit #${visitNumber})`,
      checkin: {
        ...checkin,
        formattedTime,
        timezone
      },
      visitNumber
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.checkOut = async (req, res) => {
  const { latitude, longitude } = req.body;
  const managerId = req.user.id;

  try {
    // 1. Manager verification
    const manager = await prisma.manager.findUnique({
      where: { userId: managerId },
    });

    if (!manager) {
      return res.status(400).json({ message: 'Invalid manager ID' });
    }

    const now = new Date();
    const timezone = req.headers['timezone'] || 'UTC';
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // 2. Find the most recent active check-in
    const activeCheckin = await prisma.managerCheckin.findFirst({
      where: {
        managerId: manager.id,
        checkOutAt: null,  // Not checked out yet
      },
      orderBy: {
        checkInAt: 'desc'  // Get the most recent one
      },
      include: {
        client: true  // Include client details
      }
    });

    if (!activeCheckin) {
      return res.status(400).json({ 
        message: 'No active check-in found to check out from' 
      });
    }

    // 3. Check for recent check-out at this location
    const recentCheckout = await prisma.managerCheckin.findFirst({
      where: {
        managerId: manager.id,
        clientId: activeCheckin.clientId,
        checkOutAt: {
          gte: tenMinutesAgo
        }
      }
    });

    if (recentCheckout) {
      const timeSinceLastCheckout = Math.floor((now - recentCheckout.checkOutAt) / 1000 / 60);
      const minutesLeft = 10 - timeSinceLastCheckout;
      return res.status(400).json({ 
        message: `Please wait ${minutesLeft} more minutes before checking out from this location again.`,
        lastCheckout: recentCheckout.checkOutAt,
        cooldownMinutes: minutesLeft
      });
    }

    // 4. Calculate visit duration
    const visitDuration = Math.floor((now - activeCheckin.checkInAt) / 1000 / 60);

    // 5. Prepare update data
    const updateData = {
      checkOutAt: now,
      visitDuration: visitDuration
    };

    // Only add location if provided
    if (latitude !== undefined && longitude !== undefined) {
      updateData.checkoutLatitude = parseFloat(latitude);
      updateData.checkoutLongitude = parseFloat(longitude);
    }

    // 6. Update check-in record
    const updatedCheckin = await prisma.managerCheckin.update({
      where: { id: activeCheckin.id },
      data: updateData
    });

    // 7. Format times in client's timezone
    const formattedCheckInTime = activeCheckin.checkInAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timezone
    });

    const formattedCheckOutTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timezone
    });

    res.status(200).json({
      message: 'Checked out successfully',
      checkin: {
        ...updatedCheckin,
        clientName: activeCheckin.client.name,
        formattedCheckInTime,
        formattedCheckOutTime,
        visitDuration,
        timezone
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add a new endpoint to get client location
exports.getClientLocation = async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await prisma.clients.findUnique({
      where: { id: parseInt(clientId) },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        location: true,
      }
    });
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.status(200).json(client);
  } catch (error) {
    console.error('Error getting client location:', error);
    res.status(500).json({ error: 'Failed to get client location' });
  }
};

exports.getHistory = async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10, filter, startDate, endDate } = req.query;
  const skip = (page - 1) * limit;

  try {
    // First get the manager record
    const manager = await prisma.manager.findUnique({
      where: { userId },
    });

    if (!manager) {
      return res.status(400).json({ message: 'Invalid manager ID' });
    }

    let dateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      // Custom date range
      dateFilter = {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    } else if (filter) {
      const startDate = new Date();
      
      switch (filter) {
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
      }
      
      dateFilter = {
        date: {
          gte: startDate,
          lte: now
        }
      };
    }

    const [history, total] = await Promise.all([
      prisma.managerCheckin.findMany({
        where: {
          managerId: manager.id,
          ...dateFilter
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
        take: parseInt(limit),
        skip: parseInt(skip),
      }),
      prisma.managerCheckin.count({
        where: {
          managerId: manager.id,
          ...dateFilter
        },
      }),
    ]);

    res.json({
      history,
      meta: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
        hasMore: skip + history.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching check-in history:', error);
    res.status(500).json({ error: 'Failed to fetch check-in history' });
  }
};

exports.getTotalWorkingHours = async (req, res) => {
  const userId = req.user.id;
  const { period } = req.query; // 'today', 'week', 'month', or 'all'

  try {
    // First get the manager record
    const manager = await prisma.manager.findUnique({
      where: { userId },
    });

    if (!manager) {
      return res.status(400).json({ message: 'Invalid manager ID' });
    }

    let dateFilter = {};
    const now = new Date();
    
    if (period) {
      const startDate = new Date();
      
      switch (period) {
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
      }
      
      dateFilter = {
        date: {
          gte: startDate,
          lte: now
        }
      };
    }

    const checkins = await prisma.managerCheckin.findMany({
      where: {
        managerId: manager.id,
        checkOutAt: { not: null }, // Only count completed check-ins
        ...dateFilter
      },
      select: {
        checkInAt: true,
        checkOutAt: true,
      },
    });

    let totalMinutes = 0;
    let completedVisits = 0;

    checkins.forEach(checkin => {
      if (checkin.checkInAt && checkin.checkOutAt) {
        const duration = checkin.checkOutAt.getTime() - checkin.checkInAt.getTime();
        totalMinutes += duration / (1000 * 60); // Convert milliseconds to minutes
        completedVisits++;
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    res.json({
      totalHours: hours,
      totalMinutes: minutes,
      completedVisits,
      formattedDuration: `${hours}h ${minutes}m`,
    });
  } catch (error) {
    console.error('Error calculating working hours:', error);
    res.status(500).json({ error: 'Failed to calculate working hours' });
  }
};