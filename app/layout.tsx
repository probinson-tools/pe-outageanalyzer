import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import StripUrlCredentials from "@/components/StripUrlCredentials";

export const metadata: Metadata = {
  title: "PE Analyzer | PE Tools",
  description: "AI-powered log and server-status analysis for outage diagnosis and prevention",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The page background lives here rather than on each page's <main>, so the
          shared header sits on the same surface no matter which analyzer is open. */}
      <body className="min-h-screen antialiased bg-[#0F1117]">
        <StripUrlCredentials />
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
