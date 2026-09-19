"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useState } from "react";
import { ArrowRight, Check, CheckCheck, ChevronDown } from "lucide-react";
import { Avatar, StatusPill, ProductNote } from "./marketing-ui";
const TEAM = [
    { name: "Alex Morgan", project: "Project Atlas", hours: 40, state: "ready" },
    { name: "Jamie Chen", project: "Mobile QA", hours: 40, state: "ready" },
    { name: "Priya Nair", project: "Project Atlas", hours: 32, state: "attention" },
    { name: "Sam Okafor", project: "Platform", hours: 24, state: "open" },
    ...[
        "Taylor Singh",
        "Jordan Lee",
        "Morgan Brooks",
        "Casey Park",
        "Riley Jones",
        "Avery Wu",
        "Noah Patel",
    ].map((name) => ({ name, project: "Project Atlas", hours: 40, state: "ready" })),
    { name: "Mia Williams", project: "Platform", hours: 36, state: "attention" },
    { name: "Leo Martin", project: "Mobile QA", hours: 32, state: "attention" },
    { name: "Ella Davis", project: "Mobile QA", hours: 16, state: "open" },
];
export function ApprovalsPreview() {
    const id = useId();
    const [filter, setFilter] = useState("all");
    const [approved, setApproved] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [selected, setSelected] = useState(null);
    const filtered = TEAM.filter((r) => filter === "all" || r.state === filter);
    const visible = expanded ? filtered : filtered.slice(0, 4);
    const filters = [
        ["all", "12", "Submitted"],
        ["attention", "3", "Need attention"],
        ["open", "2", "Late / open"],
        ["ready", "9", approved ? "Approved" : "Ready"],
    ];
    return (_jsxs("div", { className: "ho-approvals-preview", "data-testid": `approvals-preview-${id}`, children: [_jsxs("div", { className: "ho-dark-toolbar", children: [_jsxs("div", { children: [_jsx("span", { className: "ho-live-dot" }), _jsx("strong", { children: "Team approvals" })] }), _jsx("span", { children: "Sep 14\u201320, 2026" })] }), _jsx("div", { className: "ho-approval-stats", children: filters.map(([key, value, label]) => (_jsxs("button", { "aria-pressed": filter === key, onClick: () => {
                        setFilter(key);
                        setExpanded(false);
                        setSelected(null);
                    }, className: `${filter === key ? "is-selected" : ""} ho-filter-${key}`, "data-testid": `approval-filter-${key}-${id}`, children: [_jsx("strong", { children: value }), _jsx("span", { children: label })] }, key))) }), _jsx("div", { className: "ho-approval-list", children: visible.map((r, i) => (_jsxs("div", { children: [_jsxs("button", { className: "ho-approval-row", onClick: () => setSelected(selected === r.name ? null : r.name), "aria-expanded": selected === r.name, "data-testid": `approval-row-${i}-${id}`, children: [_jsx(Avatar, { name: r.name }), _jsxs("span", { className: "ho-person-name", children: [_jsx("strong", { children: r.name }), _jsx("small", { children: r.project })] }), _jsxs("b", { children: [r.hours, "h"] }), _jsx(StatusPill, { label: r.state === "ready"
                                        ? approved
                                            ? "Approved"
                                            : "Ready to approve"
                                        : r.state === "attention"
                                            ? "Needs attention"
                                            : "Open week", tone: r.state === "ready"
                                        ? approved
                                            ? "approved"
                                            : "submitted"
                                        : r.state === "attention"
                                            ? "changes"
                                            : "open" }), _jsx(ChevronDown, { size: 13 })] }), selected === r.name && (_jsxs("div", { className: "ho-approval-detail", "data-testid": `approval-detail-${id}`, children: [_jsxs("strong", { children: [r.name, " \u00B7 week review"] }), _jsx("p", { children: r.state === "ready"
                                        ? approved
                                            ? "40 hours approved. This timesheet is ready for reporting."
                                            : "All 5 days logged. Project assignments and hour descriptions are complete."
                                        : r.state === "attention"
                                            ? "Hours need clarification. Return the week with context before approval."
                                            : "This week is still open. The employee must finish and submit before review." }), _jsx("span", { children: r.state === "attention"
                                        ? "Review note: please confirm the missing hours on Friday."
                                        : "Project scope: assigned projects only" })] }))] }, r.name))) }), _jsxs("div", { className: "ho-approval-bottom", children: [_jsxs("button", { className: "ho-text-button", onClick: () => setExpanded(!expanded), "data-testid": `approval-show-all-${id}`, children: [expanded ? "Show fewer" : `View all ${filtered.length}`, " ", _jsx(ArrowRight, { size: 13 })] }), _jsx("button", { onClick: () => setApproved(!approved), className: "ho-button ho-button-small", "data-testid": `approve-ready-${id}`, children: approved ? (_jsxs(_Fragment, { children: [_jsx(Check, { size: 14 }), " Reset preview"] })) : (_jsxs(_Fragment, { children: [_jsx(CheckCheck, { size: 14 }), " Approve 9 ready"] })) })] }), _jsx("p", { className: "ho-review-message", role: "status", "aria-live": "polite", "data-testid": `approval-feedback-${id}`, children: approved
                    ? "9 timesheets approved. 3 need review; 2 remain open."
                    : "12 submitted: 9 ready + 3 need attention. 2 more weeks are still open." }), _jsx(ProductNote, { children: "Select a status or employee to explore \u00B7 Illustrative data" })] }));
}
