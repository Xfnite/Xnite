import { Suspense } from "react";
import { cookies } from "next/headers";
import ReferrerSelect from "@/components/ReferrerSelect";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prisma } from "@/lib/db";
import RegisterWizard from "@/components/Register/RegisterWizard";
import { verifySessionToken } from "@/lib/jwt";
import { verifyCookieValue } from "@/lib/signedCookie";
import { listSignupReferrers } from "@/lib/referrers";
import { isApplicant } from "@/config/permissions";

export const dynamic = "force-dynamic";

function ReferrerSkeleton() {
  return (
    <div className="w-full h-[46px] bg-white/50 dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg animate-pulse flex items-center px-3 text-sm text-[#2F3E46]/40 dark:text-white/30">
      Loading referrers...
    </div>
  );
}

async function ReferrerSelectContainer() {
  const cookieStore = await cookies();

  // Check if there's a referral email from a labeler link
  const signupRef = cookieStore.get("signup_ref")?.value || "";
  let lockedRefEmail = "";
  let lockedRefName = "";

  if (signupRef) {
    // Look up the user's name from the User table (labelers are users, not in referal table)
    const refUser = await prisma.user.findUnique({
      where: { email: signupRef },
      select: { name: true, firstName: true, lastName: true, role: true, status: true },
    });
    // Applicants can't refer, and deactivated accounts drop off the referrer list.
    // Such links are ignored: the referrer field stays a normal dropdown.
    const isDeactivated = refUser?.status === "Deactivated" || refUser?.status?.toLowerCase() === "inactive";
    if (refUser && !isApplicant(refUser.role) && !isDeactivated) {
      lockedRefEmail = signupRef;
      lockedRefName =
        (refUser.firstName && refUser.lastName
          ? `${refUser.firstName} ${refUser.lastName}`
          : refUser.name) || signupRef;
    }
  }

  const referrals = await listSignupReferrers();

  return (
    <ReferrerSelect
      referrals={referrals}
      lockedRefEmail={lockedRefEmail}
      lockedRefName={lockedRefName}
    />
  );
}

export default async function RegisterPage() {
  const cookieStore = await cookies();
  const fullName = cookieStore.get("signup_name")?.value || "";
  let initialFirstName = "";
  let initialLastName = "";
  if (fullName) {
    const parts = fullName.split(" ");
    initialFirstName = parts[0] || "";
    initialLastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  let initialStep: "register" | "complete-profile" = fullName ? "complete-profile" : "register";

  let isExistingUser = false;
  const signupEmail = await verifyCookieValue("signup_email", cookieStore.get("signup_email")?.value);
  const sessionToken = cookieStore.get("xnite_session")?.value;

  let checkEmail = signupEmail?.toLowerCase();
  if (!checkEmail && sessionToken) {
    const sessionEmail = await verifySessionToken(sessionToken);
    if (sessionEmail) {
      checkEmail = sessionEmail.toLowerCase();
    }
  }

  if (checkEmail) {
    const user = await prisma.user.findUnique({
      where: { email: checkEmail },
      select: { id: true },
    });
    if (user) {
      isExistingUser = true;
    }
  }

  // If registration is disabled and they are NOT an existing user, force step to "register"
  if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" && !isExistingUser) {
    initialStep = "register";
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#E0E1DD] dark:bg-[#060D14]" />}>
      <RegisterWizard
        initialStep={initialStep}
        initialFirstName={initialFirstName}
        initialLastName={initialLastName}
        isExistingUser={isExistingUser}
        referrerSelect={
          process.env.NEXT_PUBLIC_ENABLE_REFERRAL !== "false" ? (
            <Suspense fallback={<ReferrerSkeleton />}>
              <ReferrerSelectContainer />
            </Suspense>
          ) : null
        }
      />
    </Suspense>
  );
}
