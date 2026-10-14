// Names on a trip: matching, initials and a steady colour per person for avatars.

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Mid-tone colours that read with white text in both light and dark themes.
const COLORS = ['#2F6FDB', '#C95A22', '#7C4DCC', '#0F8584', '#C03A67', '#2E7D4F', '#A86B12', '#4B53BC'];

export function personColor(name: string): string {
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}
