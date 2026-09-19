"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Lenis from "lenis";
export function SmoothScroll() {
    const reduce = useReducedMotion();
    useEffect(() => {
        if (reduce || !window.matchMedia("(pointer: fine)").matches)
            return;
        const previous = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = "auto";
        const lenis = new Lenis({
            duration: 1.05,
            smoothWheel: true,
            anchors: { offset: -90 },
            autoRaf: true,
        });
        return () => {
            lenis.destroy();
            document.documentElement.style.scrollBehavior = previous;
        };
    }, [reduce]);
    return null;
}
export function Reveal({ children, className = "", delay = 0, }) {
    const reduce = useReducedMotion();
    return (_jsx(motion.div, { className: className, initial: reduce ? false : { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.12 }, transition: { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }, children: children }));
}
export function MaskedHeadline() {
    const reduce = useReducedMotion();
    return (_jsx("h1", { "data-testid": "hero-title", className: "ho-hero-title", children: ["Operations", "shouldn’t live in", "a spreadsheet."].map((line, i) => (_jsx("span", { className: "ho-line-mask", children: _jsx(motion.span, { className: i === 2 ? "ho-headline-accent" : "", initial: reduce ? false : { y: "110%", opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { duration: 0.85, delay: 0.12 + i * 0.11, ease: [0.22, 1, 0.36, 1] }, children: line }) }, line))) }));
}
export function Chapter({ number, children, dark = false, }) {
    return (_jsxs("p", { className: `ho-chapter ${dark ? "ho-chapter-dark" : ""}`, children: [_jsx("span", { children: number }), children, _jsx("span", { className: "ho-chapter-rule" })] }));
}
