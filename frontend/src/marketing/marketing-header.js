"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import Image from "./preview-image";
import Link from "./preview-link";
import { ArrowUpRight, Menu, X } from "lucide-react";
const LINKS = [
    ["#product", "The product"],
    ["#how", "How it works"],
    ["#reporting", "Reporting"],
    ["#workspaces", "Your workspace"],
];
export function Brand({ footer = false }) {
    return (_jsxs(Link, { href: "/", className: "ho-brand", "aria-label": "HourOps home", "data-testid": footer ? "footer-home-link" : "header-home-link", children: [_jsx(Image, { src: "/hourops-icon.png", width: 38, height: 38, alt: "", priority: !footer }), _jsxs("span", { children: ["Hour", _jsx("span", { children: "Ops" }), _jsx("span", { className: "ho-brand-period", children: "." })] })] }));
}
export function MarketingHeader() {
    const [open, setOpen] = useState(false);
    const toggle = useRef(null);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && open) {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        const mq = window.matchMedia("(min-width: 1024px)");
        const onResize = () => {
            if (mq.matches)
                setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        mq.addEventListener("change", onResize);
        return () => {
            window.removeEventListener("keydown", onKey);
            mq.removeEventListener("change", onResize);
        };
    }, [open]);
    return (_jsxs("header", { className: "ho-header", children: [_jsxs("nav", { className: "ho-container ho-nav", "aria-label": "Main navigation", children: [_jsx(Brand, {}), _jsx("div", { className: "ho-desktop-links", children: LINKS.map(([href, label]) => (_jsx("a", { href: href, "data-testid": `nav-${href.slice(1)}`, children: label }, href))) }), _jsxs("div", { className: "ho-nav-actions", children: [_jsx(Link, { href: "/login", "data-testid": "header-sign-in", children: "Sign in" }), _jsxs(Link, { href: "/signup", className: "ho-button ho-button-small", "data-testid": "header-create-company", children: ["Create your company ", _jsx(ArrowUpRight, { size: 15 })] })] }), _jsx("button", { ref: toggle, className: "ho-menu-toggle", onClick: () => setOpen(!open), "aria-label": open ? "Close menu" : "Open menu", "aria-expanded": open, "aria-controls": "ho-mobile-menu", "data-testid": "mobile-menu-toggle", children: open ? _jsx(X, {}) : _jsx(Menu, {}) })] }), open && (_jsxs("nav", { id: "ho-mobile-menu", className: "ho-mobile-menu", "aria-label": "Mobile navigation", "data-testid": "mobile-menu", children: [LINKS.map(([href, label]) => (_jsxs("a", { href: href, onClick: () => setOpen(false), "data-testid": `mobile-nav-${href.slice(1)}`, children: [label, _jsx(ArrowUpRight, { size: 16 })] }, href))), _jsx(Link, { href: "/login", "data-testid": "mobile-sign-in", children: "Sign in" }), _jsxs(Link, { href: "/signup", className: "ho-button", "data-testid": "mobile-create-company", children: ["Create your company ", _jsx(ArrowUpRight, { size: 16 })] })] }))] }));
}
