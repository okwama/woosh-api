const { getPrismaClient } = require('../lib/prisma');
const prisma = getPrismaClient();
const ImageKit = require('imagekit');
const multer = require('multer');
const bcrypt = require('bcrypt');

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

const updateProfilePhoto = async (req, res) => {
  try {
    const salesRepId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload file to ImageKit
    const result = await imagekit.upload({
      file: req.file.buffer,
      fileName: `profile-${salesRepId}-${Date.now()}`,
      folder: '/whoosh/profile_photos',
    });

    // Update user's photoUrl in database
    const updatedUser = await prisma.salesRep.update({
      where: { id: salesRepId },
      data: { photoUrl: result.url },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        photoUrl: true,
        role: true,
      },
    });

    res.json({
      message: 'Profile photo updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Profile photo update error:', error);
    res.status(500).json({ message: 'Failed to update profile photo' });
  }
};

const getProfile = async (req, res) => {
  try {
    const salesRepId = req.user.id;

    const salesRep = await prisma.salesRep.findUnique({
      where: { id: salesRepId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        photoUrl: true,
        role: true,
        region: true,
        region_id: true,
        country: true,
        countryId: true
      },
    });

    if (!salesRep) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ salesRep });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
};

const updatePassword = async (req, res) => {
  try {
    const salesRepId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate request body
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New passwords do not match' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Get current user with password
    const salesRep = await prisma.salesRep.findUnique({
      where: { id: salesRepId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!salesRep) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, salesRep.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await prisma.salesRep.update({
      where: { id: salesRepId },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ message: 'Failed to update password' });
  }
};

module.exports = {
  updateProfilePhoto,
  getProfile,
  updatePassword,
};