"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Lightweight scroll-reveal — a framer-motion-free port of the prototype's
 * <Reveal>. Fades/slides content in once when it enters the viewport. The
 * hidden state is gated in CSS behind `prefers-reduced-motion: no-preference`,
 * so reduced-motion users (and no-JS) always see content immediately.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`ho-reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

/** Editorial chapter eyebrow: "02 — Less admin. More actual work." */
export function Chapter({
  number,
  children,
  dark = false,
}: {
  number: string;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <p className={`ho-chapter ${dark ? "ho-chapter-dark" : ""}`.trim()}>
      <span>{number}</span>
      {children}
      <span className="ho-chapter-rule" />
    </p>
  );
}

/** Hero headline. Line reveal is CSS-driven (see landing.css ho-line-rise). */
export function MaskedHeadline() {
  const lines = ["Operations", "shouldn’t live in", "a spreadsheet."];
  return (
    <h1 data-testid="hero-title" className="ho-hero-title">
      {lines.map((line, i) => (
        <span key={line} className="ho-line-mask">
          <span className={i === 2 ? "ho-headline-accent" : undefined}>{line}</span>
        </span>
      ))}
    </h1>
  );
}
