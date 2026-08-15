import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@cash.com';
  const adminPass = process.env.SEED_ADMIN_PASS || 'Admin123!';
  const demoEmail = process.env.SEED_USER_EMAIL || 'user@demo.com';
  const demoPass = process.env.SEED_USER_PASS || 'User123!';

  const adminHash = await bcrypt.hash(adminPass, 10);
  const demoHash = await bcrypt.hash(demoPass, 10);

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({ data: { email: adminEmail, passwordHash: adminHash, name: 'Administrator', role: 'admin', balance: 1000 } });
    console.log(`Created admin ${adminEmail} / ${adminPass}`);
  } else {
    console.log('Admin already exists');
  }

  const existingDemo = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!existingDemo) {
    await prisma.user.create({ data: { email: demoEmail, passwordHash: demoHash, name: 'Demo User', role: 'user', balance: 250 } });
    console.log(`Created demo user ${demoEmail} / ${demoPass}`);
  } else {
    console.log('Demo user already exists');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
