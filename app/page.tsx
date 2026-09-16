import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/permissions/routes";
import { resolveTenantFromHost } from "@/lib/tenant/context";
import { enterDemoAction } from "@/lib/demo/actions";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  ApprovalsPreview,
  BarRow,
  HeroProduct,
  ImportFlow,
  ReportPreview,
  StatusPill,
  Surface,
  TeamOpsPreview,
  TimesheetPreview,
  WorkspaceBrandPreview,
} from "@/components/marketing/marketing-ui";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  const tenant = await resolveTenantFromHost();
  if (tenant) redirect(user ? DEFAULT_AUTHED_PATH : LOGIN_PATH);
  if (user) redirect(DEFAULT_AUTHED_PATH);
  return <Landing />;
}

/* --------------------------------------------------------------- helpers */

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function PrimaryCta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Link
      href="/signup"
      className={`from-hourops-blue to-hourops-blue-bright focus-visible:ring-hourops-blue inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-6 py-3.5 text-base font-semibold text-white shadow-[0_16px_40px_-14px_rgba(8,123,234,0.85)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

/* ------------------------------------------------------------------ page */

function Landing() {
  return (
    <div className="bg-hourops-surface flex min-h-full flex-1 flex-col overflow-x-clip">
      <MarketingHeader />

      {/* ============================================================ HERO */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden">
          <div className="from-hourops-cyan/20 absolute -top-40 left-1/2 h-[36rem] w-[52rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(circle,var(--tw-gradient-stops))] to-transparent blur-3xl" />
        </div>

        <Container className="pt-16 pb-10 text-center sm:pt-24">
          <p className="text-hourops-blue ho-rise text-sm font-semibold tracking-[0.16em] uppercase">
            Workforce time operations
          </p>
          <h1 className="text-hourops-navy ho-rise ho-rise-2 mx-auto mt-4 max-w-4xl text-[2.6rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            Operations shouldn&apos;t live in a spreadsheet.
          </h1>
          <p className="text-hourops-text-muted ho-rise ho-rise-3 mx-auto mt-6 max-w-2xl text-lg sm:text-xl">
            Track time, approve work, and understand where your team&apos;s hours go — without chasing
            spreadsheets every Friday.
          </p>
          <div className="ho-rise ho-rise-3 mt-9 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta>Start with HourOps</PrimaryCta>
            <a
              href="#product"
              className="border-hourops-border text-hourops-navy hover:border-hourops-blue/40 hover:bg-hourops-surface-muted inline-flex items-center justify-center rounded-xl border bg-white px-6 py-3.5 text-base font-semibold transition"
            >
              Explore the product
            </a>
          </div>
          <div className="text-hourops-text-muted ho-rise ho-rise-4 mt-4 flex items-center justify-center gap-1.5 text-sm">
            <span>No credit card required ·</span>
            <form action={enterDemoAction}>
              <button type="submit" className="text-hourops-blue font-semibold hover:underline">
                try the live demo
              </button>
            </form>
          </div>
        </Container>

        {/* product stage — the product IS the hero visual */}
        <div className="relative px-5 pb-16 sm:px-8">
          <div className="from-hourops-navy-deep via-hourops-navy to-hourops-navy-2 relative mx-auto max-w-[1120px] overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 shadow-[0_50px_120px_-50px_rgba(6,27,53,0.75)] sm:p-12">
            <div className="from-hourops-cyan/25 pointer-events-none absolute -top-20 right-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--tw-gradient-stops))] to-transparent blur-3xl" />
            <div className="from-hourops-blue/20 pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--tw-gradient-stops))] to-transparent blur-3xl" />
            <div className="relative mx-auto max-w-[560px] lg:max-w-[640px]">
              <div className="ho-rise ho-rise-2">
                <HeroProduct />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== WORKFLOW */}
      <section id="product" className="scroll-mt-24 py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-hourops-navy text-3xl font-semibold tracking-tight sm:text-4xl">
              One operational flow, start to finish.
            </h2>
            <p className="text-hourops-text-muted mt-4 text-lg">
              Time moves from the person doing the work to a clean report — without anyone rebuilding a
              spreadsheet on Friday afternoon.
            </p>
          </div>

          <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            <WorkflowCard step="Log time" who="Alex · Employee">
              <div className="border-hourops-border flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs">
                <span className="text-hourops-text font-medium">PVVK · Regression</span>
                <span className="text-hourops-text font-semibold">8h</span>
              </div>
            </WorkflowCard>
            <WorkflowConnector />
            <WorkflowCard step="Submit" who="Week of Sep 14">
              <div className="flex items-center justify-between">
                <span className="text-hourops-text text-sm font-semibold">40h</span>
                <StatusPill label="Submitted" tone="submitted" />
              </div>
            </WorkflowCard>
            <WorkflowConnector />
            <WorkflowCard step="Approve" who="Jamie · Manager">
              <div className="flex items-center justify-between">
                <span className="text-hourops-text text-sm font-semibold">40h</span>
                <StatusPill label="Approved" tone="approved" />
              </div>
            </WorkflowCard>
            <WorkflowConnector />
            <WorkflowCard step="Report" who="Project Atlas">
              <div className="flex flex-col gap-1.5">
                <BarRow label="Regression" pct={42} color="var(--hourops-blue)" />
                <BarRow label="Functional" pct={31} color="var(--hourops-cyan)" />
              </div>
            </WorkflowCard>
          </div>
        </Container>
      </section>

      {/* =================================================== TIME TRACKING */}
      <section className="bg-hourops-surface-muted border-hourops-border/70 border-y py-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-hourops-blue text-sm font-semibold tracking-[0.14em] uppercase">Time tracking</p>
              <h2 className="text-hourops-navy mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Logging time shouldn&apos;t take time.
              </h2>
              <p className="text-hourops-text-muted mt-4 text-lg">
                A weekly grid built for speed — project, platform, work type, hours and a note. Copy last
                week, fill the gaps, submit once.
              </p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {["Projects, platforms and work types", "Descriptions where they matter", "One clear weekly submission"].map((li) => (
                  <li key={li} className="text-hourops-text flex items-center gap-2.5 text-sm">
                    <CheckCircle2 className="text-hourops-blue h-4 w-4 shrink-0" />
                    {li}
                  </li>
                ))}
              </ul>
            </div>
            <div className="ho-rise">
              <TimesheetPreview />
            </div>
          </div>
        </Container>
      </section>

      {/* ======================================================= APPROVALS */}
      <section className="from-hourops-navy-deep to-hourops-navy bg-gradient-to-b py-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="ho-rise order-2 lg:order-1">
              <ApprovalsPreview />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-hourops-cyan text-sm font-semibold tracking-[0.14em] uppercase">Approvals</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Know what&apos;s ready. Approve what matters.
              </h2>
              <p className="mt-4 text-lg text-white/70">
                Managers see exactly which weeks need attention, approve in bulk, and send anything back
                with a reason — every decision recorded in the audit trail.
              </p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {["Review by project scope, not the whole org", "Bulk approve a clean week", "Reject with feedback, keep the history"].map((li) => (
                  <li key={li} className="flex items-center gap-2.5 text-sm text-white/85">
                    <CheckCircle2 className="text-hourops-cyan h-4 w-4 shrink-0" />
                    {li}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* ======================================================= REPORTING */}
      <section id="reporting" className="scroll-mt-24 py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-hourops-blue text-sm font-semibold tracking-[0.14em] uppercase">Reporting</p>
            <h2 className="text-hourops-navy mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              See where the week went.
            </h2>
            <p className="text-hourops-text-muted mt-4 text-lg">
              Hours by project, employee, work type and platform — billable and non-billable — ready to
              export to Excel or CSV the moment finance asks.
            </p>
          </div>
          <div className="ho-rise mx-auto mt-12 max-w-[920px]">
            <ReportPreview />
          </div>
        </Container>
      </section>

      {/* ================================================== TEAM OPERATIONS */}
      <section id="solutions" className="bg-hourops-surface-muted border-hourops-border/70 scroll-mt-24 border-y py-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-hourops-blue text-sm font-semibold tracking-[0.14em] uppercase">Team operations</p>
              <h2 className="text-hourops-navy mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                More context. Less chasing.
              </h2>
              <p className="text-hourops-text-muted mt-4 text-lg">
                HourOps keeps the operational context around the people doing the work — profiles, time
                off, project assignments, equipment and contracts — so you&apos;re not digging through
                threads to answer simple questions.
              </p>
            </div>
            <div className="ho-rise">
              <TeamOpsPreview />
            </div>
          </div>
        </Container>
      </section>

      {/* ========================================================== IMPORT */}
      <section id="how" className="scroll-mt-24 py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-hourops-navy text-3xl font-semibold tracking-tight sm:text-4xl">
              Bring the spreadsheet.
              <br />
              Leave the spreadsheet behind.
            </h2>
            <p className="text-hourops-text-muted mt-4 text-lg">
              Import your existing employee list from Excel. HourOps detects employees and projects and
              lets you review everything before a single record is created.
            </p>
          </div>
          <div className="ho-rise mt-12">
            <ImportFlow />
          </div>
          <div className="text-hourops-text-muted mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {["Detect employees", "Detect projects", "Preview before import", "Invite the team"].map((li) => (
              <span key={li} className="flex items-center gap-2">
                <CheckCircle2 className="text-hourops-blue h-4 w-4" />
                {li}
              </span>
            ))}
          </div>
        </Container>
      </section>

      {/* =============================================== WORKSPACE BRANDING */}
      <section className="bg-hourops-surface-muted border-hourops-border/70 border-t py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-hourops-navy text-3xl font-semibold tracking-tight sm:text-4xl">
              Your team. Your workspace.
            </h2>
            <p className="text-hourops-text-muted mt-4 text-lg">
              Every company gets its own private HourOps workspace with its own name, logo and colors —
              the same product, tailored to your brand. Data stays isolated to your organization.
            </p>
          </div>
          <div className="ho-rise mt-12">
            <WorkspaceBrandPreview />
          </div>
        </Container>
      </section>

      {/* ======================================================= FINAL CTA */}
      <section className="px-5 py-20 sm:px-8">
        <div className="from-hourops-navy-deep via-hourops-navy to-hourops-navy-2 relative mx-auto max-w-[1120px] overflow-hidden rounded-[2rem] bg-gradient-to-br px-6 py-20 text-center sm:px-16">
          <Image
            src="/hourops-icon.png"
            alt=""
            aria-hidden
            width={520}
            height={508}
            className="pointer-events-none absolute -right-20 -bottom-24 w-[32rem] max-w-none opacity-[0.12]"
          />
          <div className="from-hourops-cyan/20 pointer-events-none absolute -top-24 left-1/2 h-72 w-[40rem] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--tw-gradient-stops))] to-transparent blur-3xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-[2.75rem] sm:leading-[1.1]">
              Ready to stop managing timesheets in spreadsheets?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
              Set up your workspace and bring your team over in minutes.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <PrimaryCta>Create Your Company</PrimaryCta>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/20"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================== FOOTER */}
      <footer className="border-hourops-border/70 bg-white border-t">
        <Container className="flex flex-col gap-10 py-14 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5" aria-label="HourOps home">
              <Image src="/hourops-icon.png" alt="HourOps" width={36} height={35} className="h-8 w-auto" />
              <span className="text-hourops-navy text-lg font-semibold tracking-tight">HourOps</span>
            </Link>
            <p className="text-hourops-text-muted mt-3 text-sm">
              Modern timesheets, approvals and project reporting for teams.
            </p>
          </div>
          <div className="flex gap-16">
            <div>
              <p className="text-hourops-navy text-sm font-semibold">Product</p>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                <li><a href="#product" className="text-hourops-text-muted hover:text-hourops-navy">Timesheets</a></li>
                <li><a href="#reporting" className="text-hourops-text-muted hover:text-hourops-navy">Approvals</a></li>
                <li><a href="#reporting" className="text-hourops-text-muted hover:text-hourops-navy">Reporting</a></li>
                <li><a href="#solutions" className="text-hourops-text-muted hover:text-hourops-navy">Time off</a></li>
              </ul>
            </div>
            <div>
              <p className="text-hourops-navy text-sm font-semibold">Get started</p>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                <li><Link href="/signup" className="text-hourops-text-muted hover:text-hourops-navy">Create Company</Link></li>
                <li><Link href="/login" className="text-hourops-text-muted hover:text-hourops-navy">Sign In</Link></li>
              </ul>
            </div>
          </div>
        </Container>
        <div className="border-hourops-border/70 border-t">
          <Container className="text-hourops-text-muted py-5 text-xs">© 2026 HourOps. Track time. Move teams forward.</Container>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------- workflow subcomponents */

function WorkflowCard({ step, who, children }: { step: string; who: string; children: React.ReactNode }) {
  return (
    <Surface bodyClassName="p-4">
      <div className="flex items-center justify-between">
        <span className="text-hourops-navy text-sm font-semibold">{step}</span>
      </div>
      <p className="text-hourops-text-muted mt-0.5 text-[11px]">{who}</p>
      <div className="mt-3">{children}</div>
    </Surface>
  );
}

function WorkflowConnector() {
  return (
    <div className="flex items-center justify-center py-1 lg:py-0" aria-hidden>
      <span className="text-hourops-blue/45 rotate-90 text-2xl lg:rotate-0">→</span>
    </div>
  );
}
