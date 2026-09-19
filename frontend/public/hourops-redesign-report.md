# HourOps — landing-page redesign

## Scope and branch

- Canonical source: `/app/hourops`, cloned from `KingCarni/XQATimesheets` at `e728324f9c85e4b85a1dea86c08264340aa1c668`.
- Local working branch: `feature/landing-page-redesign`.
- No remote push or commit was performed. Neither `main` nor `integration/current-mvp` was modified.
- Only public marketing presentation, its dependencies, and this document change in the original repository.

## Design decisions

**The operating line.** The visual idea is time moving through a company: employee → manager → operations. A connected three-stage product composition replaces the centered hero and generic floating dashboard. The five-step interactive workflow extends that story below the fold.

**Brand-derived, not rebranded.** Original HourOps icon, favicon, deep navy `#061b35`, midnight `#082544`, blue `#087bea`, and cyan `#04c9f4` remain the foundation. Slightly darker text/action variants improve contrast. No existing global tokens or authenticated styles change.

**Seven editorial chapters.** A full-width timesheet surface, navy approval queue, substantial reporting surface, employee-context record, vertical spreadsheet-import sequence, and selectable company workspaces vary the page rhythm. Thin rules, numbered chapters, square-edged surfaces, and compact status treatments replace repeated feature cards.

**Product, not decorative analytics.** HTML/CSS product surfaces use explicit illustrative datasets. Timesheets show 5 × 8h = 40h. Approval counts distinguish 12 submitted (9 ready + 3 needing attention) from 2 additional open weeks. Report project totals are 240 + 160 + 80 = 480 worked hours; 16 PTO hours are separately labeled. CSV download exports the visible illustrative project totals. Original supplied product screenshots are also available inside the walkthrough.

**Purposeful motion.** Framer Motion supplies masked line-by-line hero entrance, one-time section reveals, and a restrained hero scroll drift. Lenis provides desktop momentum scrolling and is cleaned up when the marketing page unmounts. One slow editorial marquee includes pause/resume. Reduced-motion preferences disable animation and smooth scrolling. Mobile avoids momentum scrolling and uses a naturally flowing product composition.

**Typography.** Space Grotesk provides display hierarchy, DM Sans handles body/product content, and IBM Plex Mono is reserved for time markers and operational annotations. Fonts are loaded through a marketing-only stylesheet; authenticated pages retain their existing typography.

**Credibility without invented proof.** No customer claims, testimonials, review scores, security certifications, or adoption statistics were added. Company brands are explicitly labeled as examples, not endorsements. Payroll copy clearly says reports, not payroll processing.

## Working interactions

- Product walkthrough modal with three interactive stages and original product screenshots.
- Five connected workflow tabs and contextual section links.
- Weekday selection, sample weekly submission, and reset.
- Approval filtering, employee details, expand/collapse, sample bulk approval, and reset.
- Project report drill-down/back, work-type tabs, actual sample CSV download.
- Illustrative import review/reset; no actual upload or record creation.
- Three selectable private company-workspace identities.
- Responsive mobile menu, anchor navigation, marquee pause/resume.
- Native dialog focus containment/Escape, visible focus states, skip link, arrow/Home/End tab-group navigation, live feedback, and reduced-motion support.

## Preserved application behavior

`app/page.tsx` retains the original `getCurrentUser`, tenant resolution, tenant redirects, and authenticated-user redirects. Company creation still links to `/signup`; sign-in links to `/login`. The original `enterDemoAction` is passed to the live-workspace form in the walkthrough. No authentication, onboarding, API, Prisma schema, tenant logic, or authenticated application page was edited.

## Validation

- **Original Next.js:** `yarn typecheck` passed; `yarn lint` passed; `yarn build` passed, including TypeScript, page-data collection, and generation of 19 static pages.
- **Isolated marketing preview:** production build passed.
- **Browser testing:** 1920, 1440, 1024, 768, 390, and 320px widths. No horizontal overflow detected. Interactive flows, mobile menu, modal, focus restoration, CSV state, and reduced motion exercised.
- **Readability follow-up:** increased small mobile text and touch targets; mobile approval rows rearrange instead of squeezing the desktop table.
- **Accessibility:** axe-core WCAG 2 A/AA and 2.1 AA checks returned zero violations after all sections were revealed; also zero in both alternate company brands and all three modal stages. This is an automated audit, not a claim of complete accessibility certification.
- **Scope guard:** diff for authenticated pages, auth/onboarding routes, `auth.ts`, `lib`, Prisma schema, `proxy.ts`, root layout, and global CSS is empty.
- Prisma client generation was performed using a schema-only verification config, without database URLs, database connections, migrations, or credentials.
- Existing npm lock was extended only with the exact four motion packages resolved by Yarn; other locked packages remain unchanged. A Yarn lock is also supplied.

## Exact original-repository file changes

### Modified

1. `app/page.tsx`
2. `components/marketing/marketing-header.tsx`
3. `components/marketing/marketing-ui.tsx`
4. `package.json`
5. `package-lock.json`

### Added

1. `components/marketing/landing-page.tsx`
2. `components/marketing/landing.css`
3. `components/marketing/marketing-motion.tsx`
4. `components/marketing/marketing-accessibility.tsx`
5. `components/marketing/hero-product.tsx`
6. `components/marketing/workflow.tsx`
7. `components/marketing/timesheet-preview.tsx`
8. `components/marketing/approvals-preview.tsx`
9. `components/marketing/report-preview.tsx`
10. `components/marketing/operations-sections.tsx`
11. `components/marketing/product-tour.tsx`
12. `public/marketing/timesheet-product.png`
13. `public/marketing/reports-product.png`
14. `yarn.lock`
15. `docs/landing-page-redesign.md`

## Preview-only support files (not changes to the original repository)

The initial workspace contained a CRA starter rather than the Next.js repository. `/app/frontend` therefore runs an isolated preview generated directly from the canonical marketing components. Next link/image adapters are used only here.

- `/app/frontend/src/App.js`, `App.css`, `public/index.html`, package manifest/lock.
- `/app/frontend/eslint.config.mjs`, `/app/eslint.config.mjs`: explicit ESLint 9 configurations for the modified preview code; canonical Next.js lint uses its unchanged existing configuration.
- `/app/frontend/src/marketing/*`: generated previews and two preview adapters.
- `/app/frontend/public/*`: copied original logo, supplied screenshots, and handoff downloads.
- `/app/scripts/sync-marketing-preview.cjs`: regenerates the preview from canonical source.
- `/app/scripts/sync-marketing-npm-lock.cjs`: narrowly synchronizes new dependency lock entries.
- `/app/scripts/export-redesign.cjs`: creates an original-repository patch without staging or pushing.
- `/app/test_reports/*`, `/app/memory/*`: verification and handoff records.

## Remaining limitations / next steps

- No known blocking visual or landing interaction issue remains after the final checks.
- This preview does not run the original sign-in, signup, or live-demo backend. Those routes/actions remain intact in the original source; their runtime behavior was not exercised without the original environment. Preview CTA routes clearly explain that boundary.
- The browser checks used Chromium. A Safari/iOS real-device pass is a useful next verification step.
- Google Fonts requires network access; local font hosting is a possible performance/privacy follow-up.
- A useful next product improvement: measure walkthrough completion and company-creation conversion with consent-aware analytics rather than adding unsubstantiated social proof.

The supplied patch is generated against the repository revision above and was checked against a clean copy of that revision. It contains no application secrets or environment configuration.