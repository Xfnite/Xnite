import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { redis } from '../src/lib/redis';

async function main() {
  console.log("Starting labelerId migration...");
  
  const users = await prisma.user.findMany({
    select: { id: true, email: true, labelerId: true, labelerPassword: true }
  });

  console.log(`Found ${users.length} users to check.`);

  let updatedCount = 0;

  for (const user of users) {
    if (user.labelerId && user.labelerPassword) {
      // Already has both
      continue;
    }

    try {
      const redisKey = `ginger_cache_account_koala_details:${user.email}`;
      const cachedDataStr = await redis.get(redisKey);
      
      if (cachedDataStr) {
        const cachedData = JSON.parse(cachedDataStr);
        let firstLabelerId = undefined;
        let firstLabelerPassword = undefined;
        
        if (cachedData.koala_user_role && Array.isArray(cachedData.koala_user_role)) {
          const labelerRole = cachedData.koala_user_role.find((r: any) => r.role?.toLowerCase() === 'labeler');
          if (labelerRole) {
            if (labelerRole.role_user_id) {
              firstLabelerId = labelerRole.role_user_id.toString();
            }
            if (labelerRole.role_password) {
              firstLabelerPassword = labelerRole.role_password.toString();
            }
          }
        }

        if (firstLabelerId || firstLabelerPassword) {
          const dataToUpdate: any = {};
          if (firstLabelerId) dataToUpdate.labelerId = firstLabelerId;
          if (firstLabelerPassword) dataToUpdate.labelerPassword = firstLabelerPassword;
          
          await prisma.user.update({
            where: { id: user.id },
            data: dataToUpdate
          });
          console.log(`Updated user ${user.email} with labelerId: ${firstLabelerId}, labelerPassword: ${firstLabelerPassword ? '***' : undefined}`);
          updatedCount++;
        }
      }
    } catch (e) {
      console.error(`Error processing user ${user.email}:`, e);
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} users.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.quit();
  });
