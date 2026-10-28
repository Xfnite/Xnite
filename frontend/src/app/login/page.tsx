"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

function isSafeRedirectPath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      document.cookie = `signup_ref=${encodeURIComponent(ref)}; path=/; max-age=604800; SameSite=Lax`;
    }
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (errorParam === "AccountDoesNotExist") {
        setError("Account does not exist");
      } else if (errorParam === "GoogleAuthFailed") {
        setError("Google authentication failed.");
      } else {
        setError(errorParam);
      }
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      setError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
      return;
    }
    setIsLoading(true);
    setError("");

    try {
      const result = await loginAction({ email, password });

      if (result.success) {
        if (result.data && result.data.credential?.access_token) {
          localStorage.setItem(
            "scrapedGingerData",
            JSON.stringify(result.data),
          );
        }
        const requestedRedirect = searchParams.get("redirect");
        if (isSafeRedirectPath(requestedRedirect)) {
          router.push(requestedRedirect);
        } else if (result.redirect) {
          router.push(result.redirect);
        } else {
          router.push(
            result.hasCompletedPreCourse ? "/dashboard" : "/register?step=pre-course",
          );
        }
      } else {
        setError(
          result.error ||
            "Authentication failed. Please check your credentials.",
        );
      }
    } catch (err) {
      setError("Please refresh this page");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#E0E1DD] dark:bg-[#060D14] transition-colors duration-200 relative overflow-hidden">
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-scale-in { animation: scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-up { opacity: 0; animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        @keyframes float {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .mesh-blob {
          position: absolute;
          filter: blur(80px);
          border-radius: 50%;
          opacity: 0.4;
          animation: float 10s infinite ease-in-out;
        }
        .dark .mesh-blob {
          opacity: 0.15;
        }
      `}</style>
      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>
      {/* Mesh Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="mesh-blob bg-[#55f761]"
          style={{
            width: "40vw",
            height: "40vw",
            top: "-10%",
            left: "-10%",
            animationDelay: "0s",
            animationDuration: "12s",
          }}
        ></div>
        <div
          className="mesh-blob bg-[#1F7A1F]"
          style={{
            width: "50vw",
            height: "50vw",
            top: "40%",
            right: "-20%",
            animationDelay: "2s",
            animationDuration: "18s",
          }}
        ></div>
        <div
          className="mesh-blob bg-[#3de34a]"
          style={{
            width: "35vw",
            height: "35vw",
            bottom: "-10%",
            left: "20%",
            animationDelay: "4s",
            animationDuration: "14s",
          }}
        ></div>
      </div>{" "}
      <div className="relative z-10 w-full min-h-[560px] flex flex-col justify-center max-w-lg bg-white/60 dark:bg-black/60 backdrop-blur-xl border border-white/40 dark:border-white/15 rounded-tr-2xl rounded-bl-2xl shadow-2xl p-10 animate-scale-in">
        <div className="text-center mb-10 animate-fade-up delay-100">
          <div className="mx-auto flex items-center justify-center mb-6 h-12">
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-[#0D1B2A] dark:border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <img
                src={theme === "light" ? "/logo/Logo-light.svg" : "/logo/Logo.svg"}
                alt="Xnite Logo"
                className="h-full w-auto object-contain"
              />
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0D1B2A] dark:text-white hover:cu">
            Sign In
          </h1>
          <p className="text-sm text-[#2F3E46] dark:text-white/60 mt-1.5">
            Enter your credentials to continue
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form
          onSubmit={handleLogin}
          className="space-y-6 animate-fade-up delay-200"
        >
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-[#1B263B] dark:text-white/80"
              htmlFor="email"
            >
              Email Address
            </label>
            <input
              className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
              type="email"
              id="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-[#1B263B] dark:text-white/80"
              htmlFor="password"
            >
              Password
            </label>
            <div className="relative">
              <input
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
                type={showPassword ? "text" : "password"}
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              id="terms-login"
              required
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-black/20 dark:border-white/20 text-[#1F7A1F] dark:text-[#55f761] focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] bg-white dark:bg-white/10 hover:cursor-pointer shrink-0"
              disabled={isLoading}
            />
            <label htmlFor="terms-login" className="text-xs text-[#2F3E46] dark:text-white/70 select-none leading-normal">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-[#1F7A1F] dark:text-[#55f761] hover:underline font-semibold">
                Terms and Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="text-[#1F7A1F] dark:text-[#55f761] hover:underline font-semibold">
                Privacy Policy
              </Link>
            </label>
          </div>
          <div className="pt-1 flex flex-col gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="hover:cursor-pointer w-full bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] font-semibold rounded-tr-xl rounded-bl-xl py-2.5 text-sm transition-colors shadow-lg shadow-black/10 dark:shadow-[#55f761]/20 disabled:opacity-70 flex justify-center items-center"
            >
              {isLoading ? "Authenticating..." : "Sign In"}
            </button>

            <div className="flex items-center my-2">
              <div className="flex-grow border-t border-black/10 dark:border-white/10"></div>
              <span className="px-4 text-sm text-[#2F3E46] dark:text-white/50">
                Or
              </span>
              <div className="flex-grow border-t border-black/10 dark:border-white/10"></div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!agreeTerms) {
                  setError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
                  return;
                }
                window.location.href = "/api/auth/google";
              }}
              disabled={isLoading}
              className="w-full bg-white dark:bg-[#0D1B2A] hover:bg-gray-50 dark:hover:bg-[#1B263B] text-[#0D1B2A] dark:text-white border border-black/15 dark:border-white/15 font-semibold rounded-tr-xl rounded-bl-xl py-2.5 text-sm transition-colors shadow-sm disabled:opacity-70 flex justify-center items-center gap-2 hover:cursor-pointer"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue or Signup with Google
            </button>

            {/* <div className="text-center text-sm text-[#2F3E46] dark:text-white/60 mt-2">
              Don't have an account?{" "}
            <Link href="/register?step=register" className="text-[#1F7A1F] dark:text-[#55f761] hover:underline font-semibold">
              Sign up
            </Link>
            </div> */}
          </div>
        </form>
      </div>
    </div>
  );
}
