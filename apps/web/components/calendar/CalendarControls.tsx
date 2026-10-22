"use client";

import { useEffect } from "react";

/**
 * Wires up the server-rendered calendar: feed checkboxes toggle
 * `data-hide` on the root (CSS hides those events) and the month
 * dropdown switches the visible month. No re-render, no data fetch.
 */
export function CalendarControls({ id }: { id: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-cal="${id}"]`);
    if (!root) return;
    const legend = root.querySelector<HTMLElement>(`[data-cal-legend="${id}"]`);
    const select = root.querySelector<HTMLSelectElement>(`[data-cal-month="${id}"]`);
    const title = root.querySelector<HTMLElement>(`[data-cal-title="${id}"]`);

    const onLegend = (e?: Event) => {
      const all = legend?.querySelector<HTMLInputElement>("input.cal-all");
      const boxes = legend ? Array.from(legend.querySelectorAll<HTMLInputElement>("input[type=checkbox]:not(.cal-all)")) : [];
      if (all && e?.target === all) for (const b of boxes) b.checked = all.checked;
      if (all) all.checked = boxes.every((b) => b.checked);
      root.dataset.hide = boxes.filter((b) => !b.checked).map((b) => b.value).join(" ");
    };
    const onMonth = () => {
      if (!select) return;
      for (const s of root.querySelectorAll<HTMLElement>("[data-month]")) s.hidden = s.dataset.month !== select.value;
      if (title) title.textContent = select.selectedOptions[0]?.textContent ?? "";
    };
    legend?.addEventListener("change", onLegend);
    select?.addEventListener("change", onMonth);
    // Restore state after back/forward cache or a hydration race.
    onLegend();
    onMonth();
    return () => {
      legend?.removeEventListener("change", onLegend);
      select?.removeEventListener("change", onMonth);
    };
  }, [id]);
  return null;
}
