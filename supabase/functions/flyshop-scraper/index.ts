import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

type FlyShopSource = {
  id: string;
  shop_name: string;
  river_id: string | null;
  report_url: string;
};

type ExtractedReport = {
  report_date: string | null;
  overall_conditions: "excellent" | "good" | "fair" | "poor" | "unfishable" | null;
  water_clarity: "clear" | "slightly_off" | "off_color" | "blown" | null;
  primary_hatch: string | null;
  salmonfly_status: "not_started" | "pre_hatch" | "starting" | "peak" | "trailing" | "done" | "not_applicable" | null;
  salmonfly_section: string | null;
  recommended_flies: string[] | null;
  tactical_notes: string | null;
  confidence_score: number | null;
};

/** Strip HTML tags and collapse whitespace, keeping meaningful text. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(?:h[1-6]|div|section|article|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Truncate text to a token-safe length for Claude. */
function truncate(text: string, maxChars = 6000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[truncated]";
}

async function fetchReportText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Montana River Intelligence / fishing report aggregator (contact: info@montanariverintelligence.com)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  const html = await resp.text();
  return stripHtml(html);
}

async function extractWithClaude(text: string): Promise<ExtractedReport> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are extracting structured fishing report data from a Montana fly shop website. " +
        "Extract only factual information present in the text. Return JSON only, no markdown, no explanation.",
      messages: [
        {
          role: "user",
          content:
            `Extract fishing report data from this text. Return a JSON object with these fields:\n` +
            `- report_date: ISO date string if mentioned, else null\n` +
            `- overall_conditions: one of 'excellent', 'good', 'fair', 'poor', 'unfishable'\n` +
            `- water_clarity: one of 'clear', 'slightly_off', 'off_color', 'blown'\n` +
            `- primary_hatch: the main insect hatch mentioned (e.g. 'BWO', 'Salmonfly', 'Caddis', 'Midges'), or null\n` +
            `- salmonfly_status: one of 'not_started', 'pre_hatch', 'starting', 'peak', 'trailing', 'done', 'not_applicable' — use 'not_applicable' if no salmonfly mention\n` +
            `- salmonfly_section: specific river section where salmonfly hatch is occurring, or null\n` +
            `- recommended_flies: array of fly pattern names mentioned (empty array if none)\n` +
            `- tactical_notes: 1-2 sentence summary of key fishing tactics, or null\n` +
            `- confidence_score: 0.0-1.0 based on how current and specific the report is\n\n` +
            `Text:\n${truncate(text)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const rawContent = data?.content?.[0]?.text ?? "{}";

  // Claude may wrap JSON in a code block — strip it
  const jsonStr = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(jsonStr) as ExtractedReport;
}

serve(async (_req) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: sources, error: srcErr } = await sb
    .from("fly_shop_sources")
    .select("id,shop_name,river_id,report_url")
    .eq("is_active", true);

  if (srcErr) {
    return new Response(JSON.stringify({ error: srcErr.message }), { status: 500 });
  }

  const results: Array<{ source_id: string; shop_name: string; status: "ok" | "error"; detail?: string }> = [];

  for (const source of (sources ?? []) as FlyShopSource[]) {
    const now = new Date().toISOString();
    try {
      const text = await fetchReportText(source.report_url);
      const extracted = await extractWithClaude(text);

      await sb.from("fly_shop_reports").insert({
        source_id: source.id,
        river_id: source.river_id,
        scraped_at: now,
        report_date: extracted.report_date ?? null,
        raw_text: text.slice(0, 10_000), // store first 10k chars
        overall_conditions: extracted.overall_conditions ?? null,
        water_clarity: extracted.water_clarity ?? null,
        primary_hatch: extracted.primary_hatch ?? null,
        salmonfly_status: extracted.salmonfly_status ?? null,
        salmonfly_section: extracted.salmonfly_section ?? null,
        recommended_flies: extracted.recommended_flies ?? [],
        tactical_notes: extracted.tactical_notes ?? null,
        confidence_score: extracted.confidence_score ?? null,
      });

      await sb.from("fly_shop_sources").update({
        last_scraped_at: now,
        last_successful_scrape_at: now,
        scrape_error: null,
      }).eq("id", source.id);

      results.push({ source_id: source.id, shop_name: source.shop_name, status: "ok" });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await sb.from("fly_shop_sources").update({
        last_scraped_at: now,
        scrape_error: detail,
      }).eq("id", source.id);
      results.push({ source_id: source.id, shop_name: source.shop_name, status: "error", detail });
    }
  }

  return new Response(JSON.stringify({ scraped: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
