"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Log Analyzer" },
  { href: "/serverstatus", label: "Server Status" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/8 bg-[#1A1D2E] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-3 relative flex items-center justify-between">
        <div className="flex items-center gap-5">
          <span className="text-base font-bold text-slate-100 tracking-tight">PE Analyzer</span>
          <nav className="flex items-center gap-1">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <a
          href="https://pe-commandcenter.vercel.app"
          title="PE Command Center"
          className="hidden lg:block absolute left-1/2 -translate-x-1/2"
        >
          <Image src="/logo-marketfully-dark.svg" alt="Marketfully" width={119} height={28} priority />
        </a>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow"></span>
          <span className="text-slate-500 text-xs">Powered by Claude</span>
        </div>
      </div>
    </header>
  );
}
