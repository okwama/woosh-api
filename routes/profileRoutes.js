const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/authMiddleware');
const { updateProfilePhoto, getProfile, updatePassword, getSalesReps } = require('../controllers/profileController');
const { anyUser } = require('../middleware/roleAuth');
// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
  }
});

// Routes
router.get('/profile', auth, anyUser, getProfile);
router.get('/profile/users', auth, anyUser, getSalesReps);
router.post('/profile/photo', auth, anyUser, upload.single('photo'), updateProfilePhoto);
router.post('/profile/password', auth, anyUser, updatePassword);

module.exports = router;
