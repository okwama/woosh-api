const prisma = require('../lib/prisma');

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
    const now = new Date();

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await prisma.salesRep.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const activeSession = await prisma.loginHistory.findFirst({
      where: { userId: parseInt(userId), logoutAt: null }
    });

    if (activeSession) {
      return res.status(400).json({ 
        error: 'User already has an active session',
        sessionId: activeSession.id
      });
    }

    const shiftStart = createTime(now, SHIFT_START_HOUR, SHIFT_START_MINUTE);
    const shiftEnd = createTime(now, SHIFT_END_HOUR, SHIFT_END_MINUTE);
    const isLate = now > new Date(shiftStart.getTime() + LATE_THRESHOLD_MINUTES * 60000);

    const loginRecord = await prisma.loginHistory.create({
      data: {
        userId: parseInt(userId),
        loginAt: now,
        timezone: 'Africa/Johannesburg',
        shiftStart,
        shiftEnd,
        isLate,
        status: isLate ? '0' : '1'
      }
    });

    if (isLate) {
      await checkConsecutiveLateLogins(userId);
    }

    res.status(201).json({
      message: 'Login recorded successfully',
      loginRecord,
      isLate,
      shiftStart,
      shiftEnd,
      loginAt: now
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record login' });
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