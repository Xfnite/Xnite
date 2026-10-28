import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing DATABASE_URL");

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    where: {
      username: null
    }
  });

  console.log(`Found ${users.length} users without a username.`);

  let updated = 0;
  for (const user of users) {
    if (user.email) {
      let newUsername = user.email.split('@')[0];
      
      let uniqueUsername = newUsername;
      let counter = 1;
      while (true) {
        const existing = await prisma.user.findUnique({ where: { username: uniqueUsername } });
        if (!existing || existing.id === user.id) {
          break;
        }
        uniqueUsername = `${newUsername}${counter}`;
        counter++;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { username: uniqueUsername }
      });
      updated++;
    }
  }

  console.log(`Successfully backfilled ${updated} usernames.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
