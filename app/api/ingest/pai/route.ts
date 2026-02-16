/**
 * PAI ingestion API. Uses service role key on server only.
 * POST /api/ingest/pai
 */

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { ingestRssSource, ingestHtmlSource } from "@/lib/pai-ingest";
import { sanitizeExcerpt } from "@/lib/pai-extract";

interface PAIReportRow {
  shop_name: string;
  source_url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
  rivers: string[] | null;
  flies: string[] | null;
  summary: string | null;
}

function toRow(
  shopName: string,
  item: {
    source_url: string;
    title: string;
    published_at: string | null;
    excerpt: string | null;
    rivers: string[];
    flies: string[];
  }
): PAIReportRow {
  return {
    shop_name: shopName,
    source_url: item.source_url,
    title: item.title,
    published_at: item.published_at,
    excerpt: sanitizeExcerpt(item.excerpt ?? ""),
    rivers: item.rivers.length ? item.rivers : null,
    flies: item.flies.length ? item.flies : null,
    summary: null,
  };
}

export async function POST() {
  const supabase = createSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured (SUPABASE_SERVICE_ROLE_KEY required)" },
      { status: 500 }
    );
  }

  const { data: sources, error: srcErr } = await supabase
    .from("pai_sources")
    .select("shop_name, source_type, url")
    .eq("active", true);

  if (srcErr) {
    return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }

  const list = (sources ?? []) as {
    shop_name: string;
    source_type: string;
    url: string;
  }[];

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const sourceResults: { url: string; inserted: number; skipped: number; errors: string[] }[] = [];

  for (const s of list) {
    let srcInserted = 0;
    let srcSkipped = 0;
    const srcErrors: string[] = [];

    if (s.source_type === "rss") {
      const { items, errors: errs } = await ingestRssSource(s.url);
      srcErrors.push(...errs);

      for (const item of items) {
        const row = toRow(s.shop_name, item);
        const { data: existing } = await supabase
          .from("pai_reports")
          .select("id, title, excerpt")
          .eq("source_url", row.source_url)
          .single();

        if (existing) {
          const same =
            existing.title === row.title &&
            (existing.excerpt ?? null) === (row.excerpt ?? null);
          if (same) {
            srcSkipped++;
            continue;
          }
        }

        const { error } = await supabase
          .from("pai_reports")
          .upsert(row, { onConflict: "source_url" });

        if (error) {
          srcErrors.push(`Upsert ${row.source_url}: ${error.message}`);
        } else {
          srcInserted++;
        }
      }
    } else if (s.source_type === "html") {
      const { item, errors: errs } = await ingestHtmlSource(s.url);
      srcErrors.push(...errs);

      if (item) {
        const row = toRow(s.shop_name, item);
        const { data: existing } = await supabase
          .from("pai_reports")
          .select("id, title, excerpt")
          .eq("source_url", row.source_url)
          .single();

        if (existing) {
          const same =
            existing.title === row.title &&
            (existing.excerpt ?? null) === (row.excerpt ?? null);
          if (same) {
            srcSkipped++;
          } else {
            const { error } = await supabase
              .from("pai_reports")
              .upsert(row, { onConflict: "source_url" });
            if (error) {
              srcErrors.push(`Upsert ${row.source_url}: ${error.message}`);
            } else {
              srcInserted++;
            }
          }
        } else {
          const { error } = await supabase
            .from("pai_reports")
            .upsert(row, { onConflict: "source_url" });
          if (error) {
            srcErrors.push(`Upsert ${row.source_url}: ${error.message}`);
          } else {
            srcInserted++;
          }
        }
      }
    }

    inserted += srcInserted;
    skipped += srcSkipped;
    errors.push(...srcErrors);
    sourceResults.push({
      url: s.url,
      inserted: srcInserted,
      skipped: srcSkipped,
      errors: srcErrors,
    });
  }

  return NextResponse.json({
    ok: true,
    sources: list.length,
    inserted,
    skipped,
    errors: errors.length ? errors : undefined,
    bySource: sourceResults,
  });
}
