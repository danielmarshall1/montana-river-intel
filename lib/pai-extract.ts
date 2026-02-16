/**
 * PAI extraction: rivers, flies, and excerpt generation.
 * Only excerpts are stored; full content is never persisted.
 */

import { MONTANA_RIVERS, FLY_PATTERNS, FLY_SIZE_REGEX } from "./pai-dictionaries";

/** Maximum stored excerpt length (enforced in DB and ingest). */
export const MAX_EXCERPT_LENGTH = 500;

/** Strip HTML tags from text. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Extract Montana river mentions (case-insensitive, canonical names). */
export function extractRivers(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const river of MONTANA_RIVERS) {
    if (lower.includes(river.toLowerCase())) {
      found.add(river);
    }
  }
  return Array.from(found);
}

/** Extract fly names from dictionary + regex (e.g. /#\d{1,2}/) + common variants. */
export function extractFlies(text: string): string[] {
  const found = new Set<string>();
  for (const fly of FLY_PATTERNS) {
    const re = new RegExp(`\\b${fly.replace(/\s/g, "\\s")}\\b`, "gi");
    if (re.test(text)) found.add(fly);
  }
  const sizeMatches = text.match(FLY_SIZE_REGEX);
  if (sizeMatches) {
    sizeMatches.forEach((m) => found.add(m));
  }
  return Array.from(found);
}

/** Make excerpt from raw text, capped at maxLen. */
export function makeExcerpt(text: string, maxLen = 300): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.7) {
    return cut.slice(0, lastSpace) + "…";
  }
  return cut + "…";
}

/** Sanitize and cap text for safe excerpt-only storage (strips HTML, enforces max length). */
export function sanitizeExcerpt(text: string | null | undefined, maxLen = MAX_EXCERPT_LENGTH): string | null {
  if (text == null || typeof text !== "string") return null;
  const stripped = stripHtml(text);
  if (!stripped) return null;
  return makeExcerpt(stripped, maxLen) || null;
}
