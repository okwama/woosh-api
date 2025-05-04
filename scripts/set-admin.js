const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setUserAsAdmin(email) {
  try {
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });
    console.log(`Successfully set user ${updatedUser.name} as admin`);
  } catch (error) {
    console.error('Error setting user as admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.error('Please provide an email address');
  process.exit(1);
}

setUserAsAdmin(email); 