#!/usr/bin/env tsx
/**
 * Check what financial data exists in the database
 */

import { prisma } from '../config/database.js';

async function checkData() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Check candidate financials
    const financials = await prisma.candidateFinancial.findMany({
      take: 15,
      orderBy: { receipts: 'desc' },
      include: {
        candidate: {
          select: { name: true, state: true, office: true }
        }
      }
    });

    console.log('=== CANDIDATE FINANCIALS (Top 15 by Total Raised) ===\n');
    
    if (financials.length === 0) {
      console.log('❌ No financial data found in candidate_financials table!');
      console.log('   Run the sync to populate: npm run sync:dev');
    } else {
      financials.forEach(f => {
        const total = Number(f.receipts);
        const individual = Number(f.individualContributions);
        const pac = Number(f.pacContributions);
        const party = Number(f.partyContributions);
        const self = Number(f.candidateContribution);
        
        const indivPct = total > 0 ? ((individual / total) * 100).toFixed(1) : '0';
        const pacPct = total > 0 ? ((pac / total) * 100).toFixed(1) : '0';
        
        console.log(`${f.candidate.name} (${f.candidate.state}-${f.candidate.office})`);
        console.log(`  💰 Total Raised: $${total.toLocaleString()}`);
        console.log(`  💸 Total Spent: $${Number(f.disbursements).toLocaleString()}`);
        console.log(`  🏦 Cash on Hand: $${Number(f.cashOnHand).toLocaleString()}`);
        console.log(`  👤 Individual: $${individual.toLocaleString()} (${indivPct}%)`);
        console.log(`  🏛️  PAC: $${pac.toLocaleString()} (${pacPct}%)`);
        console.log(`  🎉 Party: $${party.toLocaleString()}`);
        console.log(`  🙋 Self-funded: $${self.toLocaleString()}`);
        console.log(`  📅 Last Updated: ${f.lastUpdated?.toISOString() || 'N/A'}`);
        console.log('');
      });
    }

    // Count totals
    const totalCandidates = await prisma.candidate.count();
    const totalWithFinances = await prisma.candidateFinancial.count();
    
    console.log('=== SUMMARY ===');
    console.log(`📊 Total candidates in DB: ${totalCandidates}`);
    console.log(`💰 Candidates with financial data: ${totalWithFinances}`);
    console.log(`❌ Missing financial data: ${totalCandidates - totalWithFinances}`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkData();

