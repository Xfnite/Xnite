"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold mb-6">Terms and Conditions</h1>
        
        <div className="space-y-6 text-sm text-[#2F3E46] dark:text-[#E0E1DD]/80 leading-relaxed">
          <p>
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">1. Introduction</h2>
            <p>
              Welcome to Xfnite. These Terms and Conditions govern your use of our website and services. By accessing or using our platform, you agree to be bound by these terms. If you disagree with any part of the terms, you may not access our services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">2. User Accounts</h2>
            <p>
              When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">3. Payment Information &amp; QR Code Collection</h2>
            <p>
              To facilitate salary disbursements and earnings payouts, Xfnite may collect and store your payment account information, including but not limited to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>QR code images linked to your digital wallet accounts (e.g., GCash, Maya, PayPal, Binance)</li>
              <li>QR code images linked to your bank accounts (e.g., BPI, BDO, Security Bank, GoTyme, Landbank, Metrobank, and other BSP-accredited banks)</li>
              <li>Account names, account numbers, and other payment identifiers you provide</li>
            </ul>
            <p className="mt-2">
              This information is collected solely for the purpose of processing your salary or earnings payout. Your QR code and payment details are accessible only to authorized Xfnite administrators and will not be shared with third parties outside of the payment processing workflow. By submitting your QR code or payment details, you consent to Xfnite storing and using this information exclusively for payout purposes in accordance with our Privacy Policy and the Data Privacy Act of 2012 (Republic Act No. 10173).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">4. SMS and Text Communications</h2>
            <p>
              By registering on Xfnite and providing a mobile number, you agree that Xfnite and its authorized representatives may contact you via SMS or text message for the following purposes:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Payout confirmations and salary disbursement notifications</li>
              <li>Account verification and security alerts</li>
              <li>Assistance with payment issues or account concerns</li>
              <li>Important platform updates and announcements</li>
            </ul>
            <p className="mt-2">
              Message frequency may vary. Standard messaging rates from your mobile carrier may apply. You may opt out of non-essential communications at any time by contacting our support team. We will not use your mobile number for unsolicited marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">5. Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are and will remain the exclusive property of Xfnite and its licensors. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Xfnite.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">6. Links to Other Web Sites</h2>
            <p>
              Our Service may contain links to third-party web sites or services that are not owned or controlled by Xfnite. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party web sites or services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0D1B2A] dark:text-white mb-2">7. Changes to Terms</h2>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
