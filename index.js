require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const prisma = require('./lib/prisma');
const cron = require('node-cron');
const cleanupTokens = require('./scripts/cleanup-tokens');
const { handleTokenRefresh } = require('./middleware/authMiddleware');
const { 
  getEmergencyModeStatus, 
  getEmergencyUsageStats,
  triggerEmergencyMode, 
  disableEmergencyMode 
} = require('./middleware/authMiddleware');
const { 
  timeoutMiddleware, 
  performanceMiddleware, 
  healthCheck, 
  rateLimitMiddleware 
} = require('./middleware/resilienceMiddleware');
const { checkDatabaseHealth } = require('./lib/connectionManager');

// Debug cron package
console.log('📦 Cron package loaded:', cron ? 'Yes' : 'No');
console.log('🕒 Current time:', new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }));

const productReturnRoutes = require('./routes/productReturnRoutes');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const journeyPlanRoutes = require('./routes/journeyPlanRoutes');
const checkinRoutes = require('./routes/checkinRoutes');
const officeRoutes = require('./routes/officeRoutes');
const outletRoutes = require('./routes/outletRoutes');
const noticeBoardRoutes = require('./routes/noticeBoardRoutes');
const productRoutes = require('./routes/productRoutes');
const reportRoutes = require('./routes/reportRoutes');
const leaveRoutes = require('./routes/leave.routes');
const uploadRoutes = require('./routes/uploadRoutes');
const profileRoutes = require('./routes/profileRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const upliftSalesRoutes = require('./routes/upliftSalesRoutes');
const excelImportRoutes = require('./routes/excelImport');
const taskRoutes = require('./routes/taskRoutes');
const storeRoutes = require('./routes/storeRoutes');
const targetRoutes = require('./routes/targetRoutes');
const routeRoutes = require('./routes/routeRoutes');

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Add resilience middleware
app.use(timeoutMiddleware(30000)); // 30 second timeout
app.use(performanceMiddleware()); // Performance monitoring
app.use(rateLimitMiddleware); // Rate limiting

// Auto-logout Cron Job at midnight Africa/Nairobi time
console.log('🔄 Setting up auto-logout cron job...');
const logoutJob = cron.schedule('0 0 * * *', async () => {
  const now = new Date();
  console.log(`⏰ Running auto-logout job at ${now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`);

  try {
    // Process tokens in batches of 100
    const BATCH_SIZE = 100;
    let processedCount = 0;
    let hasMore = true;

    while (hasMore) {
      // Get a batch of non-blacklisted tokens
      const tokens = await prisma.token.findMany({
        where: {
          blacklisted: false,
          expiresAt: {
            gt: new Date()
          }
        },
        take: BATCH_SIZE,
        select: {
          id: true
        }
      });

      if (tokens.length === 0) {
        hasMore = false;
        continue;
      }

      // Blacklist the batch
      const result = await prisma.token.updateMany({
        where: {
          id: {
            in: tokens.map(t => t.id)
          }
        },
        data: {
          blacklisted: true
        }
      });

      processedCount += result.count;
      console.log(`✅ Processed batch of ${result.count} tokens`);

      // Add a small delay between batches to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ Successfully blacklisted ${processedCount} tokens in total`);
  } catch (err) {
    console.error('❌ Error blacklisting tokens:', err);
  }
}, {
  timezone: 'Africa/Nairobi'
});

// Token Cleanup Cron Job at 2 AM Africa/Nairobi time
console.log('🧹 Setting up token cleanup cron job...');
const cleanupJob = cron.schedule('0 2 * * *', async () => {
  const now = new Date();
  console.log(`🧹 Running token cleanup job at ${now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`);
  
  try {
    await cleanupTokens();
  } catch (err) {
    console.error('❌ Error during token cleanup:', err);
  }
}, {
  timezone: 'Africa/Nairobi'
});

// Debug job status
console.log('✅ Auto-logout cron job has been set up');
console.log('✅ Token cleanup cron job has been set up');
console.log('📋 Logout job is running:', logoutJob.running);
console.log('📋 Cleanup job is running:', cleanupJob.running);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

console.log('Static file path configured:', path.join(__dirname, '../uploads'));

// Default Route
app.get('/', (req, res) => res.json({ message: 'Welcome to the API' }));

// Health check endpoint
app.get('/health', healthCheck);

// Database health check endpoint
app.get('/health/database', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.json({
      database: dbHealth,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      database: { status: 'error', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

// Emergency mode endpoints (⚠️ RISKY - Use with caution)
app.get('/emergency/status', (req, res) => {
  const status = getEmergencyModeStatus();
  res.json({
    emergency_mode: status,
    warning: 'Emergency mode bypasses all authentication - use only in critical situations',
    timestamp: new Date().toISOString()
  });
});

app.get('/emergency/stats', (req, res) => {
  // Add basic protection - check for admin secret
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ 
      error: 'Unauthorized',
      message: 'Admin secret required to view emergency stats'
    });
  }
  
  const stats = getEmergencyUsageStats();
  res.json({
    emergency_stats: stats,
    warning: '⚠️ Emergency mode usage statistics - monitor for security issues',
    timestamp: new Date().toISOString()
  });
});

// Manual emergency mode control (⚠️ VERY RISKY - Admin only)
app.post('/emergency/trigger', (req, res) => {
  // Add basic protection - check for admin secret
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ 
      error: 'Unauthorized',
      message: 'Admin secret required to trigger emergency mode'
    });
  }
  
  const result = triggerEmergencyMode();
  res.json({
    ...result,
    warning: '⚠️ Emergency mode activated - all requests will bypass authentication',
    timestamp: new Date().toISOString()
  });
});

app.post('/emergency/disable', (req, res) => {
  // Add basic protection - check for admin secret
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ 
      error: 'Unauthorized',
      message: 'Admin secret required to disable emergency mode'
    });
  }
  
  const result = disableEmergencyMode();
  res.json({
    ...result,
    message: '✅ Emergency mode disabled - normal authentication restored',
    timestamp: new Date().toISOString()
  });
});

// Apply token refresh middleware to all API routes (before route definitions)
app.use('/api', handleTokenRefresh);

// Route Prefixing
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/journey-plans', journeyPlanRoutes);
app.use('/api/outlets', outletRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/office', officeRoutes);
app.use('/api/notice-board', noticeBoardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/product-returns', productReturnRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api', uploadRoutes);
app.use('/api', profileRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/uplift-sales', upliftSalesRoutes);
app.use('/api/excel', excelImportRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/routes', routeRoutes);

// Handle 404 Errors
app.use((req, res, next) => {
  const error = new Error('Not found');
  error.status = 404;
  next(error);
});

// Error Handling Middleware
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: { message: error.message } });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));

// Graceful Shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down server...');
  
  // Close the server
  server.close(() => {
    console.log('Server closed');
  });
  
  // Disconnect from the database
  try {
    await prisma.disconnect();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error disconnecting from database:', error);
  }
  
  // Exit the process
  process.exit(0);
};

// Handle termination signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
