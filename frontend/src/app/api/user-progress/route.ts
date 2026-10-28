import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email query parameter is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        isDashboardCompleted: true,
        onboardingProgress: true,
        isRulesAndGuidelinesCompleted: true,
        onRulesAndGuidelinesProgress: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Parse JSON fields safely
    let onboardingData: any = {};
    if (typeof user.onboardingProgress === "string") {
      try { onboardingData = JSON.parse(user.onboardingProgress); } catch (e) {}
    } else if (user.onboardingProgress && typeof user.onboardingProgress === "object") {
      onboardingData = user.onboardingProgress;
    }

    let rulesData: any = {};
    if (typeof user.onRulesAndGuidelinesProgress === "string") {
      try { rulesData = JSON.parse(user.onRulesAndGuidelinesProgress); } catch (e) {}
    } else if (user.onRulesAndGuidelinesProgress && typeof user.onRulesAndGuidelinesProgress === "object") {
      rulesData = user.onRulesAndGuidelinesProgress;
    }

    // Calculate Onboarding Modules
    let completedModulesCount = 0;
    let nextModuleName = "Download & Install Software";

    if (user.isDashboardCompleted) {
      completedModulesCount = 5;
      nextModuleName = "None, all completed!";
    } else {
      const m = onboardingData?.modulesComplete || {};
      
      const mod1 = m.download && m.install;
      const mod2 = m["videos-basic"];
      const mod3 = m["videos-3d"];
      const mod4 = m["answer-key"];
      const mod5 = m["answer-key-lib"];

      if (mod1) completedModulesCount++;
      if (mod2) completedModulesCount++;
      if (mod3) completedModulesCount++;
      if (mod4) completedModulesCount++;
      if (mod5) completedModulesCount++;

      // Determine next module name based on what's missing
      if (!mod1) nextModuleName = "Software Setup (Download & Install)";
      else if (!mod2) nextModuleName = "Basic Tools Training";
      else if (!mod3) nextModuleName = "3D Tools Training";
      else if (!mod4) nextModuleName = "Hands-on Exercise";
      else if (!mod5) nextModuleName = "Final Assessment";
    }

    const formattedMessage = user.isDashboardCompleted 
      ? "You have successfully finished all 5 onboarding modules!" 
      : `You haven't finished your onboarding yet. You have already finished ${completedModulesCount} modules out of 5. Your next step is: ${nextModuleName}.`;

    return NextResponse.json({
      email: user.email,
      completedModulesCount: completedModulesCount,
      totalModules: 5,
      nextModuleName: nextModuleName,
      formattedMessage: formattedMessage,
      isDashboardCompleted: user.isDashboardCompleted
    });
  } catch (error: any) {
    console.error("Error fetching user progress:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
