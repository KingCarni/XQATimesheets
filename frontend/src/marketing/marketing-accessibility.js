/** Native buttons stay tabbable; arrow/Home/End keys also navigate each tab group. */
export function handleTabNavigation(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
    const tab = event.target.closest('[role="tab"]');
    const list = tab?.closest('[role="tablist"]');
    if (!tab || !list)
        return;
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const current = tabs.indexOf(tab);
    const next = event.key === "Home"
        ? 0
        : event.key === "End"
            ? tabs.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
}
