const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const prisma = new PrismaClient();

const excelImportController = {
    async deleteAllClients(req, res) {
        try {
            console.log('Starting client data deletion process...');

            // First verify the table exists and get count
            const tableExists = await prisma.$queryRaw`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'clients'
            `;

            if (!tableExists[0].count) {
                throw new Error('Clients table does not exist');
            }

            // Function to delete records in chunks with retries
            const deleteInChunks = async (chunkSize = 50) => {
                let deleted = 0;
                let total = 0;
                const MAX_CHUNK_RETRIES = 3;
                
                // Get total count first
                total = await prisma.clients.count();
                console.log(`Total client records to delete: ${total}`);
                
                if (total === 0) {
                    console.log('No client records to delete');
                    return { deleted: 0, total: 0 };
                }
                
                while (deleted < total) {
                    let chunkRetries = 0;
                    let success = false;
                    
                    while (!success && chunkRetries < MAX_CHUNK_RETRIES) {
                        try {
                            // Use a separate transaction for each chunk
                            await prisma.$transaction(async (tx) => {
                                const records = await tx.clients.findMany({
                                    take: chunkSize,
                                    skip: deleted,
                                    select: { id: true }
                                });
                                
                                if (records.length === 0) {
                                    success = true;
                                    return;
                                }
                                
                                // Only delete the records, not the table
                                await tx.clients.deleteMany({
                                    where: {
                                        id: {
                                            in: records.map(r => r.id)
                                        }
                                    }
                                });
                            }, {
                                timeout: 30000, // 30 second timeout per chunk
                                maxWait: 5000, // 5 second max wait
                            });
                            
                            deleted += records.length;
                            console.log(`Deleted ${Math.min(deleted, total)}/${total} client records`);
                            success = true;
                            
                        } catch (error) {
                            chunkRetries++;
                            console.error(`Chunk deletion attempt ${chunkRetries} failed:`, error.message);
                            
                            if (chunkRetries < MAX_CHUNK_RETRIES) {
                                // Wait with exponential backoff
                                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, chunkRetries)));
                            } else {
                                throw new Error(`Failed to delete chunk after ${MAX_CHUNK_RETRIES} attempts`);
                            }
                        }
                    }
                }
                
                return { deleted: Math.min(deleted, total), total };
            };

            // Delete client records
            const result = await deleteInChunks();

            res.json({
                message: 'All client records deleted successfully',
                count: result.deleted,
                total: result.total
            });

        } catch (error) {
            console.error('Error in deleteAllClients:', error);
            res.status(500).json({ 
                error: 'Failed to delete client records',
                message: error.message
            });
        }
    },

    async importExcel(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const { model } = req.query;
            if (!model || !['salesRep', 'clients'].includes(model)) {
                return res.status(400).json({ error: 'Invalid model specified. Use either "salesRep" or "clients"' });
            }

            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);

            // Process in batches of 50
            const BATCH_SIZE = 50;
            const batches = [];
            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                batches.push(data.slice(i, i + BATCH_SIZE));
            }

            let results = [];
            for (const batch of batches) {
                const batchResults = await Promise.all(
                    batch.map(async (row) => {
                        try {
                            if (model === 'salesRep') {
                                // Convert and validate sales rep fields
                                row.name = String(row.name || '');
                                row.email = String(row.email || '');
                                row.phoneNumber = String(row.phoneNumber || '');
                                row.password = String(row.password || '');
                                row.region = String(row.region || '');
                                row.region_id = parseInt(row.region_id) || 0;
                                row.countryId = parseInt(row.countryId) || 0;

                                // Validate required fields
                                const requiredFields = {
                                    name: { type: 'string', required: true },
                                    email: { type: 'string', required: true },
                                    phoneNumber: { type: 'string', required: true },
                                    password: { type: 'string', required: true },
                                    region: { type: 'string', required: true },
                                    region_id: { type: 'number', required: true },
                                    countryId: { type: 'number', required: true }
                                };

                                const errors = [];
                                for (const [field, config] of Object.entries(requiredFields)) {
                                    const value = row[field];
                                    if (config.required && (!value || value.toString().trim() === '')) {
                                        errors.push(`${field} is required`);
                                    }
                                }

                                if (errors.length > 0) {
                                    throw new Error(errors.join(', '));
                                }

                                // Verify country exists
                                const country = await prisma.country.findUnique({
                                    where: { id: row.countryId }
                                });
                                if (!country) {
                                    throw new Error(`Country with ID ${row.countryId} not found`);
                                }

                                // Verify region exists
                                const region = await prisma.regions.findUnique({
                                    where: { id: row.region_id }
                                });
                                if (!region) {
                                    throw new Error(`Region with ID ${row.region_id} not found`);
                                }

                                return await prisma.salesRep.create({
                                    data: {
                                        name: row.name,
                                        email: row.email,
                                        phoneNumber: row.phoneNumber,
                                        password: row.password,
                                        region: row.region,
                                        region_id: row.region_id,
                                        countryId: row.countryId,
                                        role: 'USER',
                                        status: 0
                                    }
                                });
                            } else if (model === 'clients') {
                                // Validate required name field first
                                if (!row.name || row.name.toString().trim() === '') {
                                    const randomNumber = Math.floor(100000 + Math.random() * 900000);
                                    row.name = `Client_${randomNumber}`;
                                }
                                row.name = String(row.name);

                                // Convert fields to strings
                                row.region = String(row.region || '');
                                
                                // Generate placeholder tax PIN if not provided
                                if (!row.tax_pin || row.tax_pin.toString().trim() === '') {
                                    const randomNumber = Math.floor(100000 + Math.random() * 900000); // 6-digit number
                                    row.tax_pin = `TAX_${randomNumber}`;
                                } else {
                                    row.tax_pin = String(row.tax_pin);
                                }
                                
                                // Generate placeholder contact if not provided
                                if (!row.contact || row.contact.toString().trim() === '') {
                                    const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000); // 10-digit number
                                    row.contact = `CONTACT_${randomNumber}`;
                                } else {
                                    // Convert to string and remove any non-digit characters
                                    row.contact = String(row.contact).replace(/\D/g, '');
                                    if (row.contact === '') {
                                        const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);
                                        row.contact = `CONTACT_${randomNumber}`;
                                    }
                                }
                                
                                row.balance = String(row.balance || '0');
                                row.location = String(row.location || '');
                                row.address = row.address ? String(row.address) : null;
                                
                                // Generate placeholder email if not provided
                                if (!row.email || row.email.toString().trim() === '') {
                                    const clientName = row.name.toLowerCase().replace(/\s+/g, '_');
                                    row.email = `${clientName}@placeholder.com`;
                                } else {
                                    row.email = String(row.email);
                                }
                                
                                // Convert numeric fields
                                row.region_id = parseInt(row.region_id) || 0;
                                row.countryId = parseInt(row.countryId) || 0;
                                row.status = parseInt(row.status) || 0;
                                row.client_type = row.client_type ? parseInt(row.client_type) : null;
                                row.latitude = row.latitude ? parseFloat(row.latitude) : null;
                                row.longitude = row.longitude ? parseFloat(row.longitude) : null;

                                // Verify country exists
                                const country = await prisma.country.findUnique({
                                    where: { id: parseInt(row.countryId) }
                                });
                                if (!country) {
                                    throw new Error(`Country with ID ${row.countryId} not found`);
                                }

                                // Verify region exists if region_id is provided
                                if (row.region_id) {
                                    const region = await prisma.regions.findUnique({
                                        where: { id: parseInt(row.region_id) }
                                    });
                                    if (!region) {
                                        throw new Error(`Region with ID ${row.region_id} not found`);
                                    }
                                }

                                return await prisma.clients.create({
                                    data: {
                                        name: row.name,
                                        address: row.address || null,
                                        latitude: row.latitude ? parseFloat(row.latitude) : null,
                                        longitude: row.longitude ? parseFloat(row.longitude) : null,
                                        balance: row.balance || '0',
                                        email: row.email,
                                        region_id: parseInt(row.region_id),
                                        region: String(row.region),
                                        contact: row.contact,
                                        tax_pin: row.tax_pin,
                                        location: row.location,
                                        status: row.status || 0,
                                        client_type: row.client_type ? parseInt(row.client_type) : null,
                                        countryId: parseInt(row.countryId)
                                    },
                                    include: {
                                        country: true
                                    }
                                });
                            }
                        } catch (error) {
                            console.error(`Error importing row: ${JSON.stringify(row)}`, error);
                            return { 
                                error: error.message, 
                                row,
                                validationError: true
                            };
                        }
                    })
                );
                results = results.concat(batchResults);
                
                // Add a small delay between batches to prevent overwhelming the connection pool
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Disconnect from the database
            await prisma.$disconnect();

            // Count successful and failed imports
            const successful = results.filter(r => !r.error).length;
            const failed = results.filter(r => r.error).length;
            const validationErrors = results.filter(r => r.validationError).length;

            res.json({
                message: 'Import completed',
                model,
                totalRows: data.length,
                successful,
                failed,
                validationErrors,
                results
            });
        } catch (error) {
            console.error('Import error:', error);
            // Ensure we disconnect even if there's an error
            await prisma.$disconnect();
            res.status(500).json({ error: 'Failed to import data' });
        }
    }
};

module.exports = excelImportController; 