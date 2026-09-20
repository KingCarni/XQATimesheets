"use client";

import { useState } from "react";
import { ArrowRight, Check, CheckCheck, ChevronDown } from "lucide-react";

import { Avatar, ProductNote, StatusPill, type StatusTone } from "./marketing-ui";

type Row = { name: string; project: string; hours: number; state: "ready" | "attention" | "open" };

const TEAM: Row[] = [
  { name: "Alex Morgan", project: "Project Atlas", hours: 40, state: "ready" },
  { name: "Jamie Chen", project: "Mobile QA", hours: 40, state: "ready" },
  { name: "Priya Nair", project: "Project Atlas", hours: 32, state: "attention" },
  { name: "Sam Okafor", project: "Platform", hours: 24, state: "open" },
  ...["Taylor Singh", "Jordan Lee", "Morgan Brooks", "Casey Park", "Riley Jones", "Avery Wu", "Noah Patel"].map(
    (name): Row => ({ name, project: "Project Atlas", hours: 40, state: "ready" }),
  ),
  { name: "Mia Williams", project: "Platform", hours: 36, state: "attention" },
  { name: "Leo Martin", project: "Mobile QA", hours: 32, state: "attention" },
  { name: "Ella Davis", project: "Mobile QA", hours: 16, state: "open" },
];

export function ApprovalsPreview() {
  const [filter, setFilter] = useState<"all" | "ready" | "attention" | "open">("all");
  const [approved, setApproved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = TEAM.filter((r) => filter === "all" || r.state === filter);
  const visible = expanded ? filtered : filtered.slice(0, 4);
  const filters: [typeof filter, string, string][] = [
    ["all", "12", "Submitted"],
    ["attention", "3", "Need attention"],
    ["open", "2", "Late / open"],
    ["ready", "9", approved ? "Approved" : "Ready"],
  ];

  function pillFor(state: Row["state"]): { label: string; tone: StatusTone } {
    if (state === "ready") return { label: approved ? "Approved" : "Ready to approve", tone: approved ? "approved" : "submitted" };
    if (state === "attention") return { label: "Needs attention", tone: "changes" };
    return { label: "Open week", tone: "open" };
  }

  return (
    <div className="ho-approvals-preview" data-testid="approvals-preview">
      <div className="ho-dark-toolbar">
        <div>
          <span className="ho-live-dot" />
          <strong>Team approvals</strong>
        </div>
        <span>Sep 14–20, 2026</span>
      </div>
      <div className="ho-approval-stats">
        {filters.map(([key, value, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setExpanded(false);
              setSelected(null);
            }}
            className={`${filter === key ? "is-selected" : ""} ho-filter-${key}`}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="ho-approval-list">
        {visible.map((r, i) => {
          const pill = pillFor(r.state);
          return (
            <div key={r.name}>
              <button
                className="ho-approval-row"
                onClick={() => setSelected(selected === r.name ? null : r.name)}
                aria-expanded={selected === r.name}
                data-testid={`approval-row-${i}`}
              >
                <Avatar name={r.name} />
                <span className="ho-person-name">
                  <strong>{r.name}</strong>
                  <small>{r.project}</small>
                </span>
                <b>{r.hours}h</b>
                <StatusPill label={pill.label} tone={pill.tone} />
                <ChevronDown size={13} />
              </button>
              {selected === r.name ? (
                <div className="ho-approval-detail">
                  <strong>{r.name} · week review</strong>
                  <p>
                    {r.state === "ready"
                      ? approved
                        ? "40 hours approved. This timesheet is ready for reporting."
                        : "All 5 days logged. Project assignments and hour descriptions are complete."
                      : r.state === "attention"
                        ? "Hours need clarification. Return the week with context before approval."
                        : "This week is still open. The employee must finish and submit before review."}
                  </p>
                  <span>
                    {r.state === "attention"
                      ? "Review note: please confirm the missing hours on Friday."
                      : "Project scope: assigned projects only"}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="ho-approval-bottom">
        <button className="ho-text-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `View all ${filtered.length}`} <ArrowRight size={13} />
        </button>
        <button onClick={() => setApproved(!approved)} className="ho-button ho-button-small">
          {approved ? (
            <>
              <Check size={14} /> Reset preview
            </>
          ) : (
            <>
              <CheckCheck size={14} /> Approve 9 ready
            </>
          )}
        </button>
      </div>
      <p className="ho-review-message" role="status" aria-live="polite">
        {approved
          ? "9 timesheets approved. 3 need review; 2 remain open."
          : "12 submitted: 9 ready + 3 need attention. 2 more weeks are still open."}
      </p>
      <ProductNote>Select a status or employee to explore · Illustrative data</ProductNote>
    </div>
  );
}
