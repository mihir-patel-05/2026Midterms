#!/usr/bin/env tsx
/**
 * Create Admin User Script
 * Usage: npm run admin:create
 */

import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

async function createAdminUser() {
  try {
    console.log('🔐 Creating admin user...');

    const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    const email = process.env.ADMIN_EMAIL?.trim() || undefined;

    if (!password || password.length < 16) {
      throw new Error('ADMIN_PASSWORD must be set and contain at least 16 characters');
    }
    
    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create or update admin user
    const admin = await prisma.adminUser.upsert({
      where: { username },
      update: { 
        passwordHash, 
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        username,
        passwordHash,
        email,
        isActive: true
      }
    });
    
    console.log('✅ Admin user created/updated successfully!');
    console.log('   Username:', username);
    console.log('   User ID:', admin.id);
    console.log('   Active:', admin.isActive);
    console.log('\n📝 The password was read from ADMIN_PASSWORD and was not logged.');
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

createAdminUser();
