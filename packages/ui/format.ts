/** Indian digit grouping: 12,40,000 rather than 1,240,000. */
export function formatIndian(value: number, decimals = false): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals ? 2 : 0);
  const [whole, fraction] = fixed.split(".");
  const last = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last}` : last;
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** An amount as it appears on screen. */
export function rupees(value: number, decimals = false): string {
  return `₹${formatIndian(value, decimals)}`;
}
