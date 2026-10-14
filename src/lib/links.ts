// Universal links that open the Google Maps app when it is installed and the website otherwise.

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function directionsUrl(origin: string, destination: string, mode: 'driving' | 'transit' = 'driving'): string {
  const params = [`destination=${encodeURIComponent(destination)}`, `travelmode=${mode}`];
  if (origin) params.unshift(`origin=${encodeURIComponent(origin)}`);
  return `https://www.google.com/maps/dir/?api=1&${params.join('&')}`;
}

export function flightStatusUrl(airline: string, flightNumber: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${airline} ${flightNumber} flight status`.trim())}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Accepts a full share link or a bare trip code and returns the code. */
export function slugFromInput(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = /\/trip\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9_-]{6,}$/.test(trimmed) ? trimmed : null;
}
