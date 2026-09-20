"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, Check, RotateCcw } from "lucide-react";

import { ProductNote, StatusPill } from "./marketing-ui";
import { handleTabNavigation } from "./marketing-accessibility";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ROWS: [string, string, string, string, string][] = [
  ["Project Atlas", "Web", "Regression testing", "Checkout flow · release 2.4", "3.5"],
  ["Mobile QA", "iOS", "Functional testing", "Onboarding & account setup", "2.5"],
  ["Project Atlas", "Web", "Bug verification", "Verify fixes · AT-142, AT-148", "2.0"],
];
const ALT_DESC = [
  "Sprint 18 · test execution",
  "Release candidate validation",
  "Retest resolved issues",
];

export function TimesheetPreview() {
  const [day, setDay] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="ho-timesheet" data-testid="timesheet-preview">
      <div className="ho-product-toolbar">
        <div className="ho-product-title">
          <span className="ho-toolbar-icon">
            <CalendarDays size={19} />
          </span>
          <div>
            <h3>My timesheet</h3>
            <p>September 14–20, 2026</p>
          </div>
        </div>
        <div className="ho-toolbar-actions">
          <StatusPill tone={submitted ? "submitted" : "open"} label={submitted ? "Submitted" : "Open week"} />
          <button
            className={`ho-button ho-button-small ${submitted ? "ho-button-quiet" : ""}`}
            onClick={() => setSubmitted(!submitted)}
          >
            {submitted ? (
              <>
                <RotateCcw size={13} /> Reset preview
              </>
            ) : (
              <>
                Submit week <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="ho-timesheet-main">
        <div className="ho-day-tabs" role="tablist" aria-label="Timesheet days" onKeyDown={handleTabNavigation}>
          {DAYS.map((d, i) => (
            <button
              key={d}
              role="tab"
              aria-selected={day === i}
              aria-controls="day-panel"
              id={`day-tab-${i}`}
              tabIndex={day === i ? 0 : -1}
              className={day === i ? "is-selected" : ""}
              onClick={() => setDay(i)}
            >
              <span>
                {d} <small>{14 + i}</small>
              </span>
              <strong>
                8.0<span>h</span>
              </strong>
              <i />
            </button>
          ))}
          <div className="ho-timesheet-total">
            <span>Weekly total</span>
            <strong>
              40.0<small>h</small>
            </strong>
            <span>5 of 5 days logged</span>
          </div>
        </div>
        <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${day}`} tabIndex={0} className="ho-timesheet-panel">
          <div className="ho-day-caption">
            <strong>
              {DAY_NAMES[day]}, September {14 + day}
            </strong>
            <span>8.0 hours logged</span>
          </div>
          <div className="ho-entry-table" role="table" aria-label="Daily timesheet entries">
            <div className="ho-entry-row ho-entry-head" role="row">
              {["Project", "Platform", "Work type", "Description", "Hours"].map((h) => (
                <span role="columnheader" key={h}>
                  {h}
                </span>
              ))}
            </div>
            {ROWS.map((r, i) => (
              <div className="ho-entry-row" role="row" key={r[2]}>
                <span role="cell" className="ho-project-cell">
                  <i className={i === 1 ? "cyan" : ""} />
                  {r[0]}
                </span>
                <span role="cell" className="ho-platform-cell">
                  {r[1]}
                </span>
                <span role="cell">{r[2]}</span>
                <span role="cell" className="ho-description-cell">
                  {day === 0 ? r[3] : ALT_DESC[i]}
                </span>
                <strong role="cell">{r[4]}</strong>
              </div>
            ))}
          </div>
          <div className="ho-timesheet-footer">
            <span role="status" aria-live="polite">
              <Check size={14} />
              {submitted
                ? "Week submitted. Your manager can now review all 40 hours."
                : "Everything in one place. Nothing to reconstruct on Friday."}
            </span>
            <span>
              40.0h <small>this week</small>
            </span>
          </div>
        </div>
      </div>
      <ProductNote>Try selecting a day or submitting the week · Illustrative data</ProductNote>
    </div>
  );
}
