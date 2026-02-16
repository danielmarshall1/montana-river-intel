/**
 * Montana river names for dictionary matching in PAI reports.
 * Canonical names used for extraction and display.
 */
export const MONTANA_RIVERS = [
  "Madison",
  "Yellowstone",
  "Big Hole",
  "Bitterroot",
  "Clark Fork",
  "Flathead",
  "Gallatin",
  "Jefferson",
  "Missouri",
  "Blackfoot",
  "Rock Creek",
  "Marias",
  "Bighorn",
  "Kootenai",
  "North Fork Flathead",
  "Smith",
  "Sun",
  "Dearborn",
  "Stillwater",
  "Boulder",
  "Beaverhead",
  "Ruby",
  "Shields",
  "Teton",
];

/**
 * Common fly names and patterns for extraction.
 * Includes regex-friendly terms for sizes (#18, #20, etc.)
 */
export const FLY_PATTERNS = [
  "PMD",
  "BWO",
  "Caddis",
  "Stonefly",
  "Chubby",
  "Salmon Fly",
  "Golden Stone",
  "Terrestrial",
  "Ant",
  "Hopper",
  "Grasshopper",
  "Pale Morning Dun",
  "Blue Winged Olive",
  "Adams",
  "Royal Wulff",
  "Stimulator",
  "Parachute Adams",
  "Hare's Ear",
  "Prince Nymph",
  "Copper John",
  "Zebra Midge",
  "San Juan",
  "Wooley Bugger",
  "Streamer",
  "Nymph",
  "Dry Fly",
  "Emerger",
  "Spinner",
  "Rusty Spinner",
  "Sowbug",
  "Scud",
  "Midges",
  "Midge",
  "Trico",
  "Caddisfly",
  "Skwala",
  "Skwala Stone",
  "Bacon and Eggs",
  "Pats Rubber Legs",
  "CDC",
  "Euro",
  "Perdigon",
  "Frenchie",
  "Jig",
];

/** Regex for fly sizes (#18, #20, etc.) */
export const FLY_SIZE_REGEX = /#\d{1,2}\b/gi;
