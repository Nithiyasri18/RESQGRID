export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return 'Not measured';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'Not measured';
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${mins}m ${rem}s`;
}

export function formatRuntimeMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'Not measured';
  return `${ms.toFixed(3)} ms`;
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function parseCapabilities(jsonStr: string | undefined): string[] {
  if (!jsonStr) return [];
  try {
    const arr = JSON.parse(jsonStr);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export const CAPABILITY_LABELS: Record<string, string> = {
  boat_water: 'Boat / Flood Water',
  medical: 'Medical Triage',
  heavy_rescue: 'Heavy Engineering',
  multi_hazard: 'Multi-Hazard',
  general_rescue: 'General Rescue',
  first_aid: 'First Aid',
  logistics: 'Relief Logistics',
};
