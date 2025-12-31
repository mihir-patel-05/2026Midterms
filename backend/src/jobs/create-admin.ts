#!/usr/bin/env tsx
/**
 * Create Admin User Script
 * Usage: tsx src/jobs/create-admin.ts
 */

import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

async function createAdminUser() {
  try {
    console.log('🔐 Creating admin user...');

    const username = 'admin';
    const password = 'AndarAkshardham2025*';
    
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
        email: 'admin@example.com',
        isActive: true
      }
    });
    
    console.log('✅ Admin user created/updated successfully!');
    console.log('   Username:', username);
    console.log('   Password: AndarAkshardham2025*');
    console.log('   User ID:', admin.id);
    console.log('   Active:', admin.isActive);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

createAdminUser();

