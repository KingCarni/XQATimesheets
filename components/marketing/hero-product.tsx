import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCheck2,
  Layers,
  MousePointer2,
} from "lucide-react";

import { Avatar, StatusPill } from "./marketing-ui";

/**
 * Hero product composition: a timesheet → approval → report flow rendered as
 * layered surfaces. Static illustrative data; framer scroll-drift dropped.
 */
export function HeroProduct() {
  return (
    <div className="ho-hero-product" data-testid="hero-product-composition">
      <div className="ho-stage-top">
        <span>
          <i /> One connected workspace
        </span>
        <span>WEEK 38 / 2026</span>
      </div>
      <div className="ho-stage-ruler" aria-hidden="true">
        <span>MON</span>
        <span>TUE</span>
        <span>WED</span>
        <span>THU</span>
        <span>FRI</span>
      </div>

      <div className="ho-hero-sheet">
        <div className="ho-mini-heading">
          <div className="ho-icon-square">
            <Layers size={16} />
          </div>
          <div>
            <strong>My timesheet</strong>
            <span>Alex Morgan · Sep 14–20</span>
          </div>
          <StatusPill label="Submitted" tone="submitted" />
        </div>
        <div className="ho-hero-week">
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <div key={i}>
              <span>{d}</span>
              <div className="ho-time-block">
                <span>8h</span>
              </div>
            </div>
          ))}
          <div className="ho-week-total">
            <span>Weekly total</span>
            <strong>
              40<span>h</span>
            </strong>
          </div>
        </div>
        <div className="ho-hero-sheet-bottom">
          <span>
            <i /> Project Atlas
          </span>
          <span>Web · Regression testing</span>
          <Check size={14} />
        </div>
      </div>

      <div className="ho-connector-first" aria-hidden="true">
        <span />
        <ArrowDown size={17} />
        <small>Ready for review</small>
      </div>

      <div className="ho-hero-approval">
        <div className="ho-mini-heading">
          <span className="ho-step-dot">02</span>
          <strong>A clear next step.</strong>
          <span className="ho-mini-sub">Manager review</span>
        </div>
        <div className="ho-approval-person">
          <Avatar name="Alex Morgan" />
          <span>
            <strong>Alex Morgan</strong>
            <small>5 days · 2 projects</small>
          </span>
          <b>40h</b>
          <StatusPill label="Approved" tone="approved" />
        </div>
        <div className="ho-approved-by">
          <Check size={12} />
          <span>Reviewed by Jamie Chen</span>
          <span>Just now</span>
        </div>
      </div>

      <div className="ho-connector-second" aria-hidden="true">
        <ArrowDownRight size={27} />
        <span />
      </div>

      <div className="ho-hero-report">
        <div className="ho-export-icon">
          <FileCheck2 size={21} />
        </div>
        <div>
          <strong>Good work. Clean handoff.</strong>
          <span>Approved hours → payroll-ready report</span>
        </div>
        <span className="ho-export-tag">
          CSV <ArrowRight size={13} />
        </span>
      </div>

      <a className="ho-preview-trigger" href="#how" data-testid="hero-preview-tour">
        <MousePointer2 size={13} /> See how the hours move{" "}
        <ArrowUpRight size={13} />
      </a>
      <div className="ho-stage-coordinate" aria-hidden="true">
        EMPLOYEE → MANAGER → OPERATIONS
      </div>
    </div>
  );
}
