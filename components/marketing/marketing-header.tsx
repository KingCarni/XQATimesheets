"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";

const LINKS: [string, string][] = [
  ["#product", "The product"],
  ["#how", "How it works"],
  ["#reporting", "Reporting"],
  ["#workspaces", "Your workspace"],
];

export function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link href="/" className="ho-brand" aria-label="MyHourVault home">
      <Image src="/myhourvault-icon.jpg" width={38} height={38} alt="" priority={!footer} />
      <span>
        My<span className="ho-brand-accent">Hour</span>Vault
      </span>
    </Link>
  );
}

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (mq.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <header className="ho-header">
      <nav className="ho-container ho-nav" aria-label="Main navigation">
        <Brand />
        <div className="ho-desktop-links">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>
        <div className="ho-nav-actions">
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className="ho-button ho-button-small">
            Create your company <ArrowUpRight size={15} />
          </Link>
        </div>
        <button
          ref={toggle}
          className="ho-menu-toggle"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="ho-mobile-menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open ? (
        <nav id="ho-mobile-menu" className="ho-mobile-menu" aria-label="Mobile navigation">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
              <ArrowUpRight size={16} />
            </a>
          ))}
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className="ho-button">
            Create your company <ArrowUpRight size={16} />
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
