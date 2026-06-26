import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outage Analyzer | PE Tools",
  description: "AI-powered log analysis for server outage diagnosis and prevention",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
