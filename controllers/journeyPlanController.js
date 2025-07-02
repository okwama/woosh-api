const prisma = require('../lib/prisma');
const multer = require('multer');
const path = require('path');
const { uploadFile } = require('../lib/uploadService');
const { retryOperation } = require('../lib/retryService');
const { withConnectionRetry } = require('../lib/connectionManager');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG and PNG files are allowed.'));
    }
  }
}).single('image');

// Ensure salesRepId is not null
const getSalesRepId = (req) => {
  if (!req.user || !req.user.id) {
    throw new Error('SalesRep authentication required');
  }
  return req.user.id;
};

// Create a new journey plan
const createJourneyPlan = async (req, res) => {
  try {
    const { clientId, date, notes, showUpdateLocation, routeId } = req.body;
    const salesRepId = req.user.id;

    console.log('Creating journey plan with:', { clientId, date, salesRepId, notes, showUpdateLocation, routeId });

    // Input validation
    if (!clientId) {
      return res.status(400).json({ error: 'Missing required field: clientId' });
    }

    if (!date) {
      return res.status(400).json({ error: 'Missing required field: date' });
    }

    // Check if the client exists
    const client = await prisma.clients.findUnique({
      where: { id: parseInt(clientId) },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Parse the date from ISO string
    let journeyDate;
    try {
      journeyDate = new Date(date);
      if (isNaN(journeyDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
    } catch (error) {
      console.error('Date parsing error:', error);
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Validate that the date is not in the past
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (journeyDate < now) {
      return res.status(400).json({ error: 'Journey date cannot be in the past' });
    }

    // Extract time from the date in HH:MM format
    const time = journeyDate.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    // Create the journey plan atomically with route updates
    const journeyPlan = await prisma.$transaction(async (tx) => {
      // If routeId is provided, validate and update client's route first
      if (routeId) {
        const route = await tx.routes.findUnique({
          where: { id: parseInt(routeId) },
        });

        if (!route) {
          throw new Error('Route not found');
        }

        // Update client's route
        await tx.clients.update({
          where: { id: parseInt(clientId) },
          data: {
            route_id_update: parseInt(routeId),
            route_name_update: route.name,
          },
        });
        
        await tx.salesRep.update({
          where: { id: salesRepId },
          data: {
            route_id_update: parseInt(routeId),
            route_name_update: route.name,
          },
        });
      }

      // Create the journey plan
      return await tx.journeyPlan.create({
        data: {
          date: journeyDate,
          time: time,
          userId: salesRepId,
          clientId: parseInt(clientId),
          status: 0,
          notes: notes,
          showUpdateLocation: showUpdateLocation ?? true,
          routeId: routeId ? parseInt(routeId) : null,
        },
        include: {
          client: true,
          route: true,
        },
      });
    }, {
      maxWait: 5000, // 5 second max wait
      timeout: 10000  // 10 second timeout
    });

    console.log('Journey plan created successfully:', journeyPlan);
    res.status(201).json(journeyPlan);
  } catch (error) {
    console.error('Error creating journey plan:', error);
    res.status(500).json({ 
      error: 'Failed to create journey plan',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all journey plans for the authenticated sales rep with client details
// This function only fetches journey plans for the current day
const getJourneyPlans = async (req, res) => {
  try {
    const salesRepId = getSalesRepId(req);

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Default limit to 20
    const skip = (page - 1) * limit;

    // Get timezone from query params or use Nairobi as default
    const timezone = req.query.timezone || 'Africa/Nairobi';
    
    // Get the current date in the specified timezone
    const now = new Date();
    const today = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log(`Fetching journey plans for sales rep ${salesRepId} on ${today.toISOString().split('T')[0]} in timezone ${timezone}`);
    console.log(`Date range: ${today.toISOString()} to ${tomorrow.toISOString()}`);

    const whereClause = {
      userId: salesRepId,
      date: {
        gte: today,
        lt: tomorrow,
      },
      client: {
        id: {
          gt: 0,
        },
      },
    };

    const journeyPlans = await prisma.journeyPlan.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: {
        client: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    const totalJourneyPlans = await prisma.journeyPlan.count({ where: whereClause });

    console.log(`Found ${journeyPlans.length} of ${totalJourneyPlans} journey plans for today`);
    
    // Log the dates of found journey plans for debugging
    if (journeyPlans.length > 0) {
      console.log('Journey plan dates:', journeyPlans.map(jp => jp.date.toISOString().split('T')[0]));
    }
    
    res.status(200).json({ 
      success: true, 
      data: journeyPlans,
      pagination: {
        total: totalJourneyPlans,
        page,
        limit,
        totalPages: Math.ceil(totalJourneyPlans / limit),
      }
    });
  } catch (error) {
    console.error('Error fetching journey plans:', error);
    
    if (error.message === 'SalesRep authentication required') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch journey plans',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update a journey plan
const updateJourneyPlan = async (req, res) => {
  // Handle both multipart form data and regular JSON
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { journeyId } = req.params;
    const { 
      clientId, 
      status, 
      checkInTime, 
      latitude, 
      longitude, 
      imageUrl: providedImageUrl, 
      notes,
      checkoutTime,
      checkoutLatitude,
      checkoutLongitude,
      showUpdateLocation 
    } = req.body;

    // Log request details for debugging
    console.log('[CHECKOUT LOG] Updating journey plan:', { 
      journeyId, clientId, status, checkInTime, 
      latitude, longitude, notes,
      checkoutTime, checkoutLatitude, checkoutLongitude,
      showUpdateLocation,
      hasFile: !!req.file,
      providedImageUrl
    });

    try {
      // Validate required params
      if (!journeyId) {
        return res.status(400).json({ error: 'Missing required field: journeyId' });
      }

      // Get the authenticated sales rep
      const salesRepId = req.user.id;

      // Status mapping
      const STATUS_MAP = {
        'pending': 0,
        'checked_in': 1,
        'in_progress': 2,
        'completed': 3,
        'cancelled': 4
      };

      const REVERSE_STATUS_MAP = {
        0: 'pending',
        1: 'checked_in',
        2: 'in_progress',
        3: 'completed',
        4: 'cancelled'
      };

      // Check if the journey plan exists and belongs to the sales rep
      const existingJourneyPlan = await prisma.journeyPlan.findUnique({
        where: { id: parseInt(journeyId) },
      });

      if (!existingJourneyPlan) {
        return res.status(404).json({ error: 'Journey plan not found' });
      }

      if (existingJourneyPlan.userId !== salesRepId) {
        return res.status(403).json({ error: 'Unauthorized to update this journey plan' });
      }

      // Add validation for status transitions if needed
      const currentStatus = REVERSE_STATUS_MAP[existingJourneyPlan.status];
      
      // Log status change if applicable
      if (status !== undefined && status !== existingJourneyPlan.status) {
        console.log(`Status change: ${currentStatus} -> ${REVERSE_STATUS_MAP[status]}`);
      }

      // Handle image upload if present (only for check-in, not checkout)
      let finalImageUrl = undefined;
      if (req.file && status !== 'completed') {
        try {
          console.log('Processing checkin image:', req.file.originalname, req.file.mimetype, req.file.size);
          const result = await uploadFile(req.file, {
            folder: 'whoosh/checkins',
            type: 'image',
            generateThumbnail: true
          });
          finalImageUrl = result.main.url;
          console.log('Checkin image uploaded successfully:', finalImageUrl);
        } catch (uploadError) {
          console.error('Error uploading checkin image:', uploadError);
          return res.status(500).json({ error: 'Failed to upload checkin image' });
        }
      } else if (providedImageUrl && status !== 'completed') {
        // If no file but imageUrl provided, use that (only for check-in)
        finalImageUrl = providedImageUrl;
      }

      // Update the journey plan atomically with fail-safe logic and retry
      let updatedJourneyPlan;
      try {
        updatedJourneyPlan = await retryOperation(async () => {
          return await withConnectionRetry(async () => {
            return await prisma.$transaction(async (tx) => {
              // Get client information for location fallback (only if needed)
              let client = null;
              if (clientId && (checkoutLatitude === undefined || checkoutLongitude === undefined)) {
                client = await tx.clients.findUnique({
                  where: { id: parseInt(clientId) },
                  select: { latitude: true, longitude: true } // Only select what we need
                });
              }

              // Determine checkout location with fallback logic
              let finalCheckoutLat = 0;
              let finalCheckoutLng = 0;

              if (checkoutLatitude !== undefined && checkoutLongitude !== undefined) {
                // Use user's GPS coordinates
                finalCheckoutLat = parseFloat(checkoutLatitude);
                finalCheckoutLng = parseFloat(checkoutLongitude);
              } else if (client && client.latitude && client.longitude) {
                // Use client's stored location as fallback
                finalCheckoutLat = parseFloat(client.latitude);
                finalCheckoutLng = parseFloat(client.longitude);
              }
              // else stays 0,0 (default)

              // Determine checkout time with fallback
              let finalCheckoutTime = null;
              if (checkoutTime) {
                finalCheckoutTime = new Date(checkoutTime);
              } else if (status === 'completed') {
                // For checkout, use current time if not provided
                finalCheckoutTime = new Date();
              }

              // Update the journey plan with fail-safe data
              const updated = await tx.journeyPlan.update({
                where: { id: parseInt(journeyId) },
                data: {
                  // Priority 1: Status update (most important)
                  status: status !== undefined ? STATUS_MAP[status] : existingJourneyPlan.status,
                  
                  // Check-in data (only if not checkout)
                  ...(status !== 'completed' && {
                    checkInTime: checkInTime ? new Date(checkInTime) : undefined,
                    latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
                    longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
                    imageUrl: finalImageUrl,
                  }),
                  
                  // Checkout data (only if checkout)
                  ...(status === 'completed' && {
                    checkoutTime: finalCheckoutTime,
                    checkoutLatitude: finalCheckoutLat,
                    checkoutLongitude: finalCheckoutLng,
                  }),
                  
                  // Common data
                  notes: notes,
                  showUpdateLocation: showUpdateLocation !== undefined ? Boolean(showUpdateLocation) : undefined,
                  client: clientId ? {
                    connect: { id: parseInt(clientId) }
                  } : undefined
                },
                include: {
                  client: true,
                },
              });

              return updated;
            }, {
              maxWait: 10000, // 10 second max wait
              timeout: 30000  // 30 second timeout (increased from 10)
            });
          }, 'journey-plan-update');
        }, 3, 1000); // Retry 3 times with 1 second delay
      } catch (transactionError) {
        console.error('Transaction failed after retries, using fallback update:', transactionError.message);
        
        // Fallback: Update only the critical status field with connection retry
        updatedJourneyPlan = await withConnectionRetry(async () => {
          return await prisma.journeyPlan.update({
            where: { id: parseInt(journeyId) },
            data: {
              // Only update the most critical field - status
              status: status !== undefined ? STATUS_MAP[status] : existingJourneyPlan.status,
            },
            include: {
              client: true,
            },
          });
        }, 'journey-plan-fallback');
        
        console.warn('Used fallback update - only status was updated due to transaction failure');
      }

      console.log('Journey plan updated successfully:', {
        id: updatedJourneyPlan.id,
        status: REVERSE_STATUS_MAP[updatedJourneyPlan.status],
        imageUrl: updatedJourneyPlan.imageUrl,
        checkoutTime: updatedJourneyPlan.checkoutTime,
        checkoutLocation: status === 'completed' ? 
          `${updatedJourneyPlan.checkoutLatitude}, ${updatedJourneyPlan.checkoutLongitude}` : 'N/A'
      });

      res.status(200).json(updatedJourneyPlan);
    } catch (error) {
      console.error('Error updating journey plan:', error);
      res.status(500).json({ 
        error: 'Failed to update journey plan',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
};

// Delete a journey plan with status 0
const deleteJourneyPlan = async (req, res) => {
  const { journeyId } = req.params;

  try {
    // Check if the journey plan exists and has status 0
    const journeyPlan = await prisma.journeyPlan.findUnique({
      where: { id: parseInt(journeyId) },
    });

    if (!journeyPlan) {
      return res.status(404).json({ error: 'Journey plan not found' });
    }

    if (journeyPlan.status !== 0) {
      return res.status(400).json({ error: 'Only pending journey plans (status 0) can be deleted' });
    }

    // Delete the journey plan
    await prisma.journeyPlan.delete({
      where: { id: parseInt(journeyId) },
    });

    res.status(200).json({ message: 'Journey plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting journey plan:', error);
    res.status(500).json({ 
      error: 'Failed to delete journey plan',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { createJourneyPlan, getJourneyPlans, updateJourneyPlan, deleteJourneyPlan };