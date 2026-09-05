/**
 * The last beat presses the controls the presenter would press.
 *
 * The Records tab and the export button on the truth panel are the product's
 * own, so the file that lands is the product's own export, not a demo copy of
 * one.
 */
export function showEvidenceAndExport(delayMs: number): void {
  const panel = document.querySelector("[data-truth-panel]");
  if (!panel) return;

  panel.querySelector<HTMLButtonElement>('[role="tab"][data-tab="Records"]')?.click();
  window.setTimeout(() => {
    panel.querySelector<HTMLButtonElement>("[data-export-csv]")?.click();
  }, delayMs);
}
