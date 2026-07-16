import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

async function createAdmin() {
  try {
    const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    const email = process.env.ADMIN_EMAIL?.trim() || undefined;

    if (!password || password.length < 16) {
      throw new Error('ADMIN_PASSWORD must be set and contain at least 16 characters');
    }

    console.log('📝 Creating or updating admin user...\n');

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create or update admin user
    const adminUser = await prisma.adminUser.upsert({
      where: { username },
      update: {
        passwordHash,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        username,
        email,
        passwordHash,
        isActive: true
      }
    });

    console.log('✅ Admin user created or updated successfully!');
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Email: ${adminUser.email || '(not set)'}`);
    console.log(`   ID: ${adminUser.id}`);
    console.log('\n📝 The password was read from ADMIN_PASSWORD and was not logged.');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
