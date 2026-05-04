import { auth } from "@/auth";
import { faArrowRight, faChartLine, faHeartPulse, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070709] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,rgba(34,211,238,0.18),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(167,139,250,0.12),transparent)]" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-16 pt-20 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-black text-zinc-950">
              V
            </span>
            <span className="text-sm font-semibold tracking-tight">Vitals Lab</span>
          </div>
          <Link
            href="/login"
            className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10"
          >
            Sign in
          </Link>
        </header>
        <main className="mt-20 flex flex-1 flex-col justify-center">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400/90">
            <FontAwesomeIcon icon={faHeartPulse} className="text-base text-cyan-300/90" />
            Clinical-grade visuals
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Your labs, one serious timeline.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Upload PDFs, spreadsheets, or images. We parse with deterministic rules against a fixed parameter catalog
            — no creative guessing. Track lipids, HbA1c, thyroid, vitamins, and dozens more with normal-range context.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-xl shadow-cyan-500/20"
            >
              Enter dashboard
              <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
            </Link>
          </div>
          <div className="mt-16 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 backdrop-blur">
              <FontAwesomeIcon icon={faShieldHalved} className="text-cyan-400" />
              <h2 className="mt-3 text-sm font-semibold text-white">Predictable parsing</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Values are accepted only when a catalog analyte is found on the same line (or table row). Sanity bounds
                drop obvious OCR noise.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 backdrop-blur">
              <FontAwesomeIcon icon={faChartLine} className="text-violet-400" />
              <h2 className="mt-3 text-sm font-semibold text-white">Trajectory + table</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Default 3-year charts with adjustable horizons. Table view mirrors your panel order with out-of-range
                highlights.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
