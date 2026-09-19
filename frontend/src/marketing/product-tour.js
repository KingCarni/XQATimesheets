"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import Image from "./preview-image";
import { ArrowRight, X } from "lucide-react";
import { TimesheetPreview } from "./timesheet-preview";
import { ApprovalsPreview } from "./approvals-preview";
import { ReportPreview } from "./report-preview";
export function ProductTour({ open, onClose, demoAction, }) {
    const dialog = useRef(null);
    const [tab, setTab] = useState(0);
    const [screens, setScreens] = useState(false);
    useEffect(() => {
        const el = dialog.current;
        if (!el)
            return;
        if (!open) {
            el.close();
            return;
        }
        const previousFocus = document.activeElement;
        el.showModal();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            el.close();
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, [open]);
    return (_jsx("dialog", { ref: dialog, className: "ho-tour-dialog", "aria-labelledby": "tour-title", onCancel: onClose, onClick: (e) => {
            if (e.target === dialog.current)
                onClose();
        }, "data-testid": "product-tour-dialog", "data-lenis-prevent": true, children: _jsxs("div", { className: "ho-tour-inner", children: [_jsxs("div", { className: "ho-tour-top", children: [_jsxs("div", { children: [_jsx("p", { children: "HourOps / Product walkthrough" }), _jsx("h2", { id: "tour-title", "data-testid": "tour-title", children: "Follow the hours." })] }), _jsx("button", { className: "ho-icon-button", onClick: onClose, "aria-label": "Close product walkthrough", "data-testid": "close-tour", children: _jsx(X, { size: 22 }) })] }), _jsx("p", { className: "ho-tour-description", children: "Explore the employee-to-payroll handoff with illustrative data. Nothing here changes your company\u2019s workspace." }), _jsx("div", { className: "ho-tour-tabs", role: "tablist", "aria-label": "Product walkthrough", children: ["01 · Log & submit", "02 · Review & approve", "03 · Report & export"].map((label, i) => (_jsx("button", { role: "tab", id: `tour-tab-${i}`, "aria-controls": "tour-panel", "aria-selected": !screens && tab === i, className: !screens && tab === i ? "is-selected" : "", onClick: () => {
                            setTab(i);
                            setScreens(false);
                        }, "data-testid": `tour-step-${i}`, children: label }, label))) }), _jsx("div", { className: "ho-tour-content", role: screens ? "region" : "tabpanel", id: "tour-panel", "aria-labelledby": screens ? "actual-screens-title" : `tour-tab-${tab}`, tabIndex: 0, children: screens ? (_jsxs("div", { className: "ho-actual-screens", children: [_jsx("h3", { id: "actual-screens-title", "data-testid": "actual-screens-title", children: "Inside the actual product" }), _jsx("p", { children: "Original HourOps application views. Marketing previews above simplify these workflows for readability." }), _jsxs("figure", { children: [_jsx(Image, { src: "/marketing/timesheet-product.png", alt: "Actual HourOps timesheet showing days of the week, total hours, and an approved week", width: 1735, height: 598 }), _jsx("figcaption", { children: "My Timesheet \u00B7 approved week" })] }), _jsxs("figure", { children: [_jsx(Image, { src: "/marketing/reports-product.png", alt: "Actual HourOps report with total and billable hours, work-type distribution, and employee breakdowns", width: 1351, height: 1288 }), _jsx("figcaption", { children: "Reports \u00B7 work types, billable hours, and employees" })] })] })) : tab === 0 ? (_jsx(TimesheetPreview, { compact: true })) : tab === 1 ? (_jsx(ApprovalsPreview, {})) : (_jsx(ReportPreview, {})) }), _jsxs("div", { className: "ho-tour-bottom", children: [_jsxs("button", { onClick: () => setScreens(!screens), className: "ho-text-button", "data-testid": "tour-actual-screens", children: [screens ? "Back to interactive preview" : "See actual product screens", _jsx(ArrowRight, { size: 14 })] }), demoAction && (_jsx("form", { action: demoAction, children: _jsxs("button", { className: "ho-button ho-button-small", type: "submit", "data-testid": "live-demo-submit", children: ["Try the live workspace ", _jsx(ArrowRight, { size: 14 })] }) }))] })] }) }));
}
