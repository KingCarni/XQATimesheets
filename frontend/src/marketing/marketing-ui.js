"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from "react";
import { Check, ArrowUpRight } from "lucide-react";
/** Presentation data only. These previews never query or mutate tenant data. */
export function Surface({ children, title, meta, className = "", bodyClassName = "", }) {
    const id = useId();
    return (_jsxs("div", { className: `ho-surface ${className}`, "data-testid": `product-surface-${id}`, children: [title && (_jsxs("div", { className: "ho-surface-heading", children: [_jsx("strong", { children: title }), meta && _jsx("span", { children: meta })] })), _jsx("div", { className: `ho-surface-body ${bodyClassName}`, children: children })] }));
}
export function StatusPill({ label, tone = "open", }) {
    const id = useId();
    return (_jsxs("span", { className: `ho-status ho-status-${tone}`, "data-testid": `status-${id}`, children: [tone === "approved" ? _jsx(Check, { size: 11 }) : _jsx("i", {}), label] }));
}
export function Avatar({ name, className = "" }) {
    return (_jsx("span", { className: `ho-avatar ${className}`, "aria-hidden": "true", children: name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("") }));
}
export function StatTile({ label, value, accent = false, }) {
    const id = useId();
    return (_jsxs("div", { className: `ho-stat ${accent ? "ho-stat-accent" : ""}`, "data-testid": `stat-${id}`, children: [_jsx("span", { children: label }), _jsx("strong", { children: value })] }));
}
export function Donut({ segments, center, sub, }) {
    const stops = segments
        .map((s, i) => {
        const start = segments.slice(0, i).reduce((sum, x) => sum + x.pct, 0);
        return `${s.color} ${start}% ${start + s.pct}%`;
    })
        .join(", ");
    return (_jsx("div", { className: "ho-donut", style: { background: `conic-gradient(${stops})` }, role: "img", "aria-label": `${center} ${sub || ""}; breakdown listed alongside`, children: _jsxs("div", { children: [_jsx("strong", { children: center }), _jsx("small", { children: sub })] }) }));
}
export function BarRow({ label, pct, color, value, }) {
    const id = useId();
    return (_jsxs("div", { className: "ho-bar-row", "data-testid": `bar-${id}`, children: [_jsxs("div", { children: [_jsx("span", { children: label }), _jsx("strong", { children: value || `${pct}%` })] }), _jsx("span", { className: "ho-bar-track", children: _jsx("span", { style: { width: `${pct}%`, background: color } }) })] }));
}
export const PROJECTS = [
    { name: "Project Atlas", hours: 240, pct: 50, color: "#087bea" },
    { name: "Mobile QA", hours: 160, pct: 100 / 3, color: "#04c9f4" },
    { name: "Platform", hours: 80, pct: 100 / 6, color: "#8faac6" },
];
export function ProductNote({ children }) {
    return (_jsxs("p", { className: "ho-product-note", children: [_jsx("span", { className: "ho-note-dot" }), children || "Interactive product preview · Illustrative data", _jsx(ArrowUpRight, { size: 12, "aria-hidden": "true" })] }));
}
