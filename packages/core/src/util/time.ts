export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(iso: string, seconds: number): string {
  const base = iso ? Date.parse(iso) : Date.now();
  return new Date(base + seconds * 1000).toISOString();
}

export function isPast(iso: string): boolean {
  return Date.parse(iso) <= Date.now();
}
