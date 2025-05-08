const prisma = require('../lib/prisma');

// Get all tasks for a sales rep
const getTasks = async (req, res) => {
  try {
    const salesRepId = parseInt(req.params.salesRepId);
    
    const tasks = await prisma.task.findMany({
      where: {
        salesRepId: salesRepId,
        isCompleted: false,
      },
      include: {
        assignedBy: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// Get task history for a sales rep
const getTaskHistory = async (req, res) => {
  try {
    const salesRepId = parseInt(req.params.salesRepId);
    
    const tasks = await prisma.task.findMany({
      where: {
        salesRepId: salesRepId,
        isCompleted: true,
      },
      include: {
        assignedBy: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching task history:', error);
    res.status(500).json({ error: 'Failed to fetch task history' });
  }
};

// Create a new task
const createTask = async (req, res) => {
  try {
    const { title, description, priority, salesRepId } = req.body;
    const assignedById = req.user.id; // Get the ID of the super admin creating the task

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority,
        salesRepId: parseInt(salesRepId),
        assignedById: assignedById, // Set the super admin who assigned the task
      },
      include: {
        assignedBy: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// Complete a task
const completeTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    const task = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        status: 'completed',
      },
      include: {
        assignedBy: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });

    res.json(task);
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
};

// Update task status
const updateTaskStatus = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { status } = req.body;

    const task = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status,
      },
      include: {
        assignedBy: {
          select: {
            id: true,
            username: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });

    res.json(task);
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ error: 'Failed to update task status' });
  }
};

// Delete a task
const deleteTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    await prisma.task.delete({
      where: {
        id: taskId,
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

module.exports = {
  getTasks,
  getTaskHistory,
  createTask,
  completeTask,
  updateTaskStatus,
  deleteTask,
}; 