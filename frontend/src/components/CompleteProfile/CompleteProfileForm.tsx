"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { completeProfileAction } from "@/app/actions/auth";
import { useTheme } from "@/components/ThemeProvider";

interface CompleteProfileFormProps {
  children: React.ReactNode;
  initialFirstName?: string;
  initialLastName?: string;
  onNext: () => void;
}

export default function CompleteProfileForm({ children, initialFirstName = "", initialLastName = "", onNext }: CompleteProfileFormProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    // Handle pasted values with +63 or 0 prefix
    if (val.startsWith('63')) val = val.substring(2);
    if (val.startsWith('0')) val = val.substring(1);

    // Enforce starting with 9
    if (val.length > 0 && val[0] !== '9') {
      val = '';
    }

    // Enforce 10 characters max
    if (val.length > 10) {
      val = val.substring(0, 10);
    }

    setPhone(val);

    if (val && val.length < 10) {
      setPhoneError("Phone number must be exactly 10 digits starting with 9.");
    } else {
      setPhoneError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
    const referrer = formDataObj.get("referrer") as string;
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

    if (!password) {
      setError("Password is required.");
      setIsLoading(false);
      return;
    }

    if (password.length < 5) {
      setError("Password must be at least 5 characters long.");
      setIsLoading(false);
      return;
    }

    if (password !== password_conf) {
      setError("Passwords do not match.");
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
      const res = await completeProfileAction({ firstName, lastName, referrer, phone, facebook, password });

      if (res.success) {
        onNext();
      } else {
        setError(res.error || "Failed to complete profile. Please try again.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Please refresh this page");
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
          Almost done!
        </h1>
        <p className="text-sm text-[#2F3E46] dark:text-white/60 mt-1.5">
          Please complete your profile to continue.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300 text-xs text-center font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 animate-fade-up delay-200">

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
              defaultValue={initialFirstName}
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
              defaultValue={initialLastName}
              disabled={isLoading}
            />
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
              value={phone}
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

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="referrer">
            Referrer <span className="text-red-500">*</span>
          </label>
          {children}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="cp_password">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className="relative z-30 w-full px-3 py-2.5 pr-10 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
                type={showPassword ? "text" : "password"}
                id="cp_password"
                name="password"
                required
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white transition-colors z-40"
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
            <label className="block text-sm font-medium text-[#1B263B] dark:text-white/80" htmlFor="cp_password_conf">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className="relative z-30 w-full px-3 py-2.5 pr-10 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40 focus:border-[#1F7A1F]/60 dark:focus:border-[#55f761]/50 transition-colors shadow-sm disabled:opacity-50"
                type={showConfirmPassword ? "text" : "password"}
                id="cp_password_conf"
                name="password_conf"
                required
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#2F3E46] dark:text-white/60 hover:text-[#0D1B2A] dark:hover:text-white transition-colors z-40"
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
        </div>

        <div className="flex items-start gap-2.5 pt-2">
          <input
            type="checkbox"
            id="terms-complete-profile"
            required
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-black/20 dark:border-white/20 text-[#1F7A1F] dark:text-[#55f761] focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] bg-white dark:bg-white/10 hover:cursor-pointer shrink-0"
            disabled={isLoading}
          />
          <label htmlFor="terms-complete-profile" className="text-xs text-[#2F3E46] dark:text-white/70 select-none leading-normal">
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

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#1F7A1F] hover:bg-[#145214] text-white dark:bg-[#55f761] dark:hover:bg-[#3de34a] dark:text-[#060D14] font-semibold rounded-tr-xl rounded-bl-xl py-2.5 text-sm transition-colors shadow-lg shadow-black/10 dark:shadow-[#55f761]/20 disabled:opacity-70 flex justify-center items-center mt-2 cursor-pointer"
        >
          {isLoading ? "Submitting..." : "Next"}
        </button>
      </form>
    </div>
  );
}
