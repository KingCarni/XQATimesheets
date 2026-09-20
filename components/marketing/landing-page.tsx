"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, FileOutput, LockKeyhole, Pause, Play, Plus } from "lucide-react";

import { Brand, MarketingHeader } from "./marketing-header";
import { Chapter, MaskedHeadline, Reveal } from "./marketing-motion";
import { HeroProduct } from "./hero-product";
import { Workflow } from "./workflow";
import { TimesheetPreview } from "./timesheet-preview";
import { ApprovalsPreview } from "./approvals-preview";
import { ReportPreview } from "./report-preview";
import { ImportFlow, TeamOperations, WorkspaceBrandPreview } from "./operations-sections";
import { handleTabNavigation } from "./marketing-accessibility";
import "./landing.css";

export function LandingPage() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="ho-site" data-testid="myhourvault-landing" onKeyDownCapture={handleTabNavigation}>
      <a className="ho-skip-link" href="#main-content">
        Skip to content
      </a>
      <MarketingHeader />

      <main id="main-content">
        {/* ---------------------------------------------------------- HERO */}
        <section className="ho-hero" aria-labelledby="hero-heading">
          <div className="ho-hero-grid" aria-hidden="true" />
          <div className="ho-container ho-hero-layout">
            <div className="ho-hero-copy">
              <div className="ho-hero-kicker">
                <span className="ho-live-dot" /> Workforce time operations
                <span className="ho-kicker-rule" />
              </div>
              <div id="hero-heading">
                <MaskedHeadline />
              </div>
              <Reveal delay={0.4}>
                <p className="ho-hero-description">
                  From the first hour logged to the final report.
                  <br className="ho-desktop-break" /> Timesheets, approvals, and team operations.
                  <br className="ho-desktop-break" />
                  <strong> One clear way forward.</strong>
                </p>
                <div className="ho-hero-actions">
                  <Link href="/signup" className="ho-button" data-testid="hero-create-company">
                    Create your company <ArrowUpRight size={17} />
                  </Link>
                  <Link href="/login" className="ho-explore-button" data-testid="hero-sign-in">
                    Sign in
                  </Link>
                </div>
                <p className="ho-hero-footnote">
                  <Check size={12} /> No credit card required <span /> Your own private workspace
                </p>
              </Reveal>
            </div>
            <HeroProduct />
          </div>
          <div className="ho-container ho-hero-bottom">
            <a href="#how" data-testid="discover-workflow">
              A better week starts here <ArrowDown size={14} />
            </a>
            <span>Built for the people behind the hours.</span>
            <span className="ho-hero-index">01 &mdash; 07</span>
          </div>
        </section>

        {/* ------------------------------------------------------- MARQUEE */}
        <div className={`ho-marquee ${paused ? "is-paused" : ""}`}>
          <div className="ho-marquee-window" aria-hidden="true">
            <div className="ho-marquee-track">
              {[0, 1, 2, 3].map((n) => (
                <span key={n}>
                  Track the work. <Plus /> Review what matters. <Plus /> Know where the hours went. <Plus />
                </span>
              ))}
            </div>
          </div>
          <p className="ho-sr-only">Track the work. Review what matters. Know where the hours went.</p>
          <button
            onClick={() => setPaused(!paused)}
            aria-label={paused ? "Resume moving text" : "Pause moving text"}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        </div>

        {/* ------------------------------------------------------ WORKFLOW */}
        <Workflow />

        {/* ----------------------------------------------------- TIMESHEET */}
        <section className="ho-timesheet-section" id="product">
          <div className="ho-container" id="timesheets">
            <Reveal>
              <Chapter number="02">Less admin. More actual work.</Chapter>
              <div className="ho-section-heading">
                <h2>
                  Logging time
                  <br />
                  <span>shouldn&rsquo;t take time.</span>
                </h2>
                <p>
                  A familiar weekly view. The right amount of detail.
                  <br />
                  Log by project, add the context, submit once.
                  <br />
                  Then get back to the work that matters.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1} className="ho-timesheet-stage">
              <div className="ho-surface-annotation">
                <span>
                  <i />
                  Every hour has a home.
                </span>
                <span>PROJECT &rarr; PLATFORM &rarr; WORK TYPE &rarr; HOURS</span>
              </div>
              <TimesheetPreview />
            </Reveal>
            <div className="ho-timesheet-benefits">
              <span>
                <Check size={14} /> Project-level detail
              </span>
              <span>
                <Check size={14} /> A week you can see at a glance
              </span>
              <span>
                <Check size={14} /> One clear submission
              </span>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- APPROVALS */}
        <section id="approvals" className="ho-approvals-section">
          <div className="ho-container">
            <Reveal>
              <Chapter number="03" dark>
                Less chasing. Better decisions.
              </Chapter>
            </Reveal>
            <div className="ho-approvals-layout">
              <Reveal className="ho-approvals-copy">
                <h2>
                  Know what&rsquo;s ready.
                  <br />
                  <span>Know what isn&rsquo;t.</span>
                </h2>
                <p>
                  Not every timesheet needs the same attention. See the exceptions, review the context,
                  and move the rest forward.
                </p>
                <ul>
                  <li>
                    <Check size={15} /> A queue that makes the next step obvious
                  </li>
                  <li>
                    <Check size={15} /> Approvals scoped to your projects
                  </li>
                  <li>
                    <Check size={15} /> Send work back with a reason, not a guess
                  </li>
                </ul>
                <a href="#reporting" className="ho-editorial-link">
                  And when it&rsquo;s approved?
                  <ArrowRight size={17} />
                </a>
              </Reveal>
              <Reveal delay={0.1}>
                <ApprovalsPreview />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- REPORTING */}
        <section id="reporting" className="ho-reporting-section ho-container">
          <Reveal>
            <Chapter number="04">The numbers, with the full story</Chapter>
            <div className="ho-section-heading">
              <h2>
                Know where
                <br />
                <span>every hour went.</span>
              </h2>
              <p>
                Project costs. Billable work. Time off.
                <br />
                The answers are already in the hours.
                <br />
                Now they&rsquo;re easy to find.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ReportPreview />
          </Reveal>
          <Reveal className="ho-payroll-bridge">
            <span className="ho-payroll-icon">
              <FileOutput size={27} />
            </span>
            <div>
              <h3>The bridge between timesheets and payroll.</h3>
              <p>
                Review the pay period, spot missing hours, and export approved work. Your payroll process
                starts with a clean handoff&mdash;not another spreadsheet rescue.
              </p>
            </div>
            <span className="ho-payroll-note">
              <Check size={13} /> Payroll-ready reports.
              <br />
              <span>Not payroll processing.</span>
            </span>
          </Reveal>
        </section>

        <TeamOperations />
        <ImportFlow />
        <WorkspaceBrandPreview />

        {/* ----------------------------------------------------- FINAL CTA */}
        <section className="ho-final-cta">
          <div className="ho-container">
            <Reveal>
              <p className="ho-final-kicker">
                <span className="ho-live-dot" />
                A better week is within reach.
              </p>
              <h2>
                Less spreadsheet.
                <br />
                More <span>forward.</span>
                <ArrowUpRight aria-hidden="true" />
              </h2>
              <div className="ho-final-row">
                <p>
                  Give your team a clearer way to log, review,
                  <br />
                  and understand the work.
                </p>
                <div className="ho-hero-actions">
                  <Link href="/signup" className="ho-button" data-testid="footer-create-company">
                    Create your company <ArrowUpRight size={19} />
                  </Link>
                  <Link href="/login" className="ho-explore-button" data-testid="footer-cta-sign-in">
                    Sign in
                  </Link>
                </div>
              </div>
              <div className="ho-final-note">
                <LockKeyhole size={13} />
                Your company. Your workspace. Your hours, accounted for.
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------- FOOTER */}
      <footer className="ho-footer">
        <div className="ho-container ho-footer-main">
          <div>
            <Brand footer />
            <p>Track time. Move teams forward.</p>
          </div>
          <nav aria-label="Footer product navigation">
            <span>Product</span>
            {(
              [
                ["#timesheets", "Timesheets"],
                ["#approvals", "Approvals"],
                ["#reporting", "Reporting"],
                ["#solutions", "Team operations"],
              ] as [string, string][]
            ).map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <nav aria-label="Footer company navigation">
            <span>Your next step</span>
            <Link href="/signup">Create your company</Link>
            <Link href="/login">
              Sign in <ArrowUpRight size={12} />
            </Link>
          </nav>
          <div className="ho-footer-statement">
            Good work
            <br />
            deserves
            <br />
            <span>a clear record.</span>
          </div>
        </div>
        <div className="ho-container ho-footer-bottom">
          <span>&copy; {new Date().getFullYear()} MyHourVault. Your hours, accounted for.</span>
          <span>
            Designed around the way work moves.
            <span className="ho-live-dot" />
          </span>
        </div>
      </footer>
    </div>
  );
}
