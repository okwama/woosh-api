const { getPrismaClient } = require('../lib/prisma');
const prisma = getPrismaClient();

// Constants for shift times
const SHIFT_START_HOUR = 9;
const SHIFT_START_MINUTE = 0;
const SHIFT_END_HOUR = 18; // 6 PM
const SHIFT_END_MINUTE = 0;
const LATE_THRESHOLD_MINUTES = 5;
const EARLY_LOGOUT_THRESHOLD_MINUTES = 30;
const OVERTIME_THRESHOLD_MINUTES = 30; // Consider overtime after 30 minutes past shift end

// Helper function to create a date with specific time
const createTime = (date, hours, minutes) => {
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
};

// Check for consecutive late logins and update user status
const checkConsecutiveLateLogins = async (userId) => {
  try {
    // Get the last 4 days of login history
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    
    const recentLogins = await prisma.loginHistory.findMany({
      where: {
        userId: parseInt(userId),
        loginAt: {
          gte: fourDaysAgo
        }
      },
      orderBy: {
        loginAt: 'asc'
      }
    });

    // Group logins by day
    const loginsByDay = {};
    recentLogins.forEach(login => {
      const date = login.loginAt.toISOString().split('T')[0];
      if (!loginsByDay[date]) {
        loginsByDay[date] = [];
      }
      loginsByDay[date].push(login);
    });

    // Check for consecutive late days
    let consecutiveLateDays = 0;
    const dates = Object.keys(loginsByDay).sort();
    
    for (let i = 0; i < dates.length; i++) {
      const dayLogins = loginsByDay[dates[i]];
      const hasLateLogin = dayLogins.some(login => login.isLate);
      
      if (hasLateLogin) {
        consecutiveLateDays++;
      } else {
        consecutiveLateDays = 0;
      }
    }

    // If 3 consecutive late days found, disable the account
    if (consecutiveLateDays >= 3) {
      const user = await prisma.salesRep.findUnique({
        where: { id: parseInt(userId) }
      });

      if (user) {
        // Update user status and disable account
        await prisma.salesRep.update({
          where: { id: parseInt(userId) },
          data: {
            status: 4,
            role: 'DISABLED'
          }
        });

        return {
          updated: true,
          newStatus: 4,
          role: 'DISABLED',
          message: 'Account disabled due to 3 consecutive late logins'
        };
      }
    }

    return {
      updated: false,
      consecutiveLateDays,
      message: consecutiveLateDays > 0 
        ? `${consecutiveLateDays} consecutive late days`
        : 'No consecutive late days found'
    };
  } catch (error) {
    console.error('Error checking consecutive late logins:', error);
    throw error;
  }
};

// Record user login
const recordLogin = async (req, res) => {
  try {
    const { userId } = req.body;
    const timezone = req.headers['timezone'] || 'Africa/Johannesburg'; // Default to South Africa time (UTC+2)

    const now = new Date();

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log('Attempting to record login for user:', userId);
    console.log('Using timezone:', timezone);

    // Validate user exists
    const user = await prisma.salesRep.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has an active session
    const activeSession = await prisma.loginHistory.findFirst({
      where: {
        userId: parseInt(userId),
        logoutAt: null
      }
    });

    if (activeSession) {
      console.log('User already has an active session:', activeSession.id);
      return res.status(400).json({ 
        error: 'User already has an active session',
        sessionId: activeSession.id
      });
    }

    // Get current time in GMT+3
    const gmt3Time = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
    console.log('GMT+3 time:', gmt3Time.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }));

    // Convert server time to client timezone
    const clientTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    console.log('Client time:', clientTime.toLocaleString('en-KE', { timeZone: timezone }));

    // Calculate time difference between GMT+3 and client time
    const timeDiff = Math.abs(gmt3Time.getTime() - clientTime.getTime());
    const maxAllowedDiff = 5 * 60 * 1000;

    if (timeDiff > maxAllowedDiff) {
      console.error('Time discrepancy detected:', {
        gmt3Time: gmt3Time.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
        clientTime: clientTime.toLocaleString('en-KE', { timeZone: timezone }),
        difference: timeDiff / 1000 / 60 + ' minutes'
      });
      return res.status(400).json({
        error: 'Time discrepancy detected',
        details: {
          gmt3Time: gmt3Time.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
          clientTime: clientTime.toLocaleString('en-KE', { timeZone: timezone }),
          difference: timeDiff / 1000 / 60 + ' minutes',
          message: 'Client time must be within 5 minutes of GMT+3'
        }
      });
    }

    // Calculate shift times in client's timezone
    const shiftStart = createTime(clientTime, SHIFT_START_HOUR, SHIFT_START_MINUTE);
    const shiftEnd = createTime(clientTime, SHIFT_END_HOUR, SHIFT_END_MINUTE);

    console.log('Shift start:', shiftStart.toLocaleString('en-KE', { timeZone: timezone }));
    console.log('Shift end:', shiftEnd.toLocaleString('en-KE', { timeZone: timezone }));

    // Check if login is within allowed time
    const isLate = clientTime > new Date(shiftStart.getTime() + LATE_THRESHOLD_MINUTES * 60000);
    console.log('Is late:', isLate);

    // Create login record with client time
    const loginRecord = await prisma.loginHistory.create({
      data: {
        userId: parseInt(userId),
        loginAt: clientTime,
        timezone,
        shiftStart,
        shiftEnd,
        isLate,
        status: isLate ? '0' : '1'
      }
    });

    // Check for consecutive late logins if this login is late
    if (isLate) {
      const lateCheckResult = await checkConsecutiveLateLogins(userId);
      console.log('Late login check result:', lateCheckResult);
    }

    console.log('Login recorded successfully:', loginRecord.id);

    res.status(201).json({
      message: 'Login recorded successfully',
      loginRecord,
      isLate,
      shiftStart: shiftStart.toLocaleString('en-KE', { timeZone: timezone }),
      shiftEnd: shiftEnd.toLocaleString('en-KE', { timeZone: timezone }),
      clientTime: clientTime.toLocaleString('en-KE', { timeZone: timezone }),
      gmt3Time: gmt3Time.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
      timezone
    });
  } catch (error) {
    console.error('Error recording login:', error);
    res.status(500).json({ 
      error: 'Failed to record login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Record user logout
const recordLogout = async (req, res) => {
  try {
    const { userId } = req.body;
    const timezone = req.headers['timezone'] || 'Africa/Nairobi';
    const now = new Date();

    // Find active session
    const activeSession = await prisma.loginHistory.findFirst({
      where: {
        userId: parseInt(userId),
        logoutAt: null
      }
    });

    if (!activeSession) {
      return res.status(404).json({ error: 'No active session found' });
    }

    // Calculate shift end time in user's timezone
    const clientTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const shiftEnd = createTime(clientTime, SHIFT_END_HOUR, SHIFT_END_MINUTE);

    // Check if logout is before shift end
    const isEarly = clientTime < new Date(shiftEnd.getTime() - EARLY_LOGOUT_THRESHOLD_MINUTES * 60000);
    
    // Check if logout is after overtime threshold
    const isOvertime = clientTime > new Date(shiftEnd.getTime() + OVERTIME_THRESHOLD_MINUTES * 60000);

    // Calculate session duration in minutes
    const duration = Math.floor((now - activeSession.loginAt) / (1000 * 60));

    // Determine status based on logout time
    let status;
    if (isEarly) {
      status = '1'; // Early logout
    } else if (isOvertime) {
      status = '2'; // Overtime
    } else {
      status = '0'; // On time
    }

    // Update login record
    const updatedSession = await prisma.loginHistory.update({
      where: { id: activeSession.id },
      data: {
        logoutAt: now,
        isEarly,
        duration,
        status
      }
    });

    res.status(200).json({
      message: 'Logout recorded successfully',
      session: updatedSession,
      isEarly,
      isOvertime,
      duration: `${Math.floor(duration / 60)}h ${duration % 60}m`
    });
  } catch (error) {
    console.error('Error recording logout:', error);
    res.status(500).json({ error: 'Failed to record logout' });
  }
};

// Get user's session history
const getSessionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter if provided
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        loginAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }

    const sessions = await prisma.loginHistory.findMany({
      where: {
        userId: parseInt(userId),
        ...dateFilter
      },
      orderBy: {
        loginAt: 'desc'
      }
    });

    res.status(200).json({
      userId,
      totalSessions: sessions.length,
      sessions: sessions.map(session => ({
        ...session,
        duration: session.duration ? `${Math.floor(session.duration / 60)}h ${session.duration % 60}m` : null,
        status: session.status === '1' ? 'Early' : 
                session.status === '2' ? 'Overtime' : 
                session.isLate ? 'Late' : 'On Time'
      }))
    });
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: 'Failed to fetch session history' });
  }
};

module.exports = {
  recordLogin,
  recordLogout,
  getSessionHistory
}; 