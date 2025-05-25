const { DateTime } = require('luxon');
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
  console.log('[DEBUG] Starting recordLogin', {
    serverTime: DateTime.now().toISO(),
    serverTZ: DateTime.now().zoneName
  });

  try {
    const { userId, clientTime } = req.body;
    const timezone = req.headers['timezone'] || 'Africa/Nairobi';

    // Validate timezone format
    if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone)) {
      return res.status(400).json({ error: 'Invalid IANA timezone format' });
    }

    // Parse with strict timezone handling
    const userLoginTime = DateTime.fromISO(clientTime, { 
      zone: timezone,
      setZone: true 
    });

    if (!userLoginTime.isValid) {
      return res.status(400).json({
        error: 'Invalid time format',
        received: clientTime,
        expectedFormat: 'ISO8601 with timezone'
      });
    }

    // Calculate shift times in user's timezone
    const shiftStart = userLoginTime.set({
      hour: SHIFT_START_HOUR,
      minute: SHIFT_START_MINUTE,
      second: 0
    });

    const shiftEnd = userLoginTime.set({
      hour: SHIFT_END_HOUR,
      minute: SHIFT_END_MINUTE,
      second: 0
    });

    // Determine punctuality
    const isLate = userLoginTime > shiftStart.plus({ minutes: LATE_THRESHOLD_MINUTES });
    const isEarly = userLoginTime < shiftStart;

    // Create database record
    const loginRecord = await prisma.loginHistory.create({
      data: {
        userId: parseInt(userId),
        loginAt: userLoginTime.toUTC().toJSDate(), // UTC for queries
        sessionStart: userLoginTime.toFormat('yyyy-MM-dd HH:mm:ss'), // Local time string
        timezone,
        shiftStart: shiftStart.toUTC().toJSDate(),
        shiftEnd: shiftEnd.toUTC().toJSDate(),
        isLate,
        isEarly,
        status: isLate ? 'LATE' : isEarly ? 'EARLY' : 'ON_TIME'
      },
      include: { user: true }
    });

    // Debug output with time context
    console.log('[DEBUG] Time storage verification:', {
      input: clientTime,
      stored: {
        utc: loginRecord.loginAt,
        local: loginRecord.sessionStart,
        timezone: loginRecord.timezone
      },
      comparisons: {
        isLate,
        thresholdMinutes: LATE_THRESHOLD_MINUTES,
        localShift: `${SHIFT_START_HOUR}:${String(SHIFT_START_MINUTE).padStart(2, '0')}`
      }
    });

    res.status(201).json({
      success: true,
      record: {
        ...loginRecord,
        // Frontend can directly use sessionStart without conversion
        localTime: loginRecord.sessionStart,
        timezone: loginRecord.timezone
      }
    });

  } catch (error) {
    console.error('[ERROR]', {
      timestamp: DateTime.now().toISO(),
      error: error.message,
      stack: error.stack,
      requestDetails: {
        body: req.body,
        headers: req.headers
      }
    });
    res.status(500).json({ 
      error: 'Login recording failed',
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message 
      })
    });
  }
};

// Record user logout
const recordLogout = async (req, res) => {
  console.log('[DEBUG] Starting recordLogout', {
    serverTime: DateTime.now().toISO(),
    serverTZ: DateTime.now().zoneName
  });

  try {
    const { userId } = req.body;
    const timezone = req.headers['timezone'] || 'Africa/Nairobi';

    // Find active session (including timezone context)
    const activeSession = await prisma.loginHistory.findFirst({
      where: {
        userId: parseInt(userId),
        logoutAt: null
      },
      include: { user: true }
    });

    if (!activeSession) {
      console.error('[ERROR] No active session found for user:', userId);
      return res.status(404).json({ 
        error: 'No active session found',
        userId 
      });
    }

    // Parse times with proper timezone handling
    const loginTime = DateTime.fromJSDate(activeSession.loginAt, { zone: activeSession.timezone });
    const logoutTime = DateTime.now().setZone(timezone);
    const shiftEnd = DateTime.fromJSDate(activeSession.shiftEnd, { zone: activeSession.timezone });

    // Calculate timing status
    const earlyThreshold = shiftEnd.minus({ minutes: EARLY_LOGOUT_THRESHOLD_MINUTES });
    const overtimeThreshold = shiftEnd.plus({ minutes: OVERTIME_THRESHOLD_MINUTES });
    
    const isEarly = logoutTime < earlyThreshold;
    const isOvertime = logoutTime > overtimeThreshold;
    const durationMinutes = Math.floor(logoutTime.diff(loginTime, 'minutes').minutes);

    // Determine comprehensive status
    let status;
    if (activeSession.status === 'LATE' && isEarly) {
      status = 'LATE_EARLY';
    } else if (activeSession.status === 'LATE') {
      status = 'LATE_REGULAR';
    } else if (isEarly) {
      status = 'EARLY';
    } else if (isOvertime) {
      status = 'OVERTIME';
    } else {
      status = 'REGULAR';
    }

    // Update session record
    const updatedSession = await prisma.loginHistory.update({
      where: { id: activeSession.id },
      data: {
        logoutAt: logoutTime.toUTC().toJSDate(),
        sessionEnd: logoutTime.toFormat('yyyy-MM-dd HH:mm:ss'), // Local time string
        isEarly,
        
        duration: durationMinutes,
        status
      }
    });

    console.log('[DEBUG] Logout recorded:', {
      userId,
      loginTime: loginTime.toISO(),
      logoutTime: logoutTime.toISO(),
      timezone,
      duration: `${Math.floor(durationMinutes/60)}h ${durationMinutes%60}m`,
      status
    });

    res.status(200).json({
      success: true,
      localTime: updatedSession.sessionEnd,
      timezone,
      duration: durationMinutes,
      status,
      isEarly,
      isOvertime
    });

  } catch (error) {
    console.error('[ERROR] Logout failed:', {
      time: DateTime.now().toISO(),
      error: error.message,
      stack: error.stack,
      request: {
        body: req.body,
        headers: req.headers
      }
    });
    res.status(500).json({ 
      error: 'Logout recording failed',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
};

// // Get user's session history
// const { DateTime } = require('luxon');

const getSessionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
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

    const formattedSessions = sessions.map(session => {
      // Calculate duration using the most accurate available time fields
      let duration = null;
      let durationMinutes = null;

      // Case 1: Both sessionStart and sessionEnd exist (preferred)
      if (session.sessionStart && session.sessionEnd) {
        const start = DateTime.fromFormat(session.sessionStart, 'yyyy-MM-dd HH:mm:ss', { 
          zone: session.timezone || 'UTC' 
        });
        const end = DateTime.fromFormat(session.sessionEnd, 'yyyy-MM-dd HH:mm:ss', { 
          zone: session.timezone || 'UTC' 
        });
        durationMinutes = end.diff(start, 'minutes').minutes;
      }
      // Case 2: Only sessionStart exists
      else if (session.sessionStart && session.logoutAt) {
        const start = DateTime.fromFormat(session.sessionStart, 'yyyy-MM-dd HH:mm:ss', { 
          zone: session.timezone || 'UTC' 
        });
        const end = DateTime.fromJSDate(session.logoutAt).setZone(session.timezone || 'UTC');
        durationMinutes = end.diff(start, 'minutes').minutes;
      }
      // Case 3: Only sessionEnd exists
      else if (session.sessionEnd && session.loginAt) {
        const start = DateTime.fromJSDate(session.loginAt).setZone(session.timezone || 'UTC');
        const end = DateTime.fromFormat(session.sessionEnd, 'yyyy-MM-dd HH:mm:ss', { 
          zone: session.timezone || 'UTC' 
        });
        durationMinutes = end.diff(start, 'minutes').minutes;
      }
      // Case 4: Fallback to loginAt/logoutAt
      else if (session.loginAt && session.logoutAt) {
        const start = DateTime.fromJSDate(session.loginAt);
        const end = DateTime.fromJSDate(session.logoutAt);
        durationMinutes = end.diff(start, 'minutes').minutes;
      }

      // Format duration if calculated
      if (durationMinutes !== null) {
        const absMinutes = Math.abs(durationMinutes);
        const hours = Math.floor(absMinutes / 60);
        const mins = absMinutes % 60;
        duration = `${durationMinutes < 0 ? '-' : ''}${hours}h ${mins}m`;
      }

      return {
        ...session,
        duration,
        status: session.status === '1' ? 'Early' : 
               session.status === '2' ? 'Overtime' : 
               session.isLate ? 'Late' : 'On Time',
        // Add these flags to help debug time sources
        _timeSource: session.sessionStart && session.sessionEnd ? 'sessionTimes' :
                    session.sessionStart || session.sessionEnd ? 'mixedTimes' : 'utcTimes'
      };
    });

    res.status(200).json({
      userId,
      totalSessions: sessions.length,
      sessions: formattedSessions
    });

  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: 'Failed to fetch session history' });
  }
};

// Helper function to format duration
function formatDuration(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Helper function to determine status label
function determineStatus(session) {
  switch (session.status) {
    case '1': return 'Early';
    case '2': return 'Overtime';
    case 'LATE': return 'Late';
    case 'EARLY': return 'Early';
    case 'ON_TIME': return 'On Time';
    default: 
      if (session.isLate) return 'Late';
      if (session.isEarly) return 'Early';
      return 'On Time';
  }
}

module.exports = {
  recordLogin,
  recordLogout,
  getSessionHistory
}; 