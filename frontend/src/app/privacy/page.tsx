"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen p-8 bg-[#E0E1DD] dark:bg-[#060D14] transition-colors duration-200 text-[#0D1B2A] dark:text-[#E0E1DD]">
      <div className="max-w-3xl mx-auto bg-white dark:bg-[#0D1B2A] p-8 md:p-12 rounded-2xl shadow-xl border border-black/10 dark:border-white/10 relative">
        
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <Link href="/register" className="inline-flex items-center text-sm font-medium text-[#1F7A1F] dark:text-[#55f761] hover:underline mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="m15 18-6-6 6-6"/></svg>
          Back to Registration
        </Link>

        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        
        <div className="space-y-6 text-sm text-[#2F3E46] dark:text-[#E0E1DD]/80 leading-relaxed">
          <p>
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">1. Information We Collect</h2>
            <p>
              We collect information that you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This includes:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Account information (name, email address, password)</li>
              <li>Payment account details including account name, account number, and payment provider (e.g., GCash, Maya, BPI, BDO, and other banks)</li>
              <li>QR code images associated with your payment accounts, submitted for the purpose of salary and earnings disbursement</li>
              <li>Mobile phone number, used for account verification and payout-related communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">2. How We Use Your Information</h2>
            <p>
              We use the information we collect about you to provide, maintain, and improve our services, including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Processing and disbursing salary payments and earnings payouts via your chosen payment method or QR code</li>
              <li>Verifying your payment details to prevent errors or misdirected transfers</li>
              <li>Sending receipts, payout confirmations, and transaction records</li>
              <li>Providing customer support and responding to inquiries</li>
              <li>Developing new features and improving the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">3. SMS and Text Message Communications</h2>
            <p>
              By registering on Xfnite and providing your mobile number, you consent to receiving SMS or text messages from Xfnite or its authorized representatives. These messages may include:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Salary disbursement and payout notifications</li>
              <li>Assistance with payment issues or account concerns</li>
              <li>Security alerts and account verification codes</li>
              <li>Important service updates</li>
            </ul>
            <p className="mt-2">
              Standard SMS rates from your mobile carrier may apply. You may opt out of non-essential text communications at any time by contacting our support team. We will never sell or share your mobile number with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">4. QR Code & Payment Data Security</h2>
            <p>
              Your QR code images and payment account details are stored securely and are accessible only to authorized Xfnite personnel for the sole purpose of processing your payouts. We implement appropriate technical and organizational measures to protect your payment information from unauthorized access, disclosure, alteration, or destruction. We retain your payment data only for as long as necessary to fulfill the purposes outlined in this policy or as required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">5. Sharing of Information</h2>
            <p>
              We may share the information we collect about you with vendors, consultants, and other service providers who need access to such information to carry out work on our behalf. We do not sell or rent your personal information to third parties. Your QR code images and payment details are not shared with any party outside of the payout processing workflow.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">6. Your Rights & Choices</h2>
            <p>
              You may correct or update your account and payment information at any time by logging into your account settings. You may also request deletion of your payment data or QR code images by contacting our support team, subject to any legal retention obligations. You may manage your communication preferences, including SMS opt-outs, from your account settings or by reaching out to us directly.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
