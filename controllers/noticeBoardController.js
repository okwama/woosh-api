const prisma = require('../lib/prisma');

// Get all notices
exports.getAllNotices = async (req, res) => {
  try {
    console.log('User countryId:', req.user?.countryId);

    const notices = await prisma.noticeBoard.findMany({
      where: {
        countryId: req.user.countryId
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        countryId: true
      },
    });

    console.log('Notices found:', notices.length);

    res.status(200).json(notices);
  } catch (error) {
    console.error('Error fetching notices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get a single notice by ID
exports.getNoticeById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid notice ID' });
    }

    const notice = await prisma.noticeBoard.findFirst({
      where: { 
        AND: [
          { id },
          { countryId: req.user.countryId }
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        countryId: true
      },
    });

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    res.status(200).json(notice);
  } catch (error) {
    console.error('Error fetching notice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 