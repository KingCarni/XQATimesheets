"use client";

import { useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Laptop,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Avatar, StatusPill } from "./marketing-ui";
import { Chapter, Reveal } from "./marketing-motion";

export function TeamOperations() {
  return (
    <section id="solutions" className="ho-team-section">
      <div className="ho-container">
        <Reveal>
          <Chapter number="05" dark>
            The context around the clock
          </Chapter>
        </Reveal>
        <div className="ho-team-layout">
          <Reveal>
            <h2>
              More context.
              <br />
              <span>Less chasing.</span>
            </h2>
            <p>
              There&rsquo;s a person behind every timesheet.
              <br />
              Keep the details that make their work make sense, right alongside their hours.
            </p>
            <div className="ho-team-note">
              <span className="ho-small-rule" />
              <span>
                Not another HR system.
                <br />
                The operational context your team actually needs.
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.15} className="ho-person-surface">
            <div className="ho-profile-header">
              <Avatar name="Alex Morgan" />
              <div>
                <h3>Alex Morgan</h3>
                <p>QA Analyst &middot; Engineering</p>
              </div>
              <StatusPill label="Active" tone="approved" />
            </div>
            <dl className="ho-profile-data">
              <div>
                <dt>Project assignments</dt>
                <dd>
                  Project Atlas <span>Mobile QA</span>
                </dd>
              </div>
              <div>
                <dt>Time off</dt>
                <dd>
                  Sep 22&ndash;24 <StatusPill label="Approved" tone="approved" />
                </dd>
              </div>
              <div>
                <dt>
                  <Laptop size={13} /> Equipment
                </dt>
                <dd>
                  MacBook Pro 16&Prime; <small>Assigned</small>
                </dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>
                  Full-time <small>Active</small>
                </dd>
              </div>
              <div>
                <dt>This week&rsquo;s hours</dt>
                <dd>
                  <strong>40.0h</strong>
                  <span className="ho-profile-hours">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </dd>
              </div>
            </dl>
            <p className="ho-profile-footnote">Illustrative employee profile &middot; One connected view</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function ImportFlow() {
  const [reviewed, setReviewed] = useState(false);
  return (
    <section className="ho-import-section ho-container" id="onboarding">
      <Reveal className="ho-import-copy">
        <Chapter number="06">A simpler starting point</Chapter>
        <h2>
          Bring the spreadsheet.
          <br />
          <span>Leave the busywork.</span>
        </h2>
        <p>
          Your team already exists in Excel. Start there. Preview your people and projects, resolve
          anything flagged, then make the move.
        </p>
      </Reveal>
      <Reveal delay={0.1} className="ho-import-flow">
        <div className="ho-import-file">
          <span>
            <FileSpreadsheet size={24} />
          </span>
          <div>
            <strong>employees.xlsx</strong>
            <small>Your existing employee list</small>
          </div>
          <span className="ho-file-extension">.XLSX</span>
        </div>
        <div className="ho-import-connector">
          <ArrowDown size={17} />
        </div>
        <div className="ho-import-checks">
          <div>
            <Check size={14} />
            <span>24 employees found</span>
            <span>Ready</span>
          </div>
          <div>
            <Check size={14} />
            <span>3 projects detected</span>
            <span>Mapped</span>
          </div>
          <div className={reviewed ? "" : "ho-import-warning"}>
            {reviewed ? <Check size={14} /> : <span className="ho-warning-dot" />}
            <span>{reviewed ? "Row 18 · email confirmed" : "1 row needs review"}</span>
            <button onClick={() => setReviewed(!reviewed)} data-testid="import-review-button">
              {reviewed ? "Reset" : "Review"}
              <ArrowRight size={12} />
            </button>
          </div>
          {!reviewed ? (
            <p className="ho-import-issue">Row 18: confirm the employee&rsquo;s email address before importing.</p>
          ) : null}
        </div>
        <div className="ho-import-connector">
          <ArrowDown size={17} />
        </div>
        <div className={`ho-import-ready ${reviewed ? "is-ready" : ""}`} role="status" aria-live="polite">
          <CheckCircle2 size={20} />
          <div>
            <strong>{reviewed ? "Workspace ready" : "Review first. Import with confidence."}</strong>
            <small>
              {reviewed ? "Preview validated · ready to invite your team" : "Nothing is created until you confirm."}
            </small>
          </div>
        </div>
        <p className="ho-import-disclaimer">Illustrative import review &middot; no file uploaded or records created</p>
      </Reveal>
    </section>
  );
}

type Brand = {
  name: string;
  initials: string;
  accent: string;
  description: string;
  hours: string;
  people: string;
  project: string;
  department: string;
};

const BRANDS: Brand[] = [
  {
    name: "Northstar QA",
    initials: "N",
    accent: "#087bea",
    description: "Built for the way your QA team works.",
    hours: "480h",
    people: "12",
    project: "Project Atlas",
    department: "Quality assurance",
  },
  {
    name: "Acme Studio",
    initials: "a",
    accent: "#c75f32",
    description: "Your creative studio. Your familiar space.",
    hours: "360h",
    people: "10",
    project: "Brand refresh",
    department: "Design & creative",
  },
  {
    name: "Vertex Labs",
    initials: "V",
    accent: "#12766b",
    description: "A focused workspace for engineering teams.",
    hours: "640h",
    people: "18",
    project: "Platform release",
    department: "Engineering",
  },
];

export function WorkspaceBrandPreview() {
  const [selected, setSelected] = useState(0);
  const brand = BRANDS[selected];
  return (
    <section id="workspaces" className="ho-workspaces">
      <div className="ho-container">
        <Reveal>
          <Chapter number="07">Yours, from the first sign-in</Chapter>
          <div className="ho-section-heading">
            <h2>
              Your team.
              <br />
              <span>Your workspace.</span>
            </h2>
            <p>
              Your name. Your colors. Your own company portal.
              <br />
              MyHourVault adapts to your company&mdash;not the other way around.
            </p>
          </div>
        </Reveal>
        <Reveal className="ho-workspace-composition">
          <div className="ho-brand-picker" role="tablist" aria-label="Example company branding">
            {BRANDS.map((b, i) => (
              <button
                key={b.name}
                role="tab"
                id={`brand-tab-${i}`}
                aria-controls="brand-panel"
                aria-selected={selected === i}
                tabIndex={selected === i ? 0 : -1}
                className={selected === i ? "is-selected" : ""}
                onClick={() => setSelected(i)}
                style={{ ["--workspace-accent"]: b.accent } as CSSProperties}
              >
                <span className="ho-company-mark">{b.initials}</span>
                <span>
                  <strong>{b.name}</strong>
                  <small>{b.department}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
            <p>Example brands, not customer endorsements.</p>
          </div>
          <div
            className="ho-branded-window"
            role="tabpanel"
            id="brand-panel"
            aria-labelledby={`brand-tab-${selected}`}
            tabIndex={0}
            style={{ ["--workspace-accent"]: brand.accent } as CSSProperties}
          >
            <aside>
              <span className="ho-company-mark">{brand.initials}</span>
              <i />
              <i />
              <i />
              <i />
            </aside>
            <div className="ho-branded-content">
              <div className="ho-workspace-title">
                <strong>{brand.name}</strong>
                <span>
                  <LockKeyhole size={11} /> Private workspace
                </span>
              </div>
              <p>{brand.description}</p>
              <div className="ho-workspace-metrics">
                <div>
                  <span>Logged this week</span>
                  <strong>{brand.hours}</strong>
                </div>
                <div>
                  <span>Employees</span>
                  <strong>{brand.people}</strong>
                </div>
                <div>
                  <span>Workspace</span>
                  <strong>All yours.</strong>
                </div>
              </div>
              <div className="ho-workspace-row">
                <span>
                  <i />
                  {brand.project}
                </span>
                <StatusPill label="In progress" tone="submitted" />
              </div>
              <div className="ho-workspace-row">
                <span>
                  <Users size={13} />
                  Your people. Your projects.
                </span>
                <Check size={13} />
              </div>
            </div>
          </div>
        </Reveal>
        <div className="ho-tenant-note">
          <ShieldCheck size={16} />
          <p>
            Separate organizations. Separate data.{" "}
            <span>Your company&rsquo;s work stays in your company&rsquo;s workspace.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
