/**
 * Fallback focus points when river geometry is not available.
 * Approximate center points for Montana rivers (lon, lat).
 */
export const RIVER_FOCUS_POINTS: Record<string, [number, number]> = {
  "1": [-111.07, 44.66], // Madison West Yellowstone
  "2": [-110.57, 45.60], // Yellowstone Livingston
  "3": [-112.70, 45.53], // Big Hole Melrose
  "4": [-114.05, 46.83], // Bitterroot Missoula
  "5": [-115.09, 47.30], // Clark Fork St Regis
  "6": [-114.18, 48.36], // Flathead Columbia Falls
  "7": [-111.08, 48.31], // Marias Chester
  "8": [-111.42, 46.15], // Missouri Toston
  "9": [-111.27, 45.50], // Gallatin Gateway
  "10": [-111.60, 45.90], // Jefferson Three Forks
  "11": [-110.79, 45.11], // Yellowstone Corwin Springs
  "12": [-113.68, 46.72], // Rock Creek Clinton
  "13": [-114.13, 48.50], // NF Flathead
  "14": [-115.55, 48.40], // Kootenai Libby
  "15": [-115.32, 48.40], // Kootenai Below Libby Dam
  "16": [-107.75, 45.46], // Bighorn St Xavier
  "17": [-113.76, 46.90], // Blackfoot Bonner
};
