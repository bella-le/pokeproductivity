// ─── Shared color utility ─────────────────────────────────────────────────────
// Parses a CSS hex color and computes perceived luminance + foreground polarity.
// Returns { r, g, b, luminance, fg } where fg is 0 (black) on light backgrounds
// and 255 (white) on dark ones — ready to feed into CSS vars --pr/--pg/--pb/--fg.

export function hexToRgbLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const fg = luminance > 0.4 ? 0 : 255
  return { r, g, b, luminance, fg }
}
