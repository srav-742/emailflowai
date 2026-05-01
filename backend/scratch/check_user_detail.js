require('dotenv').config();
const prisma = require('../src/config/database');

async function checkUserDetail() {
  try {
    const user = await prisma.user.findUnique({
      where: { id: 'a502293f-ca6a-4d5e-8cbf-3ca17f474547' },
      select: {
        id: true,
        email: true,
        gmailConnectedAt: true,
        tokenExpiry: true,
      }
    });
    console.log('User detail:', user);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserDetail();
