import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

async function createAdmin() {
  try {
    const username = 'admin';
    const password = 'admin123';
    const email = 'admin@example.com';

    console.log('📝 Creating admin user...\n');

    // Check if username already exists
    const existing = await prisma.adminUser.findUnique({
      where: { username }
    });

    if (existing) {
      console.log('❌ Username "admin" already exists');
      console.log('   You can login with that account or delete it first');
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = await prisma.adminUser.create({
      data: {
        username,
        email,
        passwordHash,
        isActive: true
      }
    });

    console.log('✅ Admin user created successfully!');
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
