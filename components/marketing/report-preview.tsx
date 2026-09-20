"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronDown, FileCheck2 } from "lucide-react";

import { BarRow, Donut, ProductNote, PROJECTS, StatTile } from "./marketing-ui";
import { handleTabNavigation } from "./marketing-accessibility";

export function ReportPreview() {
  const [view, setView] = useState<"projects" | "work types">("projects");
  const [project, setProject] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const chosen = PROJECTS.find((p) => p.name === project);
  const total = chosen?.hours || 480;
  const workTypes = [
    { label: "Functional testing", pct: 41.6667, hours: (total * 5) / 12, color: "#087bea" },
    { label: "Regression testing", pct: 33.3333, hours: total / 3, color: "#04c9f4" },
    { label: "Bug verification", pct: 16.6667, hours: total / 6, color: "#6e97ba" },
    { label: "Documentation", pct: 8.3333, hours: total / 12, color: "#b8c9d8" },
  ];

  function exportCsv() {
    const data = [
      "MyHourVault illustrative project report",
      "Period,September 14-20 2026",
      "Project,Worked hours",
      ...(chosen ? [chosen] : PROJECTS).map((p) => `${p.name},${p.hours}`),
      `Total,${total}`,
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "myhourvault-sample-report-sep-14-20.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }

  const employeesFor = chosen
    ? ({ "Project Atlas": "6", "Mobile QA": "4", Platform: "2" } as Record<string, string>)[chosen.name] || "12"
    : "12";

  return (
    <div className="ho-report-preview" data-testid="report-preview">
      <div className="ho-product-toolbar">
        <div className="ho-product-title">
          <span className="ho-toolbar-icon">
            <FileCheck2 size={19} />
          </span>
          <div>
            <h3>Reports</h3>
            <p>Your week, accounted for.</p>
          </div>
        </div>
        <button className="ho-export-button" onClick={exportCsv} data-testid="report-export">
          <ArrowDownToLine size={14} />
          Export CSV
        </button>
      </div>
      <div className="ho-report-filter">
        <span>
          Sep 14–20, 2026 <ChevronDown size={12} />
        </span>
        <span>All employees</span>
        <span>{project || "All projects"}</span>
        <span className="ho-report-period">Weekly report</span>
      </div>
      <div className="ho-report-stats">
        <StatTile label="Total worked hours" value={`${total}h`} accent />
        <StatTile label="Billable hours" value={`${chosen ? Math.round((total * 448) / 480) : 448}h`} />
        <StatTile label="PTO (separate)" value={chosen ? "—" : "16h"} />
        <StatTile label="Employees" value={employeesFor} />
      </div>
      <div className="ho-report-chart-heading">
        <div className="ho-report-tabs" role="tablist" aria-label="Report breakdown" onKeyDown={handleTabNavigation}>
          {(["projects", "work types"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              aria-controls="report-chart"
              id={`report-tab-${v}`}
              tabIndex={view === v ? 0 : -1}
              onClick={() => {
                setView(v);
                setProject(null);
              }}
              className={view === v ? "is-selected" : ""}
            >
              By {v}
            </button>
          ))}
        </div>
        <span>Hours, not guesswork.</span>
      </div>
      <div className="ho-report-charts" role="tabpanel" id="report-chart" aria-labelledby={`report-tab-${view}`} tabIndex={0}>
        <div className="ho-report-donut">
          <Donut segments={view === "projects" && !chosen ? PROJECTS : workTypes} center={`${total}h`} sub={project || "TOTAL HOURS"} />
          <div className="ho-chart-legend">
            {view === "projects" && !chosen ? (
              PROJECTS.map((p) => (
                <button key={p.name} className="ho-legend-item" onClick={() => setProject(p.name)}>
                  <i style={{ background: p.color }} />
                  <span>{p.name}</span>
                  <strong>{p.hours}h</strong>
                  <ArrowUpRight size={13} />
                </button>
              ))
            ) : (
              <>
                <strong>{project || "Work-type distribution"}</strong>
                {workTypes.map((w) => (
                  <span key={w.label} className="ho-legend-item">
                    <i style={{ background: w.color }} />
                    <span>{w.label}</span>
                    <strong>{Math.round(w.hours * 10) / 10}h</strong>
                  </span>
                ))}
                {chosen ? (
                  <button className="ho-text-button" onClick={() => setProject(null)}>
                    <ArrowLeft size={13} /> All projects
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="ho-worktype-bars">
          <h4>{chosen ? `${project} · work types` : "What the work looked like"}</h4>
          {workTypes.map((w) => (
            <BarRow key={w.label} label={w.label} pct={w.pct} color={w.color} value={`${Math.round(w.hours * 10) / 10}h`} />
          ))}
        </div>
      </div>
      <div className="ho-report-bottom" role="status" aria-live="polite">
        <span>
          <Check size={13} />
          {exported
            ? "Sample CSV downloaded. Your original workspace data is unchanged."
            : "Approved work. Clear project totals. Ready for your next handoff."}
        </span>
        <span>
          CSV export <ArrowUpRight size={12} />
        </span>
      </div>
      <ProductNote>Explore projects, switch breakdowns, or export a sample CSV</ProductNote>
    </div>
  );
}
