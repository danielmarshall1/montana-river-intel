export type WaypointColor = "green" | "red" | "blue" | "yellow";

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  note: string;
  color: WaypointColor;
  created_at: string;
}

const STORAGE_KEY = "mri_waypoints";

export const WAYPOINT_COLORS: Record<WaypointColor, string> = {
  green: "#16a34a",
  red: "#dc2626",
  blue: "#2563eb",
  yellow: "#d4900a",
};

export function loadWaypoints(): Waypoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Waypoint[];
  } catch {
    return [];
  }
}

export function saveWaypoints(waypoints: Waypoint[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(waypoints));
  } catch {
    /* ignore quota errors */
  }
}

export function addWaypoint(
  waypoints: Waypoint[],
  partial: Omit<Waypoint, "id" | "created_at">
): Waypoint[] {
  const newWp: Waypoint = {
    ...partial,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  return [...waypoints, newWp];
}

export function removeWaypoint(waypoints: Waypoint[], id: string): Waypoint[] {
  return waypoints.filter((w) => w.id !== id);
}
