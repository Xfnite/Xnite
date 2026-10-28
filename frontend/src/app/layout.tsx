import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "XFnite"
};

import { MaintenanceUI } from "@/components/MaintenanceUI";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isMaintenance = process.env.UNDER_MAINTENANCE === "true" || process.env.NEXT_PUBLIC_UNDER_MAINTENANCE === "true";
  const estimatedTime = process.env.MAINTENANCE_END_TIME || process.env.NEXT_PUBLIC_MAINTENANCE_END_TIME;

  if (isMaintenance) {
    return (
      <html lang="en" suppressHydrationWarning className="font-sans">
        <body suppressHydrationWarning className="font-sans bg-[#E0E1DD] text-[#0D1B2A] dark:bg-[#060D14] dark:text-[#E0E1DD] antialiased min-h-screen transition-colors duration-200">
          <ThemeProvider>
            <MaintenanceUI estimatedTime={estimatedTime} />
          </ThemeProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning className="font-sans">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var originalFetch = window.fetch;
                window.fetch = async function(...args) {
                  var response = await originalFetch(...args);
                  if (response && response.status === 500) {
                    try {
                      var cloned = response.clone();
                      var text = await cloned.text();
                      if (text && text.indexOf("Failed to find Server Action") !== -1) {
                        window.location.reload();
                      }
                    } catch (e) {}
                  }
                  return response;
                };
                window.addEventListener("unhandledrejection", function(event) {
                  if (event.reason && event.reason.message && event.reason.message.indexOf("Failed to find Server Action") !== -1) {
                    event.preventDefault();
                    window.location.reload();
                  }
                });
                window.addEventListener("error", function(event) {
                  if (event.error && event.error.message && event.error.message.indexOf("Failed to find Server Action") !== -1) {
                    event.preventDefault();
                    window.location.reload();
                  }
                });
              })();
            `
          }}
        />
      </head>
      <body suppressHydrationWarning className="font-sans bg-[#E0E1DD] text-[#0D1B2A] dark:bg-[#060D14] dark:text-[#E0E1DD] antialiased min-h-screen transition-colors duration-200">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
