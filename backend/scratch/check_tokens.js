require('dotenv').config();
const prisma = require('../src/config/database');

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        refreshToken: true,
      }
    });
    console.log('Users in DB:');
    users.forEach(u => {
      console.log(`ID: ${u.id}, Email: ${u.email}, HasRefreshToken: ${!!u.refreshToken}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
