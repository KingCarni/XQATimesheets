"use client";

import { useState, type ComponentType } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  FileOutput,
  ListChecks,
  Send,
  Timer,
} from "lucide-react";

import { Chapter, Reveal } from "./marketing-motion";
import { handleTabNavigation } from "./marketing-accessibility";

type Step = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  who: string;
  title: string;
  detail: string;
  result: string;
  next: string;
  link: string;
};

const STEPS: Step[] = [
  {
    label: "Log",
    icon: Timer,
    who: "Employees",
    title: "The work starts here.",
    detail: "Project, platform, work type, hours. A quick note adds the context your manager needs.",
    result: "Monday · Project Atlas · 8.0h",
    next: "#timesheets",
    link: "Explore timesheets",
  },
  {
    label: "Submit",
    icon: Send,
    who: "Employees",
    title: "A whole week. One handoff.",
    detail: "Employees review their weekly totals and submit once. No attachment, no follow-up thread.",
    result: "Week 38 · 40.0h · Submitted",
    next: "#timesheets",
    link: "Try a weekly submission",
  },
  {
    label: "Review",
    icon: ListChecks,
    who: "Managers",
    title: "Attention goes where it’s needed.",
    detail: "See missing hours, open weeks, and complete submissions in one review queue, scoped to your team.",
    result: "12 submitted · 3 need attention",
    next: "#approvals",
    link: "Explore manager review",
  },
  {
    label: "Approve",
    icon: CheckCheck,
    who: "Managers",
    title: "Clear decisions. Useful context.",
    detail: "Approve the ready timesheets. Return the others with a reason, so everyone knows what happens next.",
    result: "9 ready · Reviewed & approved",
    next: "#approvals",
    link: "Try approvals",
  },
  {
    label: "Report",
    icon: FileOutput,
    who: "Operations & payroll",
    title: "Hours become answers.",
    detail: "Break down approved work by project and work type, then export clean data for your payroll process.",
    result: "480 worked hours · Export ready",
    next: "#reporting",
    link: "Explore reporting",
  },
];

export function Workflow() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  return (
    <section id="how" className="ho-workflow ho-container ho-section" data-testid="workflow-section">
      <Reveal>
        <Chapter number="01">A better way for work to move</Chapter>
        <div className="ho-section-heading">
          <h2>
            One week.
            <br />
            <span>Zero loose ends.</span>
          </h2>
          <p>
            From the person doing the work to the person running payroll. One connected flow, with
            nothing lost in between.
          </p>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="ho-workflow-track" role="tablist" aria-label="Time operations workflow" onKeyDown={handleTabNavigation}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                onClick={() => setActive(i)}
                role="tab"
                id={`workflow-tab-${i}`}
                aria-selected={active === i}
                aria-controls="workflow-panel"
                tabIndex={active === i ? 0 : -1}
                className={active === i ? "is-active" : ""}
              >
                <span className="ho-workflow-number">0{i + 1}</span>
                <span className="ho-workflow-node">
                  <Icon size={19} />
                </span>
                <strong>{s.label}</strong>
                <small>{s.who}</small>
              </button>
            );
          })}
        </div>
        <div
          className="ho-workflow-panel"
          id="workflow-panel"
          role="tabpanel"
          aria-labelledby={`workflow-tab-${active}`}
          tabIndex={0}
        >
          <div>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
          </div>
          <div className="ho-workflow-result">
            <span>
              <Check size={14} />
              {step.result}
            </span>
            <a href={step.next}>
              {step.link}
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
