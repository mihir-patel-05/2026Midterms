import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    console.log('📝 Create Admin User\n');

    const username = await question('Enter username: ');
    const email = await question('Enter email (optional): ');
    const password = await question('Enter password: ');

    if (!username || !password) {
      console.error('❌ Username and password are required');
      process.exit(1);
    }

    // Check if username already exists
    const existing = await prisma.adminUser.findUnique({
      where: { username }
    });

    if (existing) {
      console.error('❌ Username already exists');
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = await prisma.adminUser.create({
      data: {
        username,
        email: email || undefined,
        passwordHash,
        isActive: true
      }
    });

    console.log('\n✅ Admin user created successfully!');
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Email: ${adminUser.email || 'N/A'}`);
    console.log(`   ID: ${adminUser.id}`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

createAdmin();
