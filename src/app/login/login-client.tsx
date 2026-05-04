"use client";

import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn } from "next-auth/react";
import Link from "next/link";

export function LoginClient({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#070709] px-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.15),transparent)]" />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-center text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 text-center text-sm text-zinc-400">Google account — minimal friction, no passwords here.</p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-lg transition hover:bg-zinc-100"
        >
          <FontAwesomeIcon icon={faGoogle} className="text-lg" />
          Continue with Google
        </button>
        <Link href="/" className="mt-6 block text-center text-xs text-zinc-500 hover:text-zinc-300">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
