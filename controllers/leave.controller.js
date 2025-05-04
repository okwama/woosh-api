const prisma = require('../lib/prisma');
const multer = require('multer');
const path = require('path');
const ImageKit = require('imagekit');

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG & PDF files are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('attachment');

// Helper function to upload file to ImageKit
const uploadToImageKit = async (fileBuffer, fileName, folder) => {
  try {
    console.log('Uploading file to ImageKit:', fileName);
    
    // Upload to ImageKit - using the method that worked in our test
    const result = await imagekit.upload({
      file: fileBuffer,
      fileName: fileName,
      folder: folder
    });
    
    console.log('File uploaded successfully to ImageKit:', result.url);
    return result;
  } catch (error) {
    console.error('ImageKit upload error:', error);
    throw error;
  }
};

// Submit leave application
exports.submitLeave = async (req, res) => {
  try {
    upload(req, res, async function (err) {
      if (err) {
        console.error('File upload error:', err);
        return res.status(400).json({ error: err.message });
      }
      
      console.log('Request body:', req.body);
      
      if (!req.body.leaveType || !req.body.startDate || !req.body.endDate || !req.body.reason) {
        console.error('Missing required fields:', { 
          leaveType: !!req.body.leaveType, 
          startDate: !!req.body.startDate, 
          endDate: !!req.body.endDate, 
          reason: !!req.body.reason 
        });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!req.user) {
        console.error('User not authenticated');
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const userId = req.user.id;
      const { leaveType, startDate, endDate, reason } = req.body;
      let attachmentUrl = null;

      if (req.file) {
        try {
          console.log('Uploading file to ImageKit:', req.file.originalname, req.file.mimetype, req.file.size);
          const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
          const result = await uploadToImageKit(req.file.buffer, uniqueFilename, 'whoosh/leave-documents');
          attachmentUrl = result.url;
          console.log('File uploaded successfully:', attachmentUrl);
        } catch (uploadError) {
          console.error('Error uploading to ImageKit:', uploadError);
          return res.status(500).json({ error: `Failed to upload document: ${uploadError.message}` });
        }
      }

      try {
        console.log('Creating leave record in database with data:', {
          userId,
          leaveType,
          startDate,
          endDate,
          hasAttachment: !!attachmentUrl
        });
        
        const leave = await prisma.leave.create({
          data: {
            userId,
            leaveType,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            reason,
            attachment: attachmentUrl
          }
        });

        console.log('Leave record created successfully:', leave.id);
        res.status(201).json(leave);
      } catch (dbError) {
        console.error('Database error:', dbError);
        res.status(500).json({ error: `Database error: ${dbError.message}` });
      }
    });
  } catch (error) {
    console.error('Unhandled error in submitLeave:', error);
    res.status(500).json({ error: `Failed to submit leave application: ${error.message}` });
  }
};

// Get user's leave applications
exports.getUserLeaves = async (req, res) => {
  try {
    const userId = req.user.id;
    const leaves = await prisma.leave.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leave applications' });
  }
};

// Get all leave applications (for admin)
exports.getAllLeaves = async (req, res) => {
  try {
    const leaves = await prisma.leave.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leave applications' });
  }
};

// Update leave status (for admin)
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'APPROVED', 'DECLINED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const leave = await prisma.leave.update({
      where: { id: parseInt(id) },
      data: { status }
    });
    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update leave status' });
  }
};