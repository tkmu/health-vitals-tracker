"use client";

import { faFileArrowUp, faFolderOpen, faGauge, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: faGauge },
  { href: "/upload", label: "Upload", icon: faFileArrowUp },
  { href: "/files", label: "Files", icon: faFolderOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(167,139,250,0.08),transparent)]" />
      <header className="relative z-20 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="group flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-black text-zinc-950 shadow-lg shadow-cyan-500/20">
              V
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-white">Vitals Lab</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Private health OS</div>
            </div>
          </Link>
          <nav className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  }`}
                >
                  <FontAwesomeIcon icon={l.icon} className="text-xs opacity-80" />
                  <span className="hidden sm:inline">{l.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="ml-1 flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-200 sm:px-4"
            >
              <FontAwesomeIcon icon={faRightFromBracket} className="text-xs" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="relative z-10 flex-1">{children}</main>
    </div>
  );
}
