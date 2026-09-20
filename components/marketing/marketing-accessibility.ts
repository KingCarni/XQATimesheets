import type { KeyboardEvent } from "react";

/**
 * Native buttons stay tabbable; arrow / Home / End also move between the tabs
 * in a [role="tablist"]. Ported from the prototype's accessibility helper.
 */
export function handleTabNavigation(event: KeyboardEvent<HTMLElement>): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const target = event.target as HTMLElement;
  const tab = target.closest<HTMLElement>('[role="tab"]');
  const list = tab?.closest<HTMLElement>('[role="tablist"]');
  if (!tab || !list) return;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  const current = tabs.indexOf(tab);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}
