const prisma = require('../lib/prisma');

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

    // If routeId is provided, validate and update client's route
    if (routeId) {
      const route = await prisma.routes.findUnique({
        where: { id: parseInt(routeId) },
      });

      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      // Update client's route
      await prisma.clients.update({
        where: { id: parseInt(clientId) },
        data: {
          route_id: parseInt(routeId),
          route_name: route.name,
        },
      });
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

    // Create the journey plan
    const journeyPlan = await prisma.journeyPlan.create({
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
const getJourneyPlans = async (req, res) => {
  try {
    const salesRepId = getSalesRepId(req);
    const { page = 1, limit = 10 } = req.query;

    const journeyPlans = await prisma.journeyPlan.findMany({
      where: { userId: salesRepId },
      include: {
        client: true,
      },
      orderBy: {
        date: 'desc'
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const totalJourneyPlans = await prisma.journeyPlan.count({
      where: { userId: salesRepId },
    });

    res.status(200).json({
      success: true,
      data: journeyPlans,
      pagination: {
        total: totalJourneyPlans,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalJourneyPlans / parseInt(limit)),
      },
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
  const { journeyId } = req.params;
  const { 
    clientId, 
    status, 
    checkInTime, 
    latitude, 
    longitude, 
    imageUrl, 
    notes,
    checkoutTime,
    checkoutLatitude,
    checkoutLongitude,
    showUpdateLocation 
  } = req.body;

  // Log request details for debugging
  console.log('[CHECKOUT LOG] Updating journey plan:', { 
    journeyId, clientId, status, checkInTime, 
    latitude, longitude, imageUrl, notes,
    checkoutTime, checkoutLatitude, checkoutLongitude,
    showUpdateLocation
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

    // Update the journey plan
    const updatedJourneyPlan = await prisma.journeyPlan.update({
      where: { id: parseInt(journeyId) },
      data: {
        status: status !== undefined ? STATUS_MAP[status] : existingJourneyPlan.status,
        checkInTime: checkInTime ? new Date(checkInTime) : undefined,
        latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
        longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
        imageUrl: imageUrl,
        notes: notes,
        checkoutTime: checkoutTime ? new Date(checkoutTime) : undefined,
        checkoutLatitude: checkoutLatitude !== undefined ? parseFloat(checkoutLatitude) : undefined,
        checkoutLongitude: checkoutLongitude !== undefined ? parseFloat(checkoutLongitude) : undefined,
        showUpdateLocation: showUpdateLocation !== undefined ? Boolean(showUpdateLocation) : undefined,
        client: clientId ? {
          connect: { id: parseInt(clientId) }
        } : undefined
      },
      include: {
        client: true,
      },
    });

    res.status(200).json(updatedJourneyPlan);
  } catch (error) {
    console.error('Error updating journey plan:', error);
    res.status(500).json({ 
      error: 'Failed to update journey plan',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { createJourneyPlan, getJourneyPlans, updateJourneyPlan };