"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { generateUniqueCredentials } from "@/lib/generateUniqueCredentials";
import { signSessionToken, verifySessionToken } from "@/lib/jwt";
import { signCookieValue, verifyCookieValue } from "@/lib/signedCookie";
import { calculateNewRole } from "@/lib/roleChanger";
import { isStaff } from "@/config/permissions";
import { getStaffUser } from "@/lib/authGuard";
import { redis, isRedisReady } from "@/lib/redis";
import { checkTrainingPassedFromList } from "@/lib/trainingStatus";
import { isDemoGingerEmail } from "@/lib/gingerDemo";
import { toUserFacingError } from "@/lib/userFacingError";
import { findReferalFor } from "@/lib/referrers";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
const GINGER_LOGIN_ENDPOINT = `${GINGER_BASE}/bac/login`;
const GINGER_LOGOUT_ENDPOINT = `${GINGER_BASE}/bac/logout`;
const GINGER_USER_DETAIL_ENDPOINT = `${GINGER_BASE}/bac/eam/sale/user/detail`;
const GINGER_SIGNUP_VALIDATE_ENDPOINT = `${GINGER_BASE}/bac/eam/koala/koala-user/user/signup-validate`;
const GINGER_SIGNUP_ENDPOINT = `${GINGER_BASE}/bac/eam/koala/koala-user/user/signup`;

export async function loginAction(formData: { email: string; password: string }) {
  try {
    const { email: rawEmail, password } = formData;
    const email = rawEmail.toLowerCase();
    const cookieStore = await cookies();

    // 1ï¸âƒ£ Fetch user from local DB
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    if (user.status === "Deactivated" || user.status?.toLowerCase() === "inactive") {
      return { success: false, error: "Your account has been blacklisted due to inactivity. Please contact your Recruiter, Judger, Checker, or Admin for assistance." };
    }

    if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" && user.role === "applicant" && !(await isGingerResetApplicant(user.email))) {
      return { success: false, error: "Hiring was closed, you can continue again on November 2026 once we open more slots" };
    }

    const isPasswordCorrect = user.password === password;
    const isGingerPasswordCorrect = user.gingerPassword === password;
    const isNonLabelerWithCorrectGingerPassword = user.role !== "labeler" && isGingerPasswordCorrect;

    if (!isPasswordCorrect && !isNonLabelerWithCorrectGingerPassword) {
      return { success: false, error: "Invalid email or password" };
    }

    const gingerEmail = user.gingerEmail || user.email;
    const gingerPassword = user.gingerPassword || user.password;

    if (!gingerEmail || !gingerPassword) {
      return { success: false, error: "Missing ginger credentials for this account. Please complete registration." };
    }

    // 2️⃣ Forward ginger credentials to the real Ginger login endpoint (if reachable)
    let gingerResOk = false;
    let gingerData: any = {};

    try {
      const gingerRes = await fetch(GINGER_LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: gingerEmail, password: gingerPassword }),
      });
      gingerResOk = gingerRes.ok;
      gingerData = await gingerRes.json().catch(() => ({}));

      if (!gingerResOk) {
        console.warn("Login to ginger failed, continuing to dashboard without ginger session:", gingerData?.error ?? gingerData);
      }
    } catch (gingerFetchErr: any) {
      console.warn("Ginger API unreachable or invalid URL provided. Continuing with local PostgreSQL login:", gingerFetchErr?.message || gingerFetchErr);
    }

    // Not registered (e.g. given a new Ginger account on reactivation): a token cookie
    // left in the browser belongs to an old account. Drop it so the dashboard creates
    // the new Ginger account (registerWithGingerAction) instead of using the old one.
    if (!user.isRegistered && !(gingerResOk && gingerData?.credential?.access_token)) {
      cookieStore.delete("ginger_access_token");
    }

    // 3️⃣ Store the access token securely in an HttpOnly cookie if available
    if (gingerResOk && gingerData?.credential?.access_token) {
      cookieStore.set({
        name: "ginger_access_token",
        value: gingerData.credential.access_token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }

    // 4️⃣ Return the success payload including tokens for client direct access
    const safeData = { ...gingerData };

    const hasCompletedPreCourse = user.hasCompletedPreCourse;

    cookieStore.set({
      name: "pre_course_completed",
      value: hasCompletedPreCourse ? "true" : "false",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    cookieStore.set({
      name: "xnite_session",
      value: await signSessionToken(user.email),
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    await prisma.user.update({
      where: { email: user.email },
      data: {
        lastLogin: new Date(),
        status: "Active",
      },
    });

    return { success: true, data: safeData, hasCompletedPreCourse, redirect: "/dashboard" };

  } catch (err) {
    console.error("Login action error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

// An applicant with payout history is a former labeler who was given a new Ginger
// account on reactivation (activateUsersAction) to redo the training tasks. They may
// log in while hiring is closed.
async function isGingerResetApplicant(email: string): Promise<boolean> {
  const paid = await prisma.incomeHistory.findFirst({ where: { email }, select: { id: true } });
  return !!paid;
}

export async function loginWithGingerCredentials(gingerUsername: string, gingerPassword: string) {
  // console.log(`[loginWithGingerCredentials] Attempting to login username: ${gingerUsername}`);
  const gingerRes = await fetch(GINGER_LOGIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: gingerUsername, password: gingerPassword }),
  });
  const gingerData = await gingerRes.json().catch(() => ({}));
  // console.log(`[loginWithGingerCredentials] Response status: ${gingerRes.status}`, JSON.stringify(gingerData));
  if (!gingerRes.ok) return { success: false as const, error: gingerData.error ?? gingerData.msg ?? gingerData.message ?? "Ginger login failed" };
  return { success: true as const, data: gingerData };
}

export async function getSessionUser() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return null;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true, name: true, email: true, firstName: true, lastName: true, isRegistered: true, isDashboardCompleted: true, onboardingProgress: true, isRulesAndGuidelinesCompleted: true, hasClickedLandCoverTraining: true, hasClickedTransportationTraining: true, activeProjectsTutorialProgress: true, role: true, linkedRecruiterEmail: true, gingerUsername: true, group_id: true, team_id: true, createdAt: true, hadProjectBefore: true, hasAgreedToTerms: true },
    });
    if (!user) return null;
    const gingerToken = cookieStore.get("ginger_access_token")?.value || null;
    return {
      ...user,
      gingerToken,
    };
  } catch (err) {
    console.error("getSessionUser failed:", err);
    return null;
  }
}

export async function markLandCoverTrainingClickedAction() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    await prisma.user.update({
      where: { email },
      data: { hasClickedLandCoverTraining: true },
    });
    return { success: true };
  } catch (err) {
    console.error("markLandCoverTrainingClickedAction failed:", err);
    return { success: false, error: "Failed to update" };
  }
}

export async function markTransportationTrainingClickedAction() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    await prisma.user.update({
      where: { email },
      data: { hasClickedTransportationTraining: true },
    });
    return { success: true };
  } catch (err) {
    console.error("markTransportationTrainingClickedAction failed:", err);
    return { success: false, error: "Failed to update" };
  }
}

export async function updateActiveProjectsTutorialProgressAction(updates: Record<string, any>) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { activeProjectsTutorialProgress: true }
    });

    if (!user) return { success: false, error: "User not found" };

    const currentProgress = (user.activeProjectsTutorialProgress as Record<string, any>) || {};

    await prisma.user.update({
      where: { email },
      data: {
        activeProjectsTutorialProgress: {
          ...currentProgress,
          ...updates
        }
      },
    });
    return { success: true };
  } catch (err) {
    console.error("updateActiveProjectsTutorialProgressAction failed:", err);
    return { success: false, error: "Failed to update" };
  }
}

export async function saveOnboardingProgressAction(progress: any) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    await prisma.user.update({
      where: { email },
      data: { onboardingProgress: progress },
    });
    return { success: true };
  } catch (err) {
    console.error("saveOnboardingProgressAction failed:", err);
    return { success: false, error: "Failed to save progress" };
  }
}

export async function logoutAction() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("ginger_access_token")?.value;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 1ï¸âƒ£ Forward the logout request to the real Ginger logout endpoint
    const gingerRes = await fetch(GINGER_LOGOUT_ENDPOINT, {
      method: "POST",
      headers,
    });

    const gingerData = await gingerRes.json().catch(() => ({}));

    if (!gingerRes.ok) {
      return { success: false, error: gingerData.error ?? "Logout failed on Ginger API" };
    }

    // Clear the cookie
    cookieStore.delete("ginger_access_token");
    cookieStore.delete("xnite_session");
    cookieStore.delete("pre_course_completed");
    cookieStore.delete("pre_course_progress");
    cookieStore.delete("onboarding_email");
    cookieStore.delete("onboarding_name");

    return { success: true, data: gingerData };
  } catch (err) {
    console.error("Logout action error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function performGingerSignup(payload: any) {
  // 1. Validate signup
  const validateRes = await fetch(GINGER_SIGNUP_VALIDATE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const validateDataText = await validateRes.text();
  let isError = !validateRes.ok;
  let errorMsg = "Validation failed";
  let parsed = null;

  try {
    parsed = JSON.parse(validateDataText);
    if (validateRes.ok && parsed && typeof parsed.code !== "undefined" && parsed.code !== 0 && parsed.code !== 200) {
      isError = true;
    }

    if (isError) {
      if (parsed.msg) errorMsg = parsed.msg;
      else if (parsed.message) errorMsg = parsed.message;
      else if (parsed.error) errorMsg = parsed.error;
      else if (typeof parsed === "string") errorMsg = parsed;
    }
  } catch (e) {
    if (isError) errorMsg = validateDataText || errorMsg;
  }

  if (isError) {
    if (typeof errorMsg === "string") {
      errorMsg = errorMsg.replace(/^\(\d+\)\s*/, "");
    }
    if (/system error/i.test(errorMsg)) {
      console.warn("Bypassing Ginger validation system error:", errorMsg);
    } else {
      return { success: false, error: errorMsg };
    }
  }

  // 2. Perform actual signup
  const signupRes = await fetch(GINGER_SIGNUP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const signupDataText = await signupRes.text();
  let isSignupError = !signupRes.ok;
  let signupErrorMsg = "Signup failed";
  let signupParsed = null;

  try {
    signupParsed = JSON.parse(signupDataText);
    if (signupRes.ok && signupParsed && typeof signupParsed.code !== "undefined" && signupParsed.code !== 0 && signupParsed.code !== 200) {
      isSignupError = true;
    }

    if (isSignupError) {
      if (signupParsed.msg) signupErrorMsg = signupParsed.msg;
      else if (signupParsed.message) signupErrorMsg = signupParsed.message;
      else if (signupParsed.error) signupErrorMsg = signupParsed.error;
      else if (typeof signupParsed === "string") signupErrorMsg = signupParsed;
    }
  } catch (e) {
    if (isSignupError) signupErrorMsg = signupDataText || signupErrorMsg;
  }

  if (isSignupError) {
    if (typeof signupErrorMsg === "string") {
      signupErrorMsg = signupErrorMsg.replace(/^\(\d+\)\s*/, "");
    }
    if (/system error/i.test(signupErrorMsg)) {
      console.warn("Bypassing Ginger signup system error:", signupErrorMsg);
    } else {
      return { success: false, error: signupErrorMsg };
    }
  }

  return { success: true, data: signupParsed || {} };
}


export async function registerAction(data: {
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  referal_email: string;
  phone?: string;
  facebook?: string;
  contact?: string;
  occupied?: string;
  graduate_date?: string;
  action?: string;
  password?: string;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true") {
    return { success: false, error: "Registration is currently disabled." };
  }

  try {
    const {
      name,
      firstName: inputFirstName,
      lastName: inputLastName,
      email: rawEmail,
      referal_email,
      phone,
      facebook,
      contact = " ",
      occupied = " ",
      graduate_date = " ",
      action = "signup",
      password: userPassword,
    } = data;

    const email = rawEmail.toLowerCase();

    // Check if the account has been deactivated
    const deactivatedUser = await prisma.user.findUnique({
      where: { email },
      select: { status: true },
    });
    if (deactivatedUser && (deactivatedUser.status === "Deactivated" || deactivatedUser.status?.toLowerCase() === "inactive")) {
      return { success: false, error: "Invalid email, please use other email" };
    }
    // The form's email is unverified, so it must never lead to a session for
    // an account that already exists. Existing users sign in instead.
    if (deactivatedUser) {
      return { success: false, error: "An account with this email already exists. Please log in instead." };
    }

    // Recruits are saved under the recruiter's referal email (see findReferalFor)
    const pickedReferrer = referal_email?.trim().toLowerCase();
    const referalRecord = pickedReferrer ? await findReferalFor(pickedReferrer) : null;
    const normalizedReferrer = referalRecord?.email || pickedReferrer;
    const sitename = referalRecord?.sitename || "XFd_";

    let finalFirstName = inputFirstName;
    let finalLastName = inputLastName;
    if (!finalFirstName && name) {
      finalFirstName = name.split(" ")[0];
    }
    if (!finalLastName && name) {
      finalLastName = name.split(" ").slice(1).join(" ") || "User";
    }
    if (!finalFirstName) finalFirstName = email.split("@")[0] || "User";
    if (!finalLastName) finalLastName = "User";

    let generatedCreds;
    try {
      generatedCreds = await generateUniqueCredentials(sitename, finalFirstName, finalLastName, email);
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }

    const { gingerUsername, gingerEmail, password } = generatedCreds;

    if (action === "validate") {
      return { success: true };
    }

    // Set pending signup payload cookie
    if (typeof document === "undefined") {
      const payload = {
        email,
        name: name || gingerUsername,
        firstName: inputFirstName,
        lastName: inputLastName,
        gingerEmail,
        gingerUsername,
        gingerPassword: password,
        password: userPassword,
        phone,
        facebook,
        refererEmail: normalizedReferrer || null,
      };

      const cookieStore = await cookies();
      cookieStore.set({
        name: "pending_signup_payload",
        value: await signCookieValue("pending_signup_payload", JSON.stringify(payload), 60 * 60 * 24 * 7),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      cookieStore.set({
        name: "onboarding_name",
        value: name || gingerUsername,
        httpOnly: false,
        path: "/",
      });
      cookieStore.set({
        name: "onboarding_email",
        value: await signCookieValue("onboarding_email", email, 60 * 60 * 24 * 7),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      cookieStore.delete("xnite_session");
      cookieStore.delete("pre_course_completed");
    }

    return {
      success: true,
      email,
      gingerUsername,
      password,
    };
  } catch (err) {
    console.error("Register action error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function completeProfileAction(data: {
  referrer: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  facebook?: string;
  password?: string;
}) {
  try {
    const { referrer, firstName: inputFirstName, lastName: inputLastName, phone, facebook, password } = data;

    const pickedReferrer = referrer?.trim().toLowerCase();

    if (!pickedReferrer) {
      return { success: false, error: "Referrer is required" };
    }

    // Recruits are saved under the recruiter's referal email (see findReferalFor)
    const referalRecord = await findReferalFor(pickedReferrer);
    const normalizedReferrer = referalRecord?.email || pickedReferrer;
    const sitename = referalRecord?.sitename || "XFd_";

    const cookieStore = await cookies();
    const name = cookieStore.get("signup_name")?.value;
    // signup_email is set (signed) only by the OAuth callback after the provider verified it
    const rawEmail = await verifyCookieValue("signup_email", cookieStore.get("signup_email")?.value);

    if (!name || !rawEmail) {
      return { success: false, error: "Please refresh and sign up via Google again." };
    }

    const email = rawEmail.toLowerCase();

    if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true") {
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!existingUser) {
        return { success: false, error: "Registration is currently disabled." };
      }
    }

    // Check if the account has been deactivated
    const deactivatedUser = await prisma.user.findUnique({
      where: { email },
      select: { status: true },
    });
    if (deactivatedUser && (deactivatedUser.status === "Deactivated" || deactivatedUser.status?.toLowerCase() === "inactive")) {
      return { success: false, error: "Invalid email, please use other email" };
    }

    let finalFirstName = inputFirstName || name.split(" ")[0] || "User";
    let finalLastName = inputLastName || name.split(" ").slice(1).join(" ") || "User";

    let generatedCreds;
    try {
      generatedCreds = await generateUniqueCredentials(sitename, finalFirstName, finalLastName, email);
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }

    const { gingerUsername: generatedGingerUsername, gingerEmail: generatedGingerEmail, password: generatedPassword } = generatedCreds;

    // console.log("=== GOOGLE SIGNUP DETAILS ===");
    // console.log("Referrer:", normalizedReferrer);
    // console.log("Generated gingerEmail:", generatedGingerEmail);
    // console.log("Generated gingerUsername:", generatedGingerUsername);
    // console.log("Generated Password:", generatedPassword);
    // console.log("==============================");


    const payload = {
      email,
      name: name || "User",
      firstName: inputFirstName,
      lastName: inputLastName,
      gingerEmail: generatedGingerEmail,
      gingerUsername: generatedGingerUsername,
      gingerPassword: generatedPassword,
      password,
      phone,
      facebook,
      refererEmail: normalizedReferrer,
    };

    cookieStore.set({
      name: "pending_signup_payload",
      value: await signCookieValue("pending_signup_payload", JSON.stringify(payload), 60 * 60 * 24 * 7),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    cookieStore.set({
      name: "onboarding_email",
      value: await signCookieValue("onboarding_email", email, 60 * 60 * 24 * 7),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.set({
      name: "onboarding_name",
      value: name || "User",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    // Delete any existing session since they are not fully registered yet
    cookieStore.delete("xnite_session");
    cookieStore.delete("signup_name");
    cookieStore.delete("signup_email");
    cookieStore.delete("pre_course_completed");

    return { success: true, gingerEmail: generatedGingerEmail, gingerUsername: generatedGingerUsername, password: generatedPassword };
  } catch (err) {
    console.error("Error completeProfileAction:", err);
    return { success: false, error: "Internal server error" };
  }
}

export async function completeDashboardAction() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { success: false, error: "User not found" };

    if (user.isDashboardCompleted) {
      return { success: true };
    }

    await prisma.user.update({
      where: { email },
      data: {
        isDashboardCompleted: true,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("completeDashboardAction error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function completePreCourseAction() {
  try {
    const cookieStore = await cookies();

    // DEBUG LOGS
    const allCookies = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
    // console.log("completePreCourseAction called. Cookies received:", allCookies);

    const sessionToken = cookieStore.get("xnite_session")?.value;
    let email = sessionToken ? await verifySessionToken(sessionToken) : null;
    let isFromOnboarding = false;

    if (!email) {
      email = await verifyCookieValue("onboarding_email", cookieStore.get("onboarding_email")?.value);
      if (email) isFromOnboarding = true;
    }

    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    // console.log("Authenticated with email:", email, "isFromOnboarding:", isFromOnboarding);

    await prisma.user.update({
      where: { email },
      data: { hasCompletedPreCourse: true },
    });

    cookieStore.set({
      name: "pre_course_completed",
      value: "true",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    if (isFromOnboarding) {
      cookieStore.set({
        name: "xnite_session",
        value: await signSessionToken(email),
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }

    return { success: true };
  } catch (err) {
    console.error("completePreCourseAction error:", err);
    return { success: false, error: "Failed to update pre-course status" };
  }
}

export async function registerWithGingerAction() {
  try {
    const cookieStore = await cookies();

    // 1ï¸âƒ£ Process pending signup if exists
    const pendingStr = await verifyCookieValue("pending_signup_payload", cookieStore.get("pending_signup_payload")?.value);
    if (pendingStr) {
      try {
        const payload = JSON.parse(pendingStr);
        const { email, name, firstName, lastName, gingerEmail, gingerUsername, gingerPassword, password, phone, facebook, refererEmail } = payload;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (!existingUser) {
          if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true") {
            return { success: false, error: "Registration is currently disabled." };
          }
          let finalRefererEmail = refererEmail || null;
          let finalLabelerRefererEmail = null;

          if (finalRefererEmail) {
            finalLabelerRefererEmail = finalRefererEmail;
            finalRefererEmail = "iru.xfnite@gmail.com";
          }

          const newUsername = email.split('@')[0];
          await prisma.user.create({
            data: {
              email,
              username: newUsername,
              name: name || gingerUsername,
              firstName,
              lastName,
              gingerEmail,
              gingerUsername,
              gingerPassword,
              password,
              phone,
              facebook,
              refererEmail: finalRefererEmail,
              labelerRefererEmail: finalLabelerRefererEmail,
              role: "applicant",
              status: "Active",
            }
          });

          await prisma.softwareCredential.create({
            data: {
              role: "applicant",
              softwareUid: gingerEmail,
              password: gingerPassword,
            }
          });

          if (finalRefererEmail) {
            try {
              const existingReferral = await prisma.referal.findUnique({ where: { email: finalRefererEmail } });
              if (existingReferral) {
                await prisma.referal.update({
                  where: { email: finalRefererEmail },
                  data: { howManyUse: { increment: 1 } },
                });
              }
            } catch (e) {
              console.error("Failed to increment referral:", e);
            }
          }
        }

        // Set xnite_session
        cookieStore.set({
          name: "xnite_session",
          value: await signSessionToken(email),
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24,
        });

        // Clear pending signup payload
        cookieStore.delete("pending_signup_payload");

      } catch (e) {
        console.error("Failed to parse or process pending_signup_payload:", e);
      }
    }

    const sessionToken = cookieStore.get("xnite_session")?.value;
    let email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) {
      email = await verifyCookieValue("onboarding_email", cookieStore.get("onboarding_email")?.value);
    }
    if (!email) return { success: false, error: "Not authenticated" };

    const user = await prisma.user.findUnique({
      where: { email },
      include: { referer: true },
    });

    if (!user) return { success: false, error: "Signup session expired (User not found). Please go back to the login page and sign in again to recreate your account." };
    if (user.isRegistered) return { success: true };
    const gingerPassword = user.gingerPassword || user.password;
    if (!user.gingerEmail || !user.gingerUsername || !gingerPassword) {
      // console.log("[registerWithGingerAction] Missing credentials", { email: user.gingerEmail, username: user.gingerUsername, pass: !!gingerPassword });
      return { success: false, error: "No credentials on file â€” please complete registration first" };
    }

    // 1ï¸âƒ£ PERFORM GINGER SIGNUP (deferred from initial signup)
    // Send the recruiter the user actually picked (labelerRefererEmail), or the old
    // referal-table referer for older accounts, as their Ginger account email.
    // Ginger only accepts recruiters registered there, so if it rejects that
    // referer we retry with iru.
    const IRU_REFERER_EMAIL = "iru.xfnite@gmail.com";
    const IRU_IMITATION_CODE = "MJRS0F";
    let preferredReferer = (user.labelerRefererEmail || user.refererEmail || "").trim().toLowerCase();
    let usingIruReferer = !preferredReferer || preferredReferer === IRU_REFERER_EMAIL;
    let preferredCode = IRU_IMITATION_CODE;
    let preferredReferalEmail: string | null = null;
    if (!usingIruReferer) {
      // Recruiters with a referal row are known to Ginger by that row's email (see
      // findReferalFor), even when the recruit was saved under their Xfnite login.
      const referal = await findReferalFor(preferredReferer);
      if (referal) {
        preferredReferer = referal.email;
        preferredCode = referal.code || IRU_IMITATION_CODE;
        preferredReferalEmail = referal.email;
      } else {
        // No referal row: an Xfnite recruiter is known to Ginger by their Ginger email.
        const refererAccount = await prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: preferredReferer, mode: "insensitive" } },
              { gingerEmail: { equals: preferredReferer, mode: "insensitive" } },
            ],
          },
          select: { gingerEmail: true },
        });
        // An Xfnite account without a Ginger email can't be a Ginger referer — use iru.
        const refererGingerEmail = refererAccount?.gingerEmail?.trim().toLowerCase();
        if (refererGingerEmail) preferredReferer = refererGingerEmail;
        else if (refererAccount) usingIruReferer = true;
      }
    }

    const payload = {
      contact: user.phone || " ",
      email: user.gingerEmail,
      graduate_date: " ",
      imitation_code: usingIruReferer ? IRU_IMITATION_CODE : preferredCode,
      occupied: " ",
      password: gingerPassword,
      password_conf: gingerPassword,
      payee_name: "",
      payee_uid: "",
      referal_email: usingIruReferer ? IRU_REFERER_EMAIL : preferredReferer,
      username: user.gingerUsername,
    };

    let finalGingerUsername = user.gingerUsername;
    let finalGingerEmail = user.gingerEmail;
    let finalPassword = gingerPassword;

    let signupSucceeded = false;
    let lastError = "";

    // One extra attempt covers the iru-referer fallback below.
    for (let attempt = 1; attempt <= 6; attempt++) {
      const gingerRes = await performGingerSignup(payload);
      // console.log(`[registerWithGingerAction] Attempt ${attempt} signup result:`, gingerRes);

      if (gingerRes.success) {
        signupSucceeded = true;
        break;
      }

      if (!gingerRes.success) {
        lastError = gingerRes.error || "Signup failed";

        // Not a username/email clash, so most likely Ginger rejected the referer
        // (not a registered recruiter there). Retry once with iru as the referer.
        if (!usingIruReferer && !/username|duplicate|already/i.test(lastError)) {
          console.warn(`[registerWithGingerAction] Referer ${preferredReferer} rejected (${lastError}); retrying with ${IRU_REFERER_EMAIL}`);
          usingIruReferer = true;
          payload.referal_email = IRU_REFERER_EMAIL;
          payload.imitation_code = IRU_IMITATION_CODE;
          continue;
        }

        const canRetry = /system error|username|duplicate|already|exist/i.test(lastError);
        if (!canRetry) break;

        const nameParts = (user.name || user.email.split("@")[0]).split(" ");
        const retryFirstName = nameParts[0] || "User";
        const retryLastName = nameParts.slice(1).join(" ") || "User";

        let regenerated;
        try {
          regenerated = await generateUniqueCredentials(user.referer?.sitename || "XFd_", retryFirstName, retryLastName, user.email);
        } catch (e) {
          lastError = (e as Error).message;
          break;
        }

        finalGingerUsername = regenerated.gingerUsername;
        finalGingerEmail = regenerated.gingerEmail;
        finalPassword = regenerated.password;

        payload.email = finalGingerEmail;
        payload.username = finalGingerUsername;
        payload.password = finalPassword;
        payload.password_conf = finalPassword;

        continue;
      }

      break;
    }

    if (!signupSucceeded) {
      // console.log("[registerWithGingerAction] All 5 attempts failed. Last error:", lastError);
      return { success: false, error: lastError };
    }

    // refererEmail (a foreign key to Referal) records who Ginger credited: the
    // recruiter's referal row if Ginger accepted it, else iru. Only for signups where
    // labelerRefererEmail holds the recruiter; older signups keep the recruiter in
    // refererEmail itself, so that must not be overwritten.
    if (user.labelerRefererEmail) {
      const gingerCredited = !usingIruReferer && preferredReferalEmail ? preferredReferalEmail : IRU_REFERER_EMAIL;
      if (gingerCredited !== user.refererEmail?.toLowerCase()) {
        await prisma.user.update({ where: { email }, data: { refererEmail: gingerCredited } });
      }
    }

    // Update user in our DB if username/email/password changed
    if (finalGingerEmail !== user.gingerEmail || finalGingerUsername !== user.gingerUsername || finalPassword !== gingerPassword) {
      await prisma.user.update({
        where: { email },
        data: { gingerEmail: finalGingerEmail, gingerUsername: finalGingerUsername, gingerPassword: finalPassword }
      });
      await prisma.softwareCredential.update({
        where: { softwareUid: user.gingerEmail! },
        data: { softwareUid: finalGingerEmail, password: finalPassword }
      }).catch((e: any) => console.warn("Failed to update software credential UID:", e));
    }

    // 2ï¸âƒ£ LOGIN WITH GINGER
    const gingerResult = await loginWithGingerCredentials(finalGingerEmail, finalPassword);
    // console.log("[registerWithGingerAction] Login result:", gingerResult);
    if (!gingerResult.success) return gingerResult;

    if (gingerResult.data?.credential?.access_token) {
      cookieStore.set({
        name: "ginger_access_token",
        value: gingerResult.data.credential.access_token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }

    await prisma.user.update({
      where: { email },
      data: { isRegistered: true, lastLogin: new Date(), status: "Active" },
    });

    return { success: true, data: gingerResult.data };
  } catch (err) {
    console.error("registerWithGingerAction error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function forceGingerLoginAction() {
  try {
    // console.log("[forceGingerLoginAction] Started");
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    // console.log("[forceGingerLoginAction] Session email:", email);
    if (!email) return { success: false, error: "Not authenticated" };

    const user = await prisma.user.findUnique({ where: { email } });
    // console.log("[forceGingerLoginAction] User found:", !!user);
    if (!user) return { success: false, error: "User not found" };

    const gingerEmail = user.gingerEmail || user.email;
    const gingerPassword = user.gingerPassword || user.password;
    // console.log("[forceGingerLoginAction] Ginger credentials available:", !!gingerEmail, !!gingerPassword);

    if (!gingerEmail || !gingerPassword) {
      return { success: false, error: "No Ginger credentials found" };
    }

    // console.log("[forceGingerLoginAction] Attempting loginWithGingerCredentials...");
    const gingerResult = await loginWithGingerCredentials(gingerEmail, gingerPassword);
    // console.log("[forceGingerLoginAction] gingerResult success:", gingerResult.success);

    if (!gingerResult.success) {
      console.error("[forceGingerLoginAction] gingerResult error:", gingerResult.error);
      return gingerResult;
    }

    const token = gingerResult.data?.credential?.access_token;
    // console.log("[forceGingerLoginAction] Received access_token:", !!token);

    if (token) {
      cookieStore.set({
        name: "ginger_access_token",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      // console.log("[forceGingerLoginAction] Set ginger_access_token cookie. Returning token.");
      return { success: true, token };
    }

    console.error("[forceGingerLoginAction] Missing access_token in gingerResult.data:", gingerResult.data);
    return { success: false, error: "Failed to retrieve access token from Ginger" };
  } catch (err) {
    console.error("[forceGingerLoginAction] Unexpected server error:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

export async function getTrainingPassStatusAction(): Promise<{
  isLandcoverPassed: boolean;
  isTransportationPassed: boolean;
  isRoofPassed: boolean;
}> {
  const defaultResult = { isLandcoverPassed: false, isTransportationPassed: false, isRoofPassed: false };
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return defaultResult;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { role: true, trainings: true }
    });

    if (!user) return defaultResult;

    const role = user.role?.toLowerCase() || "";
    if (["admin", "checker", "judger"].includes(role)) {
      // console.log("[getTrainingPassStatusAction] exempt role:", role, "- returning all passed");
      return { isLandcoverPassed: true, isTransportationPassed: true, isRoofPassed: true };
    }

    const trainings = (user.trainings?.trainings as any[]) || [];

    const isLandcoverPassed = checkTrainingPassedFromList(trainings, "landcover");
    const isTransportationPassed = checkTrainingPassedFromList(trainings, "transpo");
    const isRoofPassed = checkTrainingPassedFromList(trainings, "roof");


    return { isLandcoverPassed, isTransportationPassed, isRoofPassed };
  } catch (err) {
    console.error("getTrainingPassStatusAction error:", err);
    return defaultResult;
  }
}

export async function checkStandardBuildingPassedAction(clientToken?: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    // Instead of making a flaky API call to Ginger, we just read from our own database
    // because ActiveProjectsTab already syncs the user's trainings to our DB!
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return false;

    // Demo/stub account: treat as passed without any Ginger call.
    if (isDemoGingerEmail(email)) return true;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, isRegistered: true },
    });

    if (!user) return false;

    // If they are no longer an applicant (e.g. they are a labeler, admin, checker),
    // it means they have ALREADY successfully passed and been promoted!
    if (user.role !== "applicant") {
      return true;
    }

    // Only applicants need their (possibly large) training list.
    const training = await prisma.training.findUnique({
      where: { userId: user.id },
      select: { trainings: true },
    });
    const trainings = (training?.trainings as any[]) || [];

    // Check if Standard Building (ID 1) is passed
    const standardBuilding = trainings.find((t: any) => t.annotate_project_id === 1 || t.annotate_sub_project_id === 1);

    const rawStatus = standardBuilding?.training_status_desc || "";
    let isPassed = rawStatus === "STATUS_PASSED" || rawStatus.toLowerCase() === "passed";

    // A reset user (new Ginger account on reactivation) who isn't registered yet has no
    // Ginger account for their current credentials, so a token their browser still
    // holds belongs to the old account and must not count.
    const isUnregisteredReset = !user.isRegistered && (await isGingerResetApplicant(email));
    if (!isPassed && clientToken && !isUnregisteredReset) {
      try {
        const response = await fetch(`${GINGER_BASE}/bac/mapping/annotate/training-annotate/list-ongoing-projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clientToken}`
          },
          body: JSON.stringify({ region: "phi" })
        });

        if (response.ok) {
          const result = await response.json();
          const list = result?.training_annotate_list || [];

          if (list.length > 0) {
            await prisma.training.upsert({
              where: { userId: user.id },
              update: { trainings: list },
              create: { userId: user.id, trainings: list },
            });

            const newStandardBuilding = list.find((t: any) => t.annotate_project_id === 1 || t.annotate_sub_project_id === 1);
            const newRawStatus = newStandardBuilding?.training_status_desc || newStandardBuilding?.trainingStatus || "";
            isPassed = newRawStatus === "STATUS_PASSED" || newRawStatus.toLowerCase() === "passed";
          }
        }
      } catch (err) {
        console.error("checkStandardBuildingPassedAction API fallback error:", err);
      }
    }

    if (isPassed) {
      // Cache the passed status for 30 days
      cookieStore.set("xnite_training_passed", "true", { maxAge: 60 * 60 * 24 * 30, path: "/" });
      // Clear the temporary failed check cache if it exists
      cookieStore.delete("xnite_training_failed_cache");

      const sessionToken = cookieStore.get("xnite_session")?.value;
      const email = sessionToken ? await verifySessionToken(sessionToken) : null;
      if (email) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { role: true, gingerEmail: true }
        });
        if (user && user.role === "applicant") {
          await prisma.user.update({
            where: { email },
            data: { role: "labeler" }
          });
          if (user.gingerEmail) {
            await prisma.softwareCredential.update({
              where: { softwareUid: user.gingerEmail },
              data: { role: "labeler" }
            }).catch((e: any) => console.warn("Failed to update software credential role to labeler:", e));
          }
        }
      }
    } else {
      // Cache the "not passed" status for 30 seconds to prevent rapid navigation queries
      cookieStore.set("xnite_training_failed_cache", "true", { maxAge: 30, path: "/" });
    }

    return isPassed;
  } catch (error) {
    console.error("checkStandardBuildingPassedAction error:", error);
    return false;
  }
}

/**
 * Lightweight lookup for the user's most recent profile change request.
 * Used by the header bell to surface PENDING/REJECTED status without paying
 * the cost of the full /api/account route.
 */
export async function getMyProfileChangeRequestAction() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) {
      return { success: false as const, request: null };
    }

    const request = await prisma.profileChangeRequest.findFirst({
      where: { userEmail: email },
      orderBy: { createdAt: "desc" },
    });

    return { success: true as const, request: request || null };
  } catch (error) {
    console.error("getMyProfileChangeRequestAction error:", error);
    return { success: false as const, request: null };
  }
}

export async function updateSettingsAction(data: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  facebook?: string;
  password?: string;
  gingerEmail?: string;
  gingerPassword?: string;
}) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const { firstName, lastName, phone, facebook, password, gingerEmail, gingerPassword } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const updateData: any = {};
    if (phone !== undefined) updateData.phone = phone;
    if (password !== undefined && password.trim() !== "") {
      updateData.password = password;
    }
    if (gingerEmail !== undefined && gingerEmail.trim() !== "") {
      updateData.gingerEmail = gingerEmail.trim().toLowerCase();
    }
    if (gingerPassword !== undefined && gingerPassword.trim() !== "") {
      updateData.gingerPassword = gingerPassword;
    }

    // Check if name or facebook changes are being requested
    const currentFirstName = (user.firstName || "").trim();
    const currentLastName = (user.lastName || "").trim();
    const currentFacebook = (user.facebook || "").trim();

    const newFirstName = firstName !== undefined ? firstName.trim() : currentFirstName;
    const newLastName = lastName !== undefined ? lastName.trim() : currentLastName;
    const newFacebook = facebook !== undefined ? facebook.trim() : currentFacebook;

    const isNameChanged = (newFirstName !== currentFirstName) || (newLastName !== currentLastName);
    const isFacebookChanged = (newFacebook !== currentFacebook);

    let isPendingApproval = false;

    if (isNameChanged || isFacebookChanged) {
      // A name / facebook change may only ever be requested once. ANY prior
      // request consumes the allowance regardless of status — a REJECTED or
      // APPROVED one counts just the same, because the user already had their
      // one attempt. Corrections have to go through support.
      const priorRequests = await prisma.profileChangeRequest.findMany({
        where: { userEmail: email },
        select: {
          status: true,
          requestedFirstName: true,
          requestedLastName: true,
          requestedFacebook: true,
        },
      });

      if (priorRequests.some((r) => r.status === "PENDING")) {
        return { success: false, error: "You already have a pending profile change request under review by an admin." };
      }

      if (isNameChanged && priorRequests.some((r) => r.requestedFirstName || r.requestedLastName)) {
        return { success: false, error: "You have already used your one-time name change. Please contact support if this needs to be corrected." };
      }

      if (isFacebookChanged && priorRequests.some((r) => r.requestedFacebook)) {
        return { success: false, error: "You have already used your one-time Facebook link change. Please contact support if this needs to be corrected." };
      }

      await prisma.profileChangeRequest.create({
        data: {
          userEmail: email,
          requestedFirstName: isNameChanged ? newFirstName : null,
          requestedLastName: isNameChanged ? newLastName : null,
          requestedFacebook: isFacebookChanged ? newFacebook : null,
          status: "PENDING",
        },
      });

      isPendingApproval = true;
    }

    // Apply immediate updates (phone, password, ginger email/password) if any
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { email },
        data: updateData,
      });
    }

    // Invalidate the cache if anything changed
    if (isNameChanged || isFacebookChanged || Object.keys(updateData).length > 0) {
      if (isRedisReady()) {
        await redis.del(`api_account_cache:${email}`);
      }
    }

    if (isPendingApproval) {
      return {
        success: true,
        isPendingApproval: true,
        message: "Your profile change request has been submitted for admin approval.",
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in updateSettingsAction:", error);

    const isUniqueConstraint =
      error?.code === "P2002" ||
      (error?.message && error.message.includes("Unique constraint failed"));

    const isGingerEmailField =
      (error?.meta?.target && error.meta.target.includes("gingerEmail")) ||
      (error?.message && error.message.includes("gingerEmail"));

    if (isUniqueConstraint && isGingerEmailField) {
      return { success: false, error: "This Ginger email is already in use by another account. Please choose a different one." };
    }

    return { success: false, error: toUserFacingError(error, "Couldn't update settings. Please try again.") };
  }
}

export async function logCliErrorAction(message: string) {
  console.error(`\x1b[31m[CLI ERROR LOG]\x1b[0m ${message}`);
}

export async function getExistingGingerUsernames(identifiers: string[]): Promise<string[]> {
  try {
    if (!(await getStaffUser())) return [];
    const cleanIds = Array.from(new Set(identifiers.filter(Boolean).map(u => u.trim().toLowerCase())));
    if (cleanIds.length === 0) return [];

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { gingerUsername: { in: cleanIds, mode: "insensitive" } },
          { gingerEmail: { in: cleanIds, mode: "insensitive" } },
          { name: { in: cleanIds, mode: "insensitive" } },
          { email: { in: cleanIds, mode: "insensitive" } }
        ]
      },
      select: {
        gingerUsername: true,
        gingerEmail: true,
        name: true,
        email: true
      }
    });

    const foundSet = new Set<string>();
    existingUsers.forEach(u => {
      if (u.gingerUsername) foundSet.add(u.gingerUsername.trim().toLowerCase());
      if (u.gingerEmail) foundSet.add(u.gingerEmail.trim().toLowerCase());
      if (u.name) foundSet.add(u.name.trim().toLowerCase());
      if (u.email) foundSet.add(u.email.trim().toLowerCase());
    });

    return cleanIds.filter(id => foundSet.has(id));
  } catch (err) {
    console.error("Error checking existing ginger usernames:", err);
    return identifiers.map(id => id.trim().toLowerCase());
  }
}

export async function getGroupLinksAction(groupId: number): Promise<{ checkerLink: string | null; judgerLink: string | null; checkerName: string | null; judgerName: string | null; logoUrl: string | null }> {
  try {
    if (!(await getStaffUser())) return { checkerLink: null, judgerLink: null, checkerName: null, judgerName: null, logoUrl: null };
    const groups = await prisma.group.findMany({
      where: { groupId: Number(groupId) },
      select: { checkerLink: true, judgerLink: true, checkerName: true, judgerName: true, parentGroupId: true, logoUrl: true }
    });

    const checkerGroup = groups.find(g => g.checkerLink && g.checkerLink.trim() !== "");
    const judgerGroup = groups.find(g => g.judgerLink && g.judgerLink.trim() !== "");
    const logoGroup = groups.find(g => g.logoUrl && g.logoUrl.trim() !== "");
    const groupRecord = groups[0];

    // checkerName lives on the group itself
    const checkerName = groupRecord?.checkerName || null;

    // judgerName lives on the parent team — same pattern as the applicants page
    let judgerName: string | null = groupRecord?.judgerName || null;
    if (groupRecord?.parentGroupId != null) {
      const parentGroups = await prisma.group.findMany({
        where: { groupId: groupRecord.parentGroupId },
        select: { judgerName: true }
      });
      const parentRecord = parentGroups[0];
      if (parentRecord?.judgerName) {
        judgerName = parentRecord.judgerName;
      }
    }

    return {
      checkerLink: checkerGroup?.checkerLink || null,
      judgerLink: judgerGroup?.judgerLink || null,
      checkerName,
      judgerName,
      logoUrl: logoGroup?.logoUrl || groupRecord?.logoUrl || null,
    };
  } catch (err) {
    console.error("Error fetching group links from PostgreSQL:", err);
    return { checkerLink: null, judgerLink: null, checkerName: null, judgerName: null, logoUrl: null };
  }
}

/**
 * Resolves the checker and judger display names for a set of groups and teams.
 *
 * Checkers live on the group itself; judgers live on the team, reachable either
 * through a group's parentGroupId or directly from a user's team_id. Both fields
 * store a ginger username rather than a display name, so they are mapped through
 * User.gingerUsername / User.username, falling back to the raw username when no
 * user matches. Groups/teams with no one assigned are absent from the maps.
 *
 * Callers that have both ids should prefer judgerByGroupId (the group's parent
 * team) and fall back to judgerByTeamId, mirroring the applicants page.
 */
export async function getGroupStaffNamesAction(groupIds: number[], teamIds: number[] = []): Promise<{
  checkerByGroupId: Record<number, string>;
  judgerByGroupId: Record<number, string>;
  judgerByTeamId: Record<number, string>;
}> {
  const empty = { checkerByGroupId: {}, judgerByGroupId: {}, judgerByTeamId: {} };
  try {
    if (!(await getStaffUser())) return empty;
    const cleanIds = (ids: number[]) => Array.from(new Set(ids.map(Number).filter(id => !isNaN(id))));
    const groupNumericIds = cleanIds(groupIds);
    const teamNumericIds = cleanIds(teamIds);
    if (groupNumericIds.length === 0 && teamNumericIds.length === 0) return empty;

    const groups = await prisma.group.findMany({
      where: { groupId: { in: Array.from(new Set([...groupNumericIds, ...teamNumericIds])) } },
      select: { groupId: true, checkerName: true, judgerName: true, parentGroupId: true }
    });

    // groupId is not unique across rows, so keep the first row that fills each field.
    const checkerByGroupId = new Map<number, string>();
    const judgerByGroupId = new Map<number, string>();
    const parentByGroupId = new Map<number, number>();
    groups.forEach((g) => {
      const checker = g.checkerName?.trim();
      if (checker && !checkerByGroupId.has(g.groupId)) checkerByGroupId.set(g.groupId, checker);

      const judger = g.judgerName?.trim();
      if (judger && !judgerByGroupId.has(g.groupId)) judgerByGroupId.set(g.groupId, judger);

      if (g.parentGroupId != null && !parentByGroupId.has(g.groupId)) parentByGroupId.set(g.groupId, g.parentGroupId);
    });

    // A group's judger lives on its parent team, so pull in any parents not already loaded.
    const missingParentIds = Array.from(new Set(Array.from(parentByGroupId.values())))
      .filter(id => !judgerByGroupId.has(id) && !groups.some(g => g.groupId === id));
    if (missingParentIds.length > 0) {
      const parents = await prisma.group.findMany({
        where: { groupId: { in: missingParentIds } },
        select: { groupId: true, judgerName: true }
      });
      parents.forEach((p) => {
        const judger = p.judgerName?.trim();
        if (judger && !judgerByGroupId.has(p.groupId)) judgerByGroupId.set(p.groupId, judger);
      });
    }

    // Point each group at its parent team's judger, preferring the parent over its own.
    const judgerForGroup = new Map<number, string>();
    groupNumericIds.forEach((groupId) => {
      const parentId = parentByGroupId.get(groupId);
      const judger = (parentId != null ? judgerByGroupId.get(parentId) : undefined) ?? judgerByGroupId.get(groupId);
      if (judger) judgerForGroup.set(groupId, judger);
    });

    const judgerForTeam = new Map<number, string>();
    teamNumericIds.forEach((teamId) => {
      const judger = judgerByGroupId.get(teamId);
      if (judger) judgerForTeam.set(teamId, judger);
    });

    const usernames = Array.from(new Set([
      ...Array.from(checkerByGroupId.values()),
      ...Array.from(judgerForGroup.values()),
      ...Array.from(judgerForTeam.values()),
    ].map(n => n.toLowerCase())));

    const nameByUsername = new Map<string, string>();
    if (usernames.length > 0) {
      const dbUsers = await prisma.user.findMany({
        where: {
          OR: [
            { gingerUsername: { in: usernames, mode: "insensitive" } },
            { username: { in: usernames, mode: "insensitive" } }
          ]
        },
        select: { name: true, username: true, gingerUsername: true }
      });
      dbUsers.forEach((u) => {
        if (!u.name) return;
        if (u.gingerUsername) nameByUsername.set(u.gingerUsername.trim().toLowerCase(), u.name);
        if (u.username) nameByUsername.set(u.username.trim().toLowerCase(), u.name);
      });
    }

    const toRecord = (source: Map<number, string>) => {
      const out: Record<number, string> = {};
      source.forEach((username, id) => {
        out[id] = nameByUsername.get(username.toLowerCase()) || username;
      });
      return out;
    };

    return {
      checkerByGroupId: toRecord(checkerByGroupId),
      judgerByGroupId: toRecord(judgerForGroup),
      judgerByTeamId: toRecord(judgerForTeam),
    };
  } catch (err) {
    console.error("Error fetching group staff names:", err);
    return empty;
  }
}

export async function getGroupLinksMultipleAction(groupIds: number[]): Promise<Record<number, { checkerLink: string | null; judgerLink: string | null }>> {
  try {
    if (!(await getStaffUser())) return {};
    const numericIds = groupIds.map(id => Number(id)).filter(id => !isNaN(id));
    if (numericIds.length === 0) return {};

    const groups = await prisma.group.findMany({
      where: { groupId: { in: numericIds } },
      select: { groupId: true, checkerLink: true, judgerLink: true }
    });

    const result: Record<number, { checkerLink: string | null; judgerLink: string | null }> = {};
    for (const id of numericIds) {
      const matchingGroups = groups.filter(g => g.groupId === id);
      const checkerGroup = matchingGroups.find(g => g.checkerLink && g.checkerLink.trim() !== "");
      const judgerGroup = matchingGroups.find(g => g.judgerLink && g.judgerLink.trim() !== "");

      result[id] = {
        checkerLink: checkerGroup?.checkerLink || null,
        judgerLink: judgerGroup?.judgerLink || null,
      };
    }
    return result;
  } catch (err) {
    console.error("Error fetching multiple group links:", err);
    return {};
  }
}

export async function updateGroupLinkAction(groupId: number, linkRole: "checker" | "judger", link: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    const userRole = user?.role?.toLowerCase() || "";
    // Judgers may only edit the judger link, checkers only the checker link; admin edits both.
    const canEdit = userRole === "admin" || userRole === linkRole;
    if (!canEdit) {
      return { success: false, error: "You are not authorized to edit this link." };
    }

    let trimmedLink = link.trim();
    if (trimmedLink && !/^https?:\/\//i.test(trimmedLink)) {
      trimmedLink = `https://${trimmedLink}`;
    }
    const linkData = linkRole === "checker" ? { checkerLink: trimmedLink || null } : { judgerLink: trimmedLink || null };
    // Groups are only ever referenced by ID (via User.group_id/team_id) and are
    // never proactively inserted into this table, so the row may not exist yet.
    await prisma.group.upsert({
      where: { groupId: Number(groupId) },
      update: linkData,
      create: {
        groupId: Number(groupId),
        groupName: `Group #${groupId}`,
        ...linkData,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("updateGroupLinkAction failed:", err);
    return { success: false, error: "Failed to update group link." };
  }
}

export async function getWorkLogsForUsernamesAction(usernames: string[]) {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const cleanNames = Array.from(
      new Set(usernames.map((u) => (u || "").trim()).filter(Boolean))
    );
    if (cleanNames.length === 0) return { success: true, data: [] };

    const logs = await prisma.workLog.findMany({
      where: {
        ownerName: {
          in: cleanNames,
          mode: "insensitive"
        }
      },
      orderBy: {
        id: "desc",
      },
    });
    return { success: true, data: logs };
  } catch (err: any) {
    console.error("getWorkLogsForUsernamesAction failed:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load work logs. Please try again.") };
  }
}

export async function getGroupMembersDetailsAction(identifiers: string[]) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail) return { success: false, error: "Not authenticated" };

    const sessionUser = await prisma.user.findUnique({ where: { email: sessionEmail }, select: { role: true } });
    if (!isStaff(sessionUser?.role ?? undefined)) {
      return { success: false, error: "You are not authorized to view member details." };
    }

    const cleanIds = Array.from(new Set(identifiers.filter(Boolean).map(u => u.trim().toLowerCase())));
    if (cleanIds.length === 0) return { success: true, data: [] };

    const dbUsers = await prisma.user.findMany({
      where: {
        OR: [
          { gingerUsername: { in: cleanIds, mode: "insensitive" } },
          { gingerEmail: { in: cleanIds, mode: "insensitive" } },
          { name: { in: cleanIds, mode: "insensitive" } },
          { email: { in: cleanIds, mode: "insensitive" } }
        ]
      },
      omit: {
        password: true,
        gingerPassword: true,
        labelerPassword: true,
      },
      include: {
        trainings: true,
        // The group page only checks whether a QR is on file; payout account details stay server-side.
        paymentDetails: { select: { qrImageUrl: true } },
        referer: {
          select: {
            name: true
          }
        }
      }
    });

    const labelerEmails = new Set<string>();
    dbUsers.forEach((u) => {
      if (u.labelerRefererEmail) labelerEmails.add(u.labelerRefererEmail);
    });

    if (labelerEmails.size > 0) {
      // Recruiters can be stored by their referal email, which may have no Xfnite
      // account, so fall back to the referal row's name (same order as attachLabelerNames).
      const [labelers, referals] = await Promise.all([
        prisma.user.findMany({
          where: { email: { in: Array.from(labelerEmails) } },
          select: { email: true, name: true, firstName: true, lastName: true, gingerUsername: true }
        }),
        prisma.referal.findMany({
          where: { email: { in: Array.from(labelerEmails) } },
          select: { email: true, name: true, username: true }
        }),
      ]);
      const nameByEmail = new Map<string, string>();
      referals.forEach((r) => {
        const name = r.name?.trim() || r.username?.trim();
        if (name) nameByEmail.set(r.email, name);
      });
      labelers.forEach((l) => {
        nameByEmail.set(l.email, (l.firstName && l.lastName) ? l.firstName + ' ' + l.lastName : (l.name || l.gingerUsername || l.email));
      });
      const mapped = dbUsers.map(u => ({
        ...u,
        labelerRefererName: u.labelerRefererEmail ? nameByEmail.get(u.labelerRefererEmail) || null : null
      }));
      return { success: true, data: mapped };
    }

    return { success: true, data: dbUsers };
  } catch (err: any) {
    console.error("Error getGroupMembersDetailsAction:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load member details. Please try again.") };
  }
}
type GroupSyncArgs = [
  groupId: number,
  groupType: string,
  usersList: any[],
  groupInfo?: { groupName?: string; managerEmail?: string; ownerEmail?: string }
];
type GroupSyncResult = { success: boolean; error?: string };

// One sync per group at a time. A request arriving while a sync runs records
// the newest member list and marks the group dirty; the running loop then does
// one more pass with that list. Every caller resolves after a pass that
// included its data, so nothing is dropped, but page reloads no longer stack
// up parallel syncs of the same group.
const groupSyncs = new Map<number, { latestArgs: GroupSyncArgs; dirty: boolean; done: Promise<GroupSyncResult> }>();

export async function syncGroupAndMembersAction(...args: GroupSyncArgs): Promise<GroupSyncResult> {
  if (!(await getStaffUser())) return { success: false, error: "Not authorized" };

  const key = Number(args[0]);
  const existing = groupSyncs.get(key);
  if (existing) {
    existing.latestArgs = args;
    existing.dirty = true;
    return existing.done;
  }

  const state = { latestArgs: args, dirty: false, done: Promise.resolve<GroupSyncResult>({ success: true }) };
  state.done = (async () => {
    let result: GroupSyncResult = { success: true };
    try {
      do {
        state.dirty = false;
        result = await runGroupSync(...state.latestArgs);
      } while (state.dirty);
    } finally {
      groupSyncs.delete(key);
    }
    return result;
  })();
  groupSyncs.set(key, state);
  return state.done;
}

async function runGroupSync(...[groupId, groupType, usersList, groupInfo]: GroupSyncArgs): Promise<GroupSyncResult> {
  try {
    const cleanGroupId = Number(groupId);
    if (!cleanGroupId || isNaN(cleanGroupId)) return { success: false, error: "Invalid group ID" };

    const type = (groupType || "group").toLowerCase();

    // Koala/Ginger groups are only ever referenced by ID (via User.group_id/team_id)
    // and are never proactively inserted into this table, so upsert it here on every
    // sync instead of only reactively when someone edits a group chat link.
    const existingGroup = await prisma.group.findUnique({
      where: { groupId: cleanGroupId }
    });

    const nameToUse = existingGroup?.groupName || groupInfo?.groupName || `Group #${cleanGroupId}`;

    await prisma.group.upsert({
      where: { groupId: cleanGroupId },
      update: {
        groupName: nameToUse,
        groupType: type,
        ...(groupInfo?.managerEmail ? { managerEmail: groupInfo.managerEmail } : {}),
        ...(groupInfo?.ownerEmail ? { ownerEmail: groupInfo.ownerEmail } : {}),
      },
      create: {
        groupId: cleanGroupId,
        groupName: nameToUse,
        groupType: type,
        managerEmail: groupInfo?.managerEmail || null,
        ownerEmail: groupInfo?.ownerEmail || null,
      },
    });

    if (!Array.isArray(usersList) || usersList.length === 0) {
      return { success: true };
    }

    const validEmails = Array.from(new Set(
      usersList
        .map(u => u.user_email ? u.user_email.trim() : null)
        .filter(Boolean) as string[]
    ));

    const validUsernames = Array.from(new Set(
      usersList
        .map(u => u.user_name ? u.user_name.trim() : null)
        .filter(Boolean) as string[]
    ));

    if (validEmails.length === 0 && validUsernames.length === 0) {
      return { success: true };
    }

    const conditions: any[] = [];
    if (validEmails.length > 0) {
      conditions.push({ email: { in: validEmails, mode: "insensitive" } });
      conditions.push({ gingerEmail: { in: validEmails, mode: "insensitive" } });
    }
    if (validUsernames.length > 0) {
      conditions.push({ gingerUsername: { in: validUsernames, mode: "insensitive" } });
    }

    const dbUsers = await prisma.user.findMany({
      where: { OR: conditions },
      select: { id: true, gingerUsername: true, gingerEmail: true, email: true, group_id: true, team_id: true }
    });

    const operations: any[] = [];

    for (const dbUser of dbUsers) {
      const updateData: any = {};
      if (type === "team") {
        if (dbUser.team_id !== cleanGroupId) updateData.team_id = cleanGroupId;
      } else {
        if (dbUser.group_id !== cleanGroupId) updateData.group_id = cleanGroupId;
      }

      if (Object.keys(updateData).length > 0) {
        operations.push(prisma.user.update({
          where: { id: dbUser.id },
          data: updateData
        }));
      }
    }

    // Execute all updates in chunks using transactions
    if (operations.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        await prisma.$transaction(operations.slice(i, i + CHUNK_SIZE));
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in syncGroupAndMembersAction:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't sync group members. Please try again.") };
  }
}

export async function syncMultipleGroupsAndMembersAction(
  groupsToSync: Array<{
    groupId: number;
    groupType: string;
    usersList: Array<{ user_name: string | null; user_email: string | null }>;
    groupInfo?: { groupName?: string; managerEmail?: string; ownerEmail?: string };
  }>
) {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const results = [];
    for (const group of groupsToSync) {
      const res = await syncGroupAndMembersAction(group.groupId, group.groupType, group.usersList, group.groupInfo);
      results.push(res);
    }
    return { success: true, results };
  } catch (err: any) {
    console.error("Error in syncMultipleGroupsAndMembersAction:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't sync the groups. Please try again.") };
  }
}

export async function getGroupMembersFromDbAction(groupId: number, groupType: string) {
  try {
    if (!(await getStaffUser())) return { success: false, error: "Not authorized" };
    const cleanGroupId = Number(groupId);
    if (!cleanGroupId || isNaN(cleanGroupId)) return { success: false, error: "Invalid group ID" };

    const type = (groupType || "group").toLowerCase();

    const groupEntity = await prisma.group.findUnique({
      where: { groupId: cleanGroupId }
    });

    const users = await prisma.user.findMany({
      where: type === "team" ? { team_id: cleanGroupId } : { group_id: cleanGroupId },
      select: {
        id: true,
        name: true,
        email: true,
        gingerUsername: true,
        gingerEmail: true,
        group_id: true,
        team_id: true,
        role: true,
      }
    });

    const groupName = groupEntity?.groupName || `Group #${cleanGroupId}`;

    const usersList = users.map((u, idx) => ({
      uid: idx + 1,
      user_name: u.gingerUsername || u.name || u.email.split("@")[0],
      user_email: u.gingerEmail || u.email,
      group_id: u.group_id ?? cleanGroupId,
      team_id: u.team_id ?? (type === "team" ? cleanGroupId : undefined),
      group_name: groupName,
      is_group_manager: Boolean(groupEntity?.managerEmail && (groupEntity.managerEmail === u.email || groupEntity.managerEmail === u.gingerEmail)),
      is_team_director: Boolean(groupEntity?.managerEmail && (groupEntity.managerEmail === u.email || groupEntity.managerEmail === u.gingerEmail)),
    }));

    return {
      success: true,
      data: {
        group: {
          group_id: cleanGroupId,
          group_name: groupName,
          group_type: type,
          manager_email: groupEntity?.managerEmail || undefined,
        },
        users: usersList
      }
    };
  } catch (err: any) {
    console.error("Error in getGroupMembersFromDbAction:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load the group. Please try again.") };
  }
}

export async function deleteAccountAction(password: string) {
  try {
    if (password !== "FH73DK") {
      return { success: false, error: "Incorrect delete password" };
    }

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.delete({ where: { email } });
      await prisma.softwareCredential.deleteMany({ where: { softwareUid: user.gingerEmail || "" } }).catch(() => { });
      await prisma.ranking.deleteMany({ where: { email } }).catch(() => { });
      await prisma.checkerRanking.deleteMany({ where: { email } }).catch(() => { });
    }

    cookieStore.delete("ginger_access_token");
    cookieStore.delete("xnite_session");
    cookieStore.delete("pre_course_completed");
    cookieStore.delete("pre_course_progress");
    cookieStore.delete("onboarding_email");
    cookieStore.delete("onboarding_name");

    return { success: true };
  } catch (err: any) {
    console.error("deleteAccountAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't delete account. Please try again.") };
  }
}

export async function syncGingerRoleAction() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const email = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!email) return { success: false, error: "Not authenticated" };

    const user = await prisma.user.findUnique({ where: { email }, select: { email: true, role: true } });
    if (!user) return { success: false, error: "User not found" };

    const gingerToken = cookieStore.get("ginger_access_token")?.value;
    if (!gingerToken) return { success: false, error: "No ginger access token found" };

    const detailRes = await fetch(GINGER_USER_DETAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gingerToken}`
      },
      body: JSON.stringify({})
    });

    if (!detailRes.ok) {
      return { success: false, error: "Failed to fetch user details from Ginger API" };
    }

    const detailData = await detailRes.json();
    const koalaUserDetails = detailData?.data?.koala_user_details || detailData?.koala_user_details || detailData;
    const gingerRole: string = koalaUserDetails?.role || "";

    const newRole = calculateNewRole(user.role, gingerRole);
    if (newRole !== user.role) {
      await prisma.user.update({
        where: { email: user.email },
        data: { role: newRole },
      });
      return { success: true, roleChanged: true, role: newRole };
    }

    return { success: true, roleChanged: false, role: user.role };
  } catch (err) {
    console.error("Failed to sync ginger role:", err);
    return { success: false, error: "Unexpected server error" };
  }
}

