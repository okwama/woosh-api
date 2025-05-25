const prisma = require('../lib/prisma');

// Helper function for consistent error logging
const logError = (error, context = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()}`);
    console.error(`Context: ${JSON.stringify(context)}`);
    console.error(`Message: ${error.message}`);
    console.error(`Stack Trace: ${error.stack}`);
};

const createReport = async (req, res) => {
    const context = { function: 'createReport', body: req.body };
    try {
        const { type, journeyPlanId, userId, clientId, details } = req.body;

        if (!type || !details || !userId || !clientId) {
            logError(new Error('Type, details, userId, and clientId are required'), context);
            return res.status(400).json({ error: 'Type, details, userId, and clientId are required' });
        }

        // Validate sales rep exists
        const salesRep = await prisma.salesRep.findUnique({
            where: { id: userId },
        });
        if (!salesRep) {
            logError(new Error('Sales Rep not found'), { ...context, userId });
            return res.status(400).json({ error: 'Sales Rep not found' });
        }

        // Validate client exists
        const client = await prisma.clients.findUnique({
            where: { id: clientId },
        });
        if (!client) {
            logError(new Error('Client not found'), { ...context, clientId });
            return res.status(400).json({ error: 'Client not found' });
        }

        // Validate journey plan if provided
        if (journeyPlanId) {
            const journeyPlan = await prisma.journeyPlan.findUnique({
                where: { id: journeyPlanId },
            });
            if (!journeyPlan) {
                logError(new Error('Journey Plan not found'), { ...context, journeyPlanId });
                return res.status(400).json({ error: 'Journey Plan not found' });
            }
        }

        // Create a new report
        const report = await prisma.report.create({
            data: {
                type,
                journeyPlanId,
                userId,
                clientId,
            },
        });

        let specificReport;
        let items = [];
        switch (type) {
            case 'FEEDBACK':
                specificReport = await prisma.feedbackReport.create({
                    data: { 
                        comment: details.comment || '',
                        user: { connect: { id: userId } },
                        client: { connect: { id: clientId } },
                        Report: { connect: { id: report.id } }
                    },
                });
                break;
            case 'PRODUCT_AVAILABILITY': {
                const productReports = [];
                for (const detail of details) {
                    const product = await prisma.product.findUnique({
                        where: { id: detail.productId },
                    });

                    if (product) {
                        const productReport = await prisma.productReport.create({
                            data: {
                                userId: userId,
                                clientId: clientId,
                                reportId: report.id,
                                productId: product.id,
                                productName: product.name,
                                quantity: detail.quantity,
                                comment: detail.comment,
                            },
                        });
                        productReports.push(productReport);
                    }
                }
                specificReport = productReports;
                break;
            }
            case 'VISIBILITY_ACTIVITY':
                specificReport = await prisma.visibilityReport.create({
                    data: {
                        comment: details.comment || '',
                        imageUrl: details.imageUrl || '',
                        user: { connect: { id: userId } },
                        client: { connect: { id: clientId } },
                        Report: { connect: { id: report.id } }
                    },
                });
                break;
            case 'PRODUCT_RETURN': {
                specificReport = await prisma.productReturn.create({
                    data: {
                        user: { connect: { id: userId } },
                        client: { connect: { id: clientId } },
                        report: { connect: { id: report.id } },
                        staff_id: userId,
                        staff_name: salesRep.name
                    },
                });

                // Add proper validation for details and items
                if (!details || !details.items || !Array.isArray(details.items)) {
                    logError(new Error('Invalid items data'), { ...context, details });
                    return res.status(400).json({ error: 'Invalid items data' });
                }

                items = await Promise.all(details.items.map(item =>
                    prisma.productReturnItem.create({
                        data: {
                            productReturn: specificReport.id,
                            productName: item.productName || 'Unknown',
                            quantity: item.quantity || 0,
                            reason: item.reason || '',
                            imageUrl: item.imageUrl || '',
                            user: { connect: { id: userId } },
                            client: { connect: { id: clientId } },
                            productReturn: { connect: { id: specificReport.id } }
                        },
                    })
                ));
                break;
            }
            case 'PRODUCT_SAMPLE': {
                specificReport = await prisma.productsSample.create({
                    data: {
                        user: { connect: { id: userId } },
                        client: { connect: { id: clientId } },
                        report: { connect: { id: report.id } }
                    },
                });

                if (specificReport && Array.isArray(details.items)) {
                    items = await Promise.all(details.items.map(item =>
                        prisma.productsSampleItem.create({
                            data: {
                                productsSample: specificReport.id,
                                productName: item.productName || 'Unknown',
                                quantity: item.quantity || 0,
                                reason: item.reason || '',
                                user: { connect: { id: userId } },
                                client: { connect: { id: clientId } },
                                productsSample: { connect: { id: specificReport.id } }
                            },
                        })
                    ));
                }
                break;
            }
            default:
                logError(new Error('Invalid report type'), { ...context, type });
                return res.status(400).json({ error: 'Invalid report type' });
        }

        // Return exactly what the ProductReturn model expects with proper type handling
        const createProductReturnResponse = (item) => ({
            reportId: parseInt(report.id, 10),
            productName: item.productName?.toString() || null,
            reason: item.reason?.toString() || null,
            imageUrl: item.imageUrl?.toString() || null,
            quantity: item.quantity ? parseInt(item.quantity, 10) : null
        });

        res.status(201).json([
            {
                ...createProductReturnResponse(details.items?.[0] || {}),
                items: (details.items || []).map(item => createProductReturnResponse(item))
            }
        ]);
    } catch (error) {
        logError(error, context);
        res.status(500).json({ error: 'Error creating report' });
    }
};

// Get all reports
const getAllReports = async (req, res) => {
    const context = { function: 'getAllReports', query: req.query };
    try {
        const { type, userId } = req.query;
        
        // Build where clause based on filters
        const where = {};
        if (type) {
            where.type = type.toUpperCase();
        }
        if (userId) {
            where.userId = Number(userId);
        }

        const reports = await prisma.report.findMany({
            where,
            include: { 
                FeedbackReport: true, 
                ProductReport: true, 
                VisibilityReport: true,
                productReturns: {
                    include: {
                        ProductReturnItem: true,
                        user: true,
                        client: true
                    }
                },
                MyOrder: true,
                journeyPlan: true,
                user: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                client: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
        });
        res.json(reports);
    } catch (error) {
        logError(error, context);
        res.status(500).json({ error: 'Error retrieving reports' });
    }
};

// Get a single report by ID
const getReportById = async (req, res) => {
    const context = { function: 'getReportById', params: req.params };
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            logError(new Error('Invalid report ID'), { ...context, id });
            return res.status(400).json({ error: 'Invalid report ID' });
        }

        const report = await prisma.report.findUnique({
            where: { id },
            include: { 
                feedbackReport: true, 
                productReport: true, 
                visibilityReport: true,
                productReturn: {
                    include: {
                        items: true
                    }
                },
                productsSample: {
                    include: {
                        items: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                client: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
        });

        if (!report) {
            logError(new Error('Report not found'), { ...context, id });
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json(report);
    } catch (error) {
        logError(error, context);
        res.status(500).json({ error: 'Error retrieving report' });
    }
};

// Update a report
const updateReport = async (req, res) => {
    const context = { function: 'updateReport', params: req.params, body: req.body };
    try {
        const id = Number(req.params.id);
        const { type, details, userId, clientId } = req.body;

        if (isNaN(id)) {
            logError(new Error('Invalid report ID'), { ...context, id });
            return res.status(400).json({ error: 'Invalid report ID' });
        }

        // Update the main report
        const report = await prisma.report.update({
            where: { id },
            data: { type },
        });

        let specificReport;
        switch (type) {
            case 'FEEDBACK':
                specificReport = await prisma.feedbackReport.upsert({
                    where: { reportId: id },
                    update: { 
                        comment: details.comment || '',
                        userId,
                        clientId
                    },
                    create: { 
                        reportId: id, 
                        comment: details.comment || '',
                        userId,
                        clientId
                    },
                });
                break;
            case 'PRODUCT_AVAILABILITY':
                specificReport = await prisma.productReport.upsert({
                    where: { reportId: id },
                    update: {
                        productName: details.productName || 'Unknown',
                        quantity: details.quantity || 0,
                        comment: details.comment || '',
                        userId,
                        clientId
                    },
                    create: {
                        reportId: id,
                        productName: details.productName || 'Unknown',
                        quantity: details.quantity || 0,
                        comment: details.comment || '',
                        userId,
                        clientId
                    },
                });
                break;
            case 'VISIBILITY_ACTIVITY':
                specificReport = await prisma.visibilityReport.upsert({
                    where: { reportId: id },
                    update: {
                        comment: details.comment || '',
                        imageUrl: details.imageUrl || '',
                        userId,
                        clientId
                    },
                    create: {
                        reportId: id,
                        comment: details.comment || '',
                        imageUrl: details.imageUrl || '',
                        userId,
                        clientId
                    },
                });
                break;
            default:
                logError(new Error('Invalid report type'), { ...context, type });
                return res.status(400).json({ error: 'Invalid report type' });
        }

        res.json({ report, specificReport });
    } catch (error) {
        logError(error, context);
        res.status(500).json({ error: 'Error updating report' });
    }
};

// Delete a report with related data
const deleteReport = async (req, res) => {
    const context = { function: 'deleteReport', params: req.params };
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            logError(new Error('Invalid report ID'), { ...context, id });
            return res.status(400).json({ error: 'Invalid report ID' });
        }

        // Delete related reports first to avoid foreign key constraint errors
        await prisma.feedbackReport.deleteMany({ where: { reportId: id } });
        await prisma.productReport.deleteMany({ where: { reportId: id } });
        await prisma.visibilityReport.deleteMany({ where: { reportId: id } });
        await prisma.productReturnItem.deleteMany({ 
            where: { 
                productReturn: { reportId: id } 
            } 
        });
        await prisma.productReturn.deleteMany({ where: { reportId: id } });
        await prisma.productsSampleItem.deleteMany({ 
            where: { 
                productsSample: { reportId: id } 
            } 
        });
        await prisma.productsSample.deleteMany({ where: { reportId: id } });

        // Delete the main report
        await prisma.report.delete({ where: { id } });

        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        logError(error, context);
        res.status(500).json({ error: 'Error deleting report' });
    }
};

module.exports = {
    createReport,
    getAllReports,
    getReportById,
    updateReport,
    deleteReport,
};