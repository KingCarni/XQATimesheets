"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ArrowDown, ArrowRight, Check, CheckCircle2, FileSpreadsheet, Laptop, LockKeyhole, ShieldCheck, Users, } from "lucide-react";
import { Avatar, StatusPill } from "./marketing-ui";
import { Chapter, Reveal } from "./marketing-motion";
export function TeamOperations() {
    return (_jsx("section", { id: "solutions", className: "ho-team-section", children: _jsxs("div", { className: "ho-container", children: [_jsx(Reveal, { children: _jsx(Chapter, { number: "05", dark: true, children: "The context around the clock" }) }), _jsxs("div", { className: "ho-team-layout", children: [_jsxs(Reveal, { children: [_jsxs("h2", { children: ["More context.", _jsx("br", {}), _jsx("span", { children: "Less chasing." })] }), _jsxs("p", { children: ["There\u2019s a person behind every timesheet.", _jsx("br", {}), "Keep the details that make their work make sense, right alongside their hours."] }), _jsxs("div", { className: "ho-team-note", children: [_jsx("span", { className: "ho-small-rule" }), _jsxs("span", { children: ["Not another HR system.", _jsx("br", {}), "The operational context your team actually needs."] })] })] }), _jsxs(Reveal, { delay: 0.15, className: "ho-person-surface", children: [_jsxs("div", { className: "ho-profile-header", children: [_jsx(Avatar, { name: "Alex Morgan" }), _jsxs("div", { children: [_jsx("h3", { children: "Alex Morgan" }), _jsx("p", { children: "QA Analyst \u00B7 Engineering" })] }), _jsx(StatusPill, { label: "Active", tone: "approved" })] }), _jsxs("dl", { className: "ho-profile-data", children: [_jsxs("div", { children: [_jsx("dt", { children: "Project assignments" }), _jsxs("dd", { children: ["Project Atlas ", _jsx("span", { children: "Mobile QA" })] })] }), _jsxs("div", { children: [_jsx("dt", { children: "Time off" }), _jsxs("dd", { children: ["Sep 22\u201324 ", _jsx(StatusPill, { label: "Approved", tone: "approved" })] })] }), _jsxs("div", { children: [_jsxs("dt", { children: [_jsx(Laptop, { size: 13 }), " Equipment"] }), _jsxs("dd", { children: ["MacBook Pro 16\u2033 ", _jsx("small", { children: "Assigned" })] })] }), _jsxs("div", { children: [_jsx("dt", { children: "Contract" }), _jsxs("dd", { children: ["Full-time ", _jsx("small", { children: "Active" })] })] }), _jsxs("div", { children: [_jsx("dt", { children: "This week\u2019s hours" }), _jsxs("dd", { children: [_jsx("strong", { children: "40.0h" }), _jsxs("span", { className: "ho-profile-hours", children: [_jsx("i", {}), _jsx("i", {}), _jsx("i", {}), _jsx("i", {}), _jsx("i", {})] })] })] })] }), _jsx("p", { className: "ho-profile-footnote", children: "Illustrative employee profile \u00B7 One connected view" })] })] })] }) }));
}
export function ImportFlow() {
    const [reviewed, setReviewed] = useState(false);
    return (_jsxs("section", { className: "ho-import-section ho-container", id: "onboarding", children: [_jsxs(Reveal, { className: "ho-import-copy", children: [_jsx(Chapter, { number: "06", children: "A simpler starting point" }), _jsxs("h2", { children: ["Bring the spreadsheet.", _jsx("br", {}), _jsx("span", { children: "Leave the busywork." })] }), _jsx("p", { children: "Your team already exists in Excel. Start there. Preview your people and projects, resolve anything flagged, then make the move." })] }), _jsxs(Reveal, { delay: 0.1, className: "ho-import-flow", children: [_jsxs("div", { className: "ho-import-file", children: [_jsx("span", { children: _jsx(FileSpreadsheet, { size: 24 }) }), _jsxs("div", { children: [_jsx("strong", { children: "employees.xlsx" }), _jsx("small", { children: "Your existing employee list" })] }), _jsx("span", { className: "ho-file-extension", children: ".XLSX" })] }), _jsx("div", { className: "ho-import-connector", children: _jsx(ArrowDown, { size: 17 }) }), _jsxs("div", { className: "ho-import-checks", children: [_jsxs("div", { children: [_jsx(Check, { size: 14 }), _jsx("span", { children: "24 employees found" }), _jsx("span", { children: "Ready" })] }), _jsxs("div", { children: [_jsx(Check, { size: 14 }), _jsx("span", { children: "3 projects detected" }), _jsx("span", { children: "Mapped" })] }), _jsxs("div", { className: reviewed ? "" : "ho-import-warning", children: [reviewed ? _jsx(Check, { size: 14 }) : _jsx("span", { className: "ho-warning-dot" }), _jsx("span", { children: reviewed ? "Row 18 · email confirmed" : "1 row needs review" }), _jsxs("button", { onClick: () => setReviewed(!reviewed), "data-testid": "import-review-button", children: [reviewed ? "Reset" : "Review", _jsx(ArrowRight, { size: 12 })] })] }), !reviewed && (_jsx("p", { className: "ho-import-issue", "data-testid": "import-row-issue", children: "Row 18: confirm the employee\u2019s email address before importing." }))] }), _jsx("div", { className: "ho-import-connector", children: _jsx(ArrowDown, { size: 17 }) }), _jsxs("div", { className: `ho-import-ready ${reviewed ? "is-ready" : ""}`, role: "status", "aria-live": "polite", "data-testid": "import-state", children: [_jsx(CheckCircle2, { size: 20 }), _jsxs("div", { children: [_jsx("strong", { children: reviewed ? "Workspace ready" : "Review first. Import with confidence." }), _jsx("small", { children: reviewed
                                            ? "Preview validated · ready to invite your team"
                                            : "Nothing is created until you confirm." })] })] }), _jsx("p", { className: "ho-import-disclaimer", children: "Illustrative import review \u00B7 no file uploaded or records created" })] })] }));
}
const BRANDS = [
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
    return (_jsx("section", { id: "workspaces", className: "ho-workspaces", children: _jsxs("div", { className: "ho-container", children: [_jsxs(Reveal, { children: [_jsx(Chapter, { number: "07", children: "Yours, from the first sign-in" }), _jsxs("div", { className: "ho-section-heading", children: [_jsxs("h2", { children: ["Your team.", _jsx("br", {}), _jsx("span", { children: "Your workspace." })] }), _jsxs("p", { children: ["Your name. Your colors. Your own company portal.", _jsx("br", {}), "HourOps adapts to your company\u2014not the other way around."] })] })] }), _jsxs(Reveal, { className: "ho-workspace-composition", children: [_jsxs("div", { className: "ho-brand-picker", role: "tablist", "aria-label": "Example company branding", children: [BRANDS.map((b, i) => (_jsxs("button", { role: "tab", id: `brand-tab-${i}`, "aria-controls": "brand-panel", "aria-selected": selected === i, className: selected === i ? "is-selected" : "", onClick: () => setSelected(i), style: { "--workspace-accent": b.accent }, "data-testid": `workspace-${i}`, children: [_jsx("span", { className: "ho-company-mark", children: b.initials }), _jsxs("span", { children: [_jsx("strong", { children: b.name }), _jsx("small", { children: b.department })] }), _jsx(ArrowRight, { size: 18 })] }, b.name))), _jsx("p", { children: "Example brands, not customer endorsements." })] }), _jsxs("div", { className: "ho-branded-window", role: "tabpanel", id: "brand-panel", "aria-labelledby": `brand-tab-${selected}`, tabIndex: 0, style: { "--workspace-accent": brand.accent }, "data-testid": "workspace-preview", children: [_jsxs("aside", { children: [_jsx("span", { className: "ho-company-mark", children: brand.initials }), _jsx("i", {}), _jsx("i", {}), _jsx("i", {}), _jsx("i", {})] }), _jsxs("div", { className: "ho-branded-content", children: [_jsxs("div", { className: "ho-workspace-title", children: [_jsx("strong", { children: brand.name }), _jsxs("span", { children: [_jsx(LockKeyhole, { size: 11 }), " Private workspace"] })] }), _jsx("p", { children: brand.description }), _jsxs("div", { className: "ho-workspace-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Logged this week" }), _jsx("strong", { children: brand.hours })] }), _jsxs("div", { children: [_jsx("span", { children: "Employees" }), _jsx("strong", { children: brand.people })] }), _jsxs("div", { children: [_jsx("span", { children: "Workspace" }), _jsx("strong", { children: "All yours." })] })] }), _jsxs("div", { className: "ho-workspace-row", children: [_jsxs("span", { children: [_jsx("i", {}), brand.project] }), _jsx(StatusPill, { label: "In progress", tone: "submitted" })] }), _jsxs("div", { className: "ho-workspace-row", children: [_jsxs("span", { children: [_jsx(Users, { size: 13 }), "Your people. Your projects."] }), _jsx(Check, { size: 13 })] })] })] })] }), _jsxs("div", { className: "ho-tenant-note", children: [_jsx(ShieldCheck, { size: 16 }), _jsxs("p", { children: ["Separate organizations. Separate data.", " ", _jsx("span", { children: "Your company\u2019s work stays in your company\u2019s workspace." })] })] })] }) }));
}
