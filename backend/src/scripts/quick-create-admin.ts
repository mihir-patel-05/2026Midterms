import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

async function createAdmin() {
  try {
    const username = 'admin';
    const password = 'AndarAkshardham2025*';
    const email = 'admin@example.com';

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
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   ID: ${adminUser.id}`);
    console.log('\n⚠️  Please change the password after first login!');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
