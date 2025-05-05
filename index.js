require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const prisma = require('./lib/prisma');

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
const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

console.log('Static file path configured:', path.join(__dirname, '../uploads'));

// Default Route
app.get('/', (req, res) => res.json({ message: 'Welcome to the API' }));

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
