"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";
import { useTheme } from "@/components/ThemeProvider";

interface RegisterFormProps {
  children: React.ReactNode;
  onNext: () => void;
}

export default function RegisterForm({ children, onNext }: RegisterFormProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [generatedCreds, setGeneratedCreds] = useState<{ username: string; password: string } | null>(null);
  const [facebookError, setFacebookError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const FACEBOOK_REGEX = /^(https?:\/\/)?(www\.|m\.)?(facebook\.com|fb\.com|m\.me|messenger\.com(\/t)?)\/.{3,}$/i;

  const handleFacebookChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val && !FACEBOOK_REGEX.test(val)) {
      setFacebookError("Invalid link format. E.g., facebook.com/username, fb.com/username, or messenger.com/t/username");
    } else {
      setFacebookError("");
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.startsWith('63')) val = val.substring(2);
    if (val.startsWith('0')) val = val.substring(1);
    if (val.length > 0 && val[0] !== '9') val = '';
    e.target.value = val;

    if (val && val.length < 10) {
      setPhoneError("Phone number must be exactly 10 digits");
    } else {
      setPhoneError("");
    }
  };

  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  const copyToClipboard = (text: string, field: 'username' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!agreeTerms) {
      setError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
      return;
    }
    setIsLoading(true);
    setError("");

    const formDataObj = new FormData(e.currentTarget);
    const firstName = formDataObj.get("firstName") as string;
    const lastName = formDataObj.get("lastName") as string;
    const name = `${firstName} ${lastName}`.trim();
    const email = formDataObj.get("email") as string;
    const rawPhone = formDataObj.get("phone") as string;
    const phoneNum = rawPhone.startsWith("+63") ? rawPhone : `+63${rawPhone.replace(/^0/, '')}`;
    const PHONE_REGEX = /^\+639\d{9}$/;
    if (!PHONE_REGEX.test(phoneNum)) {
      setError("Invalid Philippine phone number. Please use 9XXXXXXXXX format.");
      setIsLoading(false);
      return;
    }
    const phone = phoneNum;
    const facebook = formDataObj.get("facebook") as string;
    const password = formDataObj.get("password") as string;
    const password_conf = formDataObj.get("password_conf") as string;
    const referrer = formDataObj.get("referrer") as string;

    if (password !== password_conf) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    if (password.length < 5) {
      setError("Password must be at least 5 characters long.");
      setIsLoading(false);
      return;
    }

    if (!referrer) {
      setError("Please select a referrer from the dropdown.");
      setIsLoading(false);
      return;
    }

    if (facebook && !FACEBOOK_REGEX.test(facebook)) {
      setError("Invalid link format. E.g., facebook.com/username, fb.com/username, or messenger.com/t/username");
      setIsLoading(false);
      return;
    }

    try {
      const result = await registerAction({
        name,
        firstName,
        lastName,
        email,
        phone,
        facebook,
        password,
        referal_email: referrer,
        action: "signup"
      });

      if (result.success) {
        document.cookie = `onboarding_name=${name || result.gingerUsername}; path=/; max-age=604800; samesite=lax`;
        document.cookie = `pre_course_completed=; path=/; max-age=0`; // Delete if exists

        // setGeneratedCreds({ username: result.gingerUsername!, password: result.password! });

        onNext();

        setSuccess(true);
      } else {
        setError(result.error || "Registration failed. Please check your inputs.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="relative z-10 w-full flex flex-col justify-center max-w-lg bg-white/60 dark:bg-black/60 backdrop-blur-xl border border-white/40 dark:border-white/15 rounded-tr-2xl rounded-bl-2xl shadow-2xl p-6 sm:p-8 animate-scale-in my-8">
      <div className="text-center mb-6 animate-fade-up delay-100">
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
        <h1 className="text-xl font-semibold tracking-tight text-[#0D1B2A] dark:text-white">
          Create an Account
        </h1>
        <p className="text-sm text-[#2F3E46] dark:text-white/60 mt-1.5">
          Fill in the details to sign up
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300 text-xs text-center font-medium">
          {error}
        </div>
      )}

      {success && generatedCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 animate-scale-in">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-[#55f761] rounded-full flex items-center justify-center mb-4">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[#0D1B2A] dark:text-white">Registration Successful!</h2>
              <p className="text-sm text-[#2F3E46] dark:text-white/70 mt-2">Please copy and save your credentials below. You will need them to log in.</p>
            </div>

            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-4 border border-gray-100 dark:border-white/10">
              <div>
                <span className="block text-[11px] text-[#2F3E46] dark:text-white/60 font-semibold uppercase tracking-wider mb-1.5">Username</span>
                <div className="bg-white dark:bg-black/40 px-4 py-2.5 rounded-lg border border-black/5 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[15px] font-mono font-bold text-[#0D1B2A] dark:text-white select-all">{generatedCreds.username}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCreds.username, 'username')}
                    className="p-1.5 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
                    title="Copy Username"
                  >
                    {copiedField === 'username' ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <span className="block text-[11px] text-[#2F3E46] dark:text-white/60 font-semibold uppercase tracking-wider mb-1.5">Password</span>
                <div className="bg-white dark:bg-black/40 px-4 py-2.5 rounded-lg border border-black/5 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[15px] font-mono font-bold text-[#0D1B2A] dark:text-white select-all">{generatedCreds.password}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCreds.password, 'password')}
                    className="p-1.5 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
                    title="Copy Password"
                  >
                    {copiedField === 'password' ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNext()}
              className="w-full mt-2 bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] font-semibold rounded-xl py-3.5 text-sm transition-all shadow-lg shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 flex justify-center items-center hover:scale-[1.02] active:scale-[0.98]"
            >
              Proceed to Pre-course
            </button>
          </div>
        </div>
      )}


      <form onSubmit={handleRegister} className="flex flex-col gap-5 animate-fade-up delay-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="firstName">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
              type="text"
              id="firstName"
              name="firstName"
              required
              placeholder="Juan"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="lastName">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
              type="text"
              id="lastName"
              name="lastName"
              required
              placeholder="Dela Cruz"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="email">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
              type="email"
              id="email"
              name="email"
              required
              placeholder="example@gmail.com"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="phone">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-black/15 dark:border-white/15 rounded-lg text-sm font-medium text-[#0D1B2A] dark:text-white select-none">
                <span aria-hidden="true" className="text-lg leading-none">🇵🇭</span>
                <span>+63</span>
              </div>
              <input
                className={`flex-1 w-full px-3 py-2.5 bg-white dark:bg-white/10 border rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 transition-colors shadow-sm disabled:opacity-50 ${phoneError ? "border-red-400 dark:border-red-500 focus:ring-red-300 dark:focus:ring-red-500/40" : "border-black/15 dark:border-white/15 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50"}`}
                type="tel"
                id="phone"
                name="phone"
                required
                placeholder="9123456789"
                maxLength={10}
                disabled={isLoading}
                onChange={handlePhoneChange}
              />
            </div>
            {phoneError && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{phoneError}</p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-1">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="password">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className="relative z-30 w-full px-3 py-2.5 pr-10 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                required
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="password_conf">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className="relative z-30 w-full px-3 py-2.5 pr-10 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
                type={showConfirmPassword ? "text" : "password"}
                id="password_conf"
                name="password_conf"
                required
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white transition-colors"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="facebook">
              Facebook Profile Link <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full px-3 py-2.5 bg-white dark:bg-white/10 border rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 transition-colors shadow-sm disabled:opacity-50 ${facebookError ? "border-red-400 dark:border-red-500 focus:ring-red-300 dark:focus:ring-red-500/40" : "border-black/15 dark:border-white/15 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50"}`}
              type="text"
              id="facebook"
              name="facebook"
              placeholder="https://facebook.com/yourprofile"
              required
              disabled={isLoading}
              onChange={handleFacebookChange}
            />
            {facebookError && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{facebookError}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="referrer">
              Referrer <span className="text-red-500">*</span>
            </label>
            {children}
          </div>
        </div>
        <div className="pt-2 flex flex-col gap-3">
          <div className="flex items-start gap-2.5 px-1">
            <input
              type="checkbox"
              id="terms-register"
              required
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-black/20 dark:border-white/20 text-[#1F7A1F] dark:text-[#55f761] focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] bg-white dark:bg-white/10 hover:cursor-pointer shrink-0"
              disabled={isLoading}
            />
            <label htmlFor="terms-register" className="text-xs text-[#2F3E46] dark:text-white/70 select-none leading-normal">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-[#1F7A1F] dark:text-[#55f761] hover:underline font-semibold">
                Terms and Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="text-[#1F7A1F] dark:text-[#55f761] hover:underline font-semibold">
                Privacy Policy
              </Link>
              . Xfinite may send communications; you can change preferences in account settings.
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] font-semibold rounded-tr-xl rounded-bl-xl py-2.5 text-sm transition-colors shadow-lg shadow-black/10 dark:shadow-[#55f761]/20 disabled:opacity-70 flex justify-center items-center mt-1 cursor-pointer"
          >
            {isLoading ? "Validating & Creating Account..." : "Next"}
          </button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-black/10 dark:border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#E0E1DD] dark:bg-[#060D14] text-[#2F3E46] dark:text-white/50">Or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!agreeTerms) {
                setError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
                return;
              }
              window.location.href = '/api/auth/google?action=signup';
            }}
            disabled={isLoading}
            className="w-full bg-white dark:bg-[#0D1B2A] hover:bg-gray-50 dark:hover:bg-[#1B263B] text-[#0D1B2A] dark:text-white border border-black/15 dark:border-white/15 font-semibold rounded-tr-xl rounded-bl-xl py-2.5 text-sm transition-colors shadow-sm disabled:opacity-70 flex justify-center items-center gap-2 cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <Link
            href="/login"
            className="w-full bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white border border-black/15 dark:border-white/15 font-semibold rounded-tr-xl rounded-bl-xl py-2.5 text-sm transition-colors flex justify-center items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
