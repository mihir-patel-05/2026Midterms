import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestCandidate() {
  try {
    const candidate = await prisma.candidate.create({
      data: {
        candidateId: 'TEST123',
        name: 'Jane Smith',
        party: 'DEM',
        office: 'SENATE',
        state: 'CA',
        incumbentStatus: 'C',
        cycles: [2026],
        electionYears: [2026],
        candidateStatus: 'C',
        // New detail fields
        biography: 'Jane Smith is a long-time advocate for education reform and healthcare access. She has served in the State Senate since 2018.',
        currentOfficeHeld: 'California State Senator, District 12',
        campaignWebsite: 'https://janesmith2026.com',
        socialMedia: {
          twitter: '@janesmith',
          facebook: 'facebook.com/janesmith2026',
          instagram: '@janesmith2026'
        }
      }
    });

    console.log('✅ Test candidate created:', candidate.id);
    console.log('Candidate ID:', candidate.candidateId);
    console.log('Name:', candidate.name);
    console.log('Biography:', candidate.biography?.substring(0, 50) + '...');
    console.log('Website:', candidate.campaignWebsite);
    console.log('Social Media:', candidate.socialMedia);
  } catch (error) {
    console.error('❌ Error creating test candidate:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestCandidate();
