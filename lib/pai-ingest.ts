/**
 * PAI ingestion: RSS/HTML parsing, rate limiting, robots.txt best-effort.
 */

import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { extractRivers, extractFlies, makeExcerpt, sanitizeExcerpt } from "./pai-extract";

const RATE_LIMIT_MS = 60_000;
const lastFetchByDomain = new Map<string, number>();

/** Parse date from meta tags or content. */
function parsePublishedDate($: cheerio.CheerioAPI): string | null {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'time[datetime]',
  ];
  for (const sel of selectors) {
    const el = $(sel).first();
    const val = el.attr("content") ?? el.attr("datetime");
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Best-effort robots.txt check. Skips if robots.txt disallows path. */
async function isAllowedByRobots(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const robotsUrl = `${u.origin}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": "MontanaRiverIntel/1.0 (PAI aggregation)" },
    });
    if (!res.ok) return true; // No robots.txt = allow
    const text = await res.text();
    const path = u.pathname || "/";
    const lines = text.split(/\r?\n/);
    let inUserAgent = false;
    for (const line of lines) {
      const [key, ...rest] = line.split(":").map((s) => s.trim());
      const val = rest.join(":").trim();
      if (/^User-agent$/i.test(key)) {
        inUserAgent = val === "*" || /MontanaRiverIntel/i.test(val);
      } else if (inUserAgent && /^Disallow$/i.test(key) && val) {
        const pattern = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        if (new RegExp(`^${pattern}`).test(path)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/** Max 1 request per domain per minute (in-memory). */
export async function rateLimitByDomain(url: string): Promise<void> {
  const domain = getDomain(url);
  const last = lastFetchByDomain.get(domain) ?? 0;
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - last);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastFetchByDomain.set(domain, Date.now());
}

export async function rateLimitedFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  await rateLimitByDomain(url);
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": "MontanaRiverIntel/1.0 (PAI aggregation)",
      ...init?.headers,
    },
  });
}

export interface IngestResult {
  source_url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
  rivers: string[];
  flies: string[];
}

/** Ingest RSS feed; returns array of report payloads. */
export async function ingestRssSource(
  url: string,
  onFetch?: (url: string) => Promise<Response>
): Promise<{ items: IngestResult[]; errors: string[] }> {
  const fetchFn = onFetch ?? rateLimitedFetch;
  const errors: string[] = [];
  const items: IngestResult[] = [];
  const parser = new Parser();

  try {
    const res = await fetchFn(url);
    if (!res.ok) {
      errors.push(`RSS ${url}: HTTP ${res.status}`);
      return { items, errors };
    }
    const text = await res.text();
    const feed = await parser.parseString(text);
    for (const item of feed.items ?? []) {
      const link = item.link ?? item.guid ?? "";
      if (!link) continue;

      const rawContent =
        typeof item.contentSnippet === "string"
          ? item.contentSnippet
          : typeof item.content === "string"
            ? item.content.replace(/<[^>]*>/g, " ")
            : "";
      const excerpt = sanitizeExcerpt(
        [item.title ?? "", rawContent].filter(Boolean).join(" ")
      );
      const textToExtract = [item.title ?? "", excerpt, item.content ?? ""].join(
        " "
      );

      items.push({
        source_url: link,
        title: item.title ?? "Untitled",
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        excerpt: excerpt || null,
        rivers: extractRivers(textToExtract),
        flies: extractFlies(textToExtract),
      });
    }
  } catch (e) {
    errors.push(`RSS ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { items, errors };
}

/** Ingest HTML page; returns single report payload. */
export async function ingestHtmlSource(
  url: string,
  onFetch?: (url: string) => Promise<Response>
): Promise<{ item: IngestResult | null; errors: string[] }> {
  const fetchFn = onFetch ?? rateLimitedFetch;
  const errors: string[] = [];

  try {
    const allowed = await isAllowedByRobots(url);
    if (!allowed) {
      errors.push(`HTML ${url}: Disallowed by robots.txt`);
      return { item: null, errors };
    }

    const res = await fetchFn(url);
    if (!res.ok) {
      errors.push(`HTML ${url}: HTTP ${res.status}`);
      return { item: null, errors };
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $("title").first().text().trim() ||
      $("h1").first().text().trim() ||
      "Untitled";

    const excerptEl = $(
      "article p, .content p, main p, .post-content p, .entry-content p"
    ).first();
    const excerptText = excerptEl.text().trim() || $("body").text().trim();
    const excerpt = sanitizeExcerpt(excerptText.replace(/\s+/g, " "));

    const published_at = parsePublishedDate($);
    const body = $("body").text().replace(/\s+/g, " ").trim();
    const textToExtract = [title, excerpt, body].join(" ");

    const item: IngestResult = {
      source_url: url,
      title,
      published_at,
      excerpt: excerpt || null,
      rivers: extractRivers(textToExtract),
      flies: extractFlies(textToExtract),
    };
    return { item, errors };
  } catch (e) {
    errors.push(`HTML ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return { item: null, errors };
  }
}
