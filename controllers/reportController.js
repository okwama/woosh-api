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

        if (!type || !details) {
            logError(new Error('Type and details are required'), context);
            return res.status(400).json({ error: 'Type and details are required' });
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
                    data: { reportId: report.id, comment: details.comment || '' },
                });
                break;
            case 'PRODUCT_AVAILABILITY':
                specificReport = await prisma.productReport.create({
                    data: {
                        reportId: report.id,
                        productName: details.productName || 'Unknown',
                        quantity: details.quantity || 0,
                        comment: details.comment || '',
                    },
                });    
                
                // Populate OutletQuantity
                let productId = details.productId;
                // Fallback: look up product by name if productId is not provided
                if (!productId && details.productName) {
                    const product = await prisma.product.findFirst({
                        where: { name: details.productName }
                    });
                    if (product) productId = product.id;
                }
                if (productId) {
                    await prisma.outletQuantity.create({
                        data: {
                            clientId: clientId,
                            productId: productId,
                            quantity: details.quantity || 0,
                            // createdAt is set automatically
                        }
                    });
                }



                break;
            case 'VISIBILITY_ACTIVITY':
                specificReport = await prisma.visibilityReport.create({
                    data: {
                        reportId: report.id,
                        comment: details.comment || '',
                        imageUrl: details.imageUrl || '',
                    },
                });
                break;
            case 'PRODUCT_RETURN': {
                specificReport = await prisma.productReturn.create({
                    data: {
                        reportId: report.id,
                    },
                });

                if (specificReport && Array.isArray(details.items)) {
                    items = await Promise.all(details.items.map(item =>
                        prisma.productReturnItem.create({
                            data: {
                                productReturnId: specificReport.id,
                                productName: item.productName || 'Unknown',
                                quantity: item.quantity || 0,
                                reason: item.reason || '',
                                imageUrl: item.imageUrl || '',
                            },
                        })
                    ));
                }
                break;
            }
            case 'PRODUCT_SAMPLE': {
                specificReport = await prisma.productsSample.create({
                    data: {
                        reportId: report.id,
                    },
                });

                if (specificReport && Array.isArray(details.items)) {
                    items = await Promise.all(details.items.map(item =>
                        prisma.productsSampleItem.create({
                            data: {
                                productsSampleId: specificReport.id,
                                productName: item.productName || 'Unknown',
                                quantity: item.quantity || 0,
                                reason: item.reason || '',
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

        res.status(201).json({ report, specificReport, items });
    } catch (error) {
        logError(error, context);
        res.status(500).json({ error: 'Error creating report' });
    }
};


// Get all reports
const getAllReports = async (req, res) => {
    const context = { function: 'getAllReports' };
    try {
        const reports = await prisma.report.findMany({
            include: { feedbackReport: true, productReport: true, visibilityReport: true },
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
            include: { feedbackReport: true, productReport: true, visibilityReport: true },
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
        const { type, details } = req.body;

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
                    update: { comment: details.comment || '' },
                    create: { reportId: id, comment: details.comment || '' },
                });
                break;
            case 'PRODUCT_AVAILABILITY':
                specificReport = await prisma.productReport.upsert({
                    where: { reportId: id },
                    update: {
                        productName: details.productName || 'Unknown',
                        quantity: details.quantity || 0,
                        comment: details.comment || '',
                    },
                    create: {
                        reportId: id,
                        productName: details.productName || 'Unknown',
                        quantity: details.quantity || 0,
                        comment: details.comment || '',
                    },
                });
                break;
            case 'VISIBILITY_ACTIVITY':
                specificReport = await prisma.visibilityReport.upsert({
                    where: { reportId: id },
                    update: {
                        comment: details.comment || '',
                        imageUrl: details.imageUrl || '',
                    },
                    create: {
                        reportId: id,
                        comment: details.comment || '',
                        imageUrl: details.imageUrl || '',
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