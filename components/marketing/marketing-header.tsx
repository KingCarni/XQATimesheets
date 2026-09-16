"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";

const LINKS = [
  { href: "#product", label: "Product", hint: true },
  { href: "#solutions", label: "Solutions", hint: true },
  { href: "#reporting", label: "Reporting" },
  { href: "#how", label: "How it Works" },
];

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${
        scrolled
          ? "border-hourops-border/70 bg-white/85 backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-20 w-full max-w-[1320px] items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="HourOps home" className="flex items-center gap-2.5">
          <Image src="/hourops-icon.png" alt="HourOps" width={44} height={43} priority className="h-10 w-auto" />
          <span className="text-hourops-navy text-xl font-semibold tracking-tight">HourOps</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-hourops-text-muted hover:text-hourops-navy hover:bg-hourops-surface-muted inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {l.label}
              {l.hint ? <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden /> : null}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2.5 lg:flex">
          <Link
            href="/login"
            className="text-hourops-text-muted hover:text-hourops-navy px-3 py-2 text-sm font-semibold transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="from-hourops-blue to-hourops-blue-bright focus-visible:ring-hourops-blue rounded-lg bg-gradient-to-r px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(8,123,234,0.8)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Create Company
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="text-hourops-navy hover:bg-hourops-surface-muted rounded-lg p-2 lg:hidden"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open ? (
        <div className="border-hourops-border/70 bg-white/95 border-t px-5 py-4 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-hourops-navy hover:bg-hourops-surface-muted rounded-lg px-3 py-3 text-base font-medium"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="border-hourops-border text-hourops-navy rounded-lg border px-3 py-3 text-center text-sm font-semibold"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="from-hourops-blue to-hourops-blue-bright rounded-lg bg-gradient-to-r px-3 py-3 text-center text-sm font-semibold text-white"
              >
                Create Company
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
