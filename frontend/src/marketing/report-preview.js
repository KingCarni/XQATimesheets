"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronDown, FileCheck2, } from "lucide-react";
import { BarRow, Donut, ProductNote, PROJECTS, StatTile } from "./marketing-ui";
export function ReportPreview() {
    const id = useId();
    const [view, setView] = useState("projects");
    const [project, setProject] = useState(null);
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
            "HourOps illustrative project report",
            "Period,September 14-20 2026",
            "Project,Worked hours",
            ...(chosen ? [chosen] : PROJECTS).map((p) => `${p.name},${p.hours}`),
            `Total,${total}`,
        ].join("\r\n");
        const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8;" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "hourops-sample-report-sep-14-20.csv";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setExported(true);
    }
    return (_jsxs("div", { className: "ho-report-preview", "data-testid": `report-preview-${id}`, children: [_jsxs("div", { className: "ho-product-toolbar", children: [_jsxs("div", { className: "ho-product-title", children: [_jsx("span", { className: "ho-toolbar-icon", children: _jsx(FileCheck2, { size: 19 }) }), _jsxs("div", { children: [_jsx("h3", { children: "Reports" }), _jsx("p", { children: "Your week, accounted for." })] })] }), _jsxs("button", { className: "ho-export-button", onClick: exportCsv, "data-testid": `report-export-${id}`, children: [_jsx(ArrowDownToLine, { size: 14 }), "Export CSV"] })] }), _jsxs("div", { className: "ho-report-filter", children: [_jsxs("span", { children: ["Sep 14\u201320, 2026 ", _jsx(ChevronDown, { size: 12 })] }), _jsx("span", { children: "All employees" }), _jsx("span", { children: project || "All projects" }), _jsx("span", { className: "ho-report-period", children: "Weekly report" })] }), _jsxs("div", { className: "ho-report-stats", children: [_jsx(StatTile, { label: "Total worked hours", value: `${total}h`, accent: true }), _jsx(StatTile, { label: "Billable hours", value: `${chosen ? Math.round((total * 448) / 480) : 448}h` }), _jsx(StatTile, { label: "PTO (separate)", value: chosen ? "—" : "16h" }), _jsx(StatTile, { label: "Employees", value: chosen
                            ? { "Project Atlas": "6", "Mobile QA": "4", Platform: "2" }[chosen.name] || "12"
                            : "12" })] }), _jsxs("div", { className: "ho-report-chart-heading", children: [_jsx("div", { className: "ho-report-tabs", role: "tablist", "aria-label": "Report breakdown", children: ["projects", "work types"].map((v) => (_jsxs("button", { role: "tab", "aria-selected": view === v, "aria-controls": `chart-${id}`, id: `report-tab-${v}-${id}`, onClick: () => {
                                setView(v);
                                setProject(null);
                            }, className: view === v ? "is-selected" : "", "data-testid": `report-tab-${v.replace(" ", "-")}-${id}`, children: ["By ", v] }, v))) }), _jsx("span", { children: "Hours, not guesswork." })] }), _jsxs("div", { className: "ho-report-charts", role: "tabpanel", id: `chart-${id}`, "aria-labelledby": `report-tab-${view}-${id}`, tabIndex: 0, children: [_jsxs("div", { className: "ho-report-donut", children: [_jsx(Donut, { segments: view === "projects" && !chosen ? PROJECTS : workTypes, center: `${total}h`, sub: project || "TOTAL HOURS" }), _jsx("div", { className: "ho-chart-legend", children: view === "projects" && !chosen ? (PROJECTS.map((p) => (_jsxs("button", { className: "ho-legend-item", onClick: () => setProject(p.name), "data-testid": `project-drilldown-${p.name.replaceAll(" ", "-").toLowerCase()}-${id}`, children: [_jsx("i", { style: { background: p.color } }), _jsx("span", { children: p.name }), _jsxs("strong", { children: [p.hours, "h"] }), _jsx(ArrowUpRight, { size: 13 })] }, p.name)))) : (_jsxs(_Fragment, { children: [_jsx("strong", { children: project || "Work-type distribution" }), workTypes.map((w) => (_jsxs("span", { className: "ho-legend-item", children: [_jsx("i", { style: { background: w.color } }), _jsx("span", { children: w.label }), _jsxs("strong", { children: [Math.round(w.hours * 10) / 10, "h"] })] }, w.label))), chosen && (_jsxs("button", { className: "ho-text-button", onClick: () => setProject(null), "data-testid": `report-back-${id}`, children: [_jsx(ArrowLeft, { size: 13 }), " All projects"] }))] })) })] }), _jsxs("div", { className: "ho-worktype-bars", children: [_jsx("h4", { children: chosen ? `${project} · work types` : "What the work looked like" }), workTypes.map((w) => (_jsx(BarRow, { label: w.label, pct: w.pct, color: w.color, value: `${Math.round(w.hours * 10) / 10}h` }, w.label)))] })] }), _jsxs("div", { className: "ho-report-bottom", role: "status", "aria-live": "polite", "data-testid": `report-export-status-${id}`, children: [_jsxs("span", { children: [_jsx(Check, { size: 13 }), exported
                                ? "Sample CSV downloaded. Your original workspace data is unchanged."
                                : "Approved work. Clear project totals. Ready for your next handoff."] }), _jsxs("span", { children: ["CSV export ", _jsx(ArrowUpRight, { size: 12 })] })] }), _jsx(ProductNote, { children: "Explore projects, switch breakdowns, or export a sample CSV" })] }));
}
