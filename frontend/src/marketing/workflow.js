"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ArrowRight, Check, FileOutput, ListChecks, Send, Timer, CheckCheck, } from "lucide-react";
import { Chapter, Reveal } from "./marketing-motion";
const STEPS = [
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
    return (_jsxs("section", { id: "how", className: "ho-workflow ho-container ho-section", "data-testid": "workflow-section", children: [_jsxs(Reveal, { children: [_jsx(Chapter, { number: "01", children: "A better way for work to move" }), _jsxs("div", { className: "ho-section-heading", children: [_jsxs("h2", { children: ["One week.", _jsx("br", {}), _jsx("span", { children: "Zero loose ends." })] }), _jsx("p", { children: "From the person doing the work to the person running payroll. One connected flow, with nothing lost in between." })] })] }), _jsxs(Reveal, { delay: 0.1, children: [_jsx("div", { className: "ho-workflow-track", role: "tablist", "aria-label": "Time operations workflow", children: STEPS.map((s, i) => (_jsxs("button", { onClick: () => setActive(i), role: "tab", id: `workflow-tab-${i}`, "aria-selected": active === i, "aria-controls": "workflow-panel", className: active === i ? "is-active" : "", "data-testid": `workflow-step-${s.label.toLowerCase()}`, children: [_jsxs("span", { className: "ho-workflow-number", children: ["0", i + 1] }), _jsx("span", { className: "ho-workflow-node", children: _jsx(s.icon, { size: 19 }) }), _jsx("strong", { children: s.label }), _jsx("small", { children: s.who })] }, s.label))) }), _jsxs("div", { className: "ho-workflow-panel", id: "workflow-panel", role: "tabpanel", "aria-labelledby": `workflow-tab-${active}`, tabIndex: 0, "data-testid": "workflow-detail", children: [_jsxs("div", { children: [_jsx("h3", { children: step.title }), _jsx("p", { children: step.detail })] }), _jsxs("div", { className: "ho-workflow-result", children: [_jsxs("span", { children: [_jsx(Check, { size: 14 }), step.result] }), _jsxs("a", { href: step.next, "data-testid": "workflow-explore-link", children: [step.link, _jsx(ArrowRight, { size: 14 })] })] })] })] })] }));
}
