import 'dotenv/config';
import { prisma } from '../src/lib/db';

const RANKS = [
  { rankNum: 0, name: 'Squire', recruiterName: null, minLxp: 0, torchTarget: 1, torchXp: 1 },
  { rankNum: 1, name: 'Scout', recruiterName: 'Mentor', minLxp: 150, torchTarget: 2, torchXp: 2 },
  { rankNum: 2, name: 'Vanguard', recruiterName: 'Vanguard Captain', minLxp: 600, torchTarget: 3, torchXp: 3 },
  { rankNum: 3, name: 'Grandmaster', recruiterName: 'Warlord', minLxp: 1500, torchTarget: 4, torchXp: 4 },
  { rankNum: 4, name: 'Immortal', recruiterName: 'Emperor', minLxp: 3500, torchTarget: 5, torchXp: 5 },
  { rankNum: 5, name: 'Transcendence', recruiterName: 'Transcendence', minLxp: 10000, torchTarget: 6, torchXp: 6 },
];

async function main() {
  console.log('Seeding LoyaltyRank table...');

  for (const rank of RANKS) {
    await prisma.loyaltyRank.upsert({
      where: { rankNum: rank.rankNum },
      create: { ...rank, updatedAt: new Date() },
      update: {
        name: rank.name,
        recruiterName: rank.recruiterName,
        minLxp: rank.minLxp,
        torchTarget: rank.torchTarget,
        torchXp: rank.torchXp,
        updatedAt: new Date(),
      },
    });
    console.log(
      `Upserted rank ${rank.rankNum}: ${rank.name} / recruiter: ${rank.recruiterName ?? "(same)"} ` +
      `(${rank.minLxp} LXP, torch ${rank.torchTarget} players / ${rank.torchXp} LXP)`
    );
  }

  console.log('Done.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
