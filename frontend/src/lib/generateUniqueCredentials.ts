import { prisma } from "@/lib/db";

export async function generateUniqueCredentials(
  sitename: string,
  firstName: string,
  lastName: string,
  email: string
) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";

  const safeFirst = (firstName || "User").replace(/[^a-zA-Z]/g, "").toLowerCase();
  const safeLast = (lastName || "User").replace(/[^a-zA-Z]/g, "").toLowerCase();
  const safeEmail = (email || "user@email.com").replace(/[^a-zA-Z]/g, "").toLowerCase();

  for (let attempt = 0; attempt < 5; attempt++) {
    // 1. Generate username: {sitename}_[first 3 letters firstname][last 3 letters lastname][one random letter][two random numbers]
    const firstThreeFirst = safeFirst.slice(0, 3).padEnd(3, "a");
    const lastThreeLast = safeLast.slice(-3).padEnd(3, "a");
    const randomOneLetter = letters.charAt(Math.floor(Math.random() * letters.length));
    
    let randomTwoNumbers = "";
    for (let i = 0; i < 2; i++) {
      randomTwoNumbers += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }

    let usernameSuffix = `${firstThreeFirst}${lastThreeLast}${randomOneLetter}${randomTwoNumbers}`;
    if (attempt > 0) {
      usernameSuffix += attempt;
    }

    const baseSitename = (sitename || "XFd").replace(/_$/, "");
    const generatedGingerUsername = `${baseSitename}_${usernameSuffix}`;

    // 2. Generate email: [last 3 letters lastname][last 3 letters firstname][two random letters][two random numbers]@gmail.com
    let randomTwoLetters = "";
    for (let i = 0; i < 2; i++) {
      randomTwoLetters += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    let emailRandomNumbers = "";
    for (let i = 0; i < 2; i++) {
      emailRandomNumbers += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    const randomSuffix = `${randomTwoLetters}${emailRandomNumbers}`;
    const lastThreeFirst = safeFirst.slice(-3).padEnd(3, "a");

    let emailSuffix = `${lastThreeLast}${lastThreeFirst}${randomSuffix}`;
    if (attempt > 0) {
      emailSuffix += attempt;
    }

    const generatedGingerEmail = `${emailSuffix}@gmail.com`.toLowerCase();

    let generatedPassword = "";
    for (let i = 0; i < 8; i++) {
      generatedPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { gingerUsername: generatedGingerUsername },
          { gingerEmail: generatedGingerEmail }
        ]
      }
    });

    if (!existing) {
      return {
        gingerUsername: generatedGingerUsername,
        gingerEmail: generatedGingerEmail,
        password: generatedPassword,
      };
    }
  }

  throw new Error("Failed to generate unique credentials. Please try modifying your details.");
}
