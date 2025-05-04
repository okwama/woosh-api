const prisma = require('../lib/prisma');

// Get all notices
exports.getAllNotices = async (req, res) => {
  try {
    // First fetch without the problematic field
    const notices = await prisma.noticeBoard.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
      },
    });

    // Then fetch the updatedAt field separately for each notice
    const noticesWithDates = await Promise.all(
      notices.map(async (notice) => {
        try {
          const fullNotice = await prisma.noticeBoard.findUnique({
            where: { id: notice.id },
            select: {
              updatedAt: true,
            },
          });
          
          return {
            ...notice,
            updatedAt: fullNotice?.updatedAt ? new Date(fullNotice.updatedAt) : null,
          };
        } catch (error) {
          // If there's an error with a specific notice's date, return it with null
          return {
            ...notice,
            updatedAt: null,
          };
        }
      })
    );

    res.status(200).json(noticesWithDates);
  } catch (error) {
    console.error('Error fetching notices:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2020') {
      return res.status(400).json({ 
        error: 'Invalid date format in database',
        message: 'There is an issue with the date format in the notice board records'
      });
    }

    // Send more detailed error information in development
    if (process.env.NODE_ENV === 'development') {
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Get a single notice by ID
exports.getNoticeById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid notice ID' });
    }

    const notice = await prisma.noticeBoard.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    // Sanitize the dates
    const sanitizedNotice = {
      ...notice,
      createdAt: notice.createdAt ? new Date(notice.createdAt) : null,
      updatedAt: notice.updatedAt ? new Date(notice.updatedAt) : null,
    };

    res.status(200).json(sanitizedNotice);
  } catch (error) {
    console.error('Error fetching notice:', error);
    // Send more detailed error information in development
    if (process.env.NODE_ENV === 'development') {
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}; 