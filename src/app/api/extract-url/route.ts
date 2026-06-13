import { NextRequest, NextResponse } from "next/server";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export const runtime = "nodejs";
export const maxDuration = 30;

const FETCH_TIMEOUT_MS = 15000;

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawUrl = (body.url ?? "").trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Please provide a URL." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are supported." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ClaudeReaderBot/1.0; +https://example.com) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `The page responded with status ${response.status}. It may be unavailable or blocked.` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return NextResponse.json(
        { error: "This URL doesn't point to a readable web page (unsupported content type)." },
        { status: 415 }
      );
    }

    const html = await response.text();
    const { document } = parseHTML(html);

    // Strip obviously noisy elements before Readability runs
    document
      .querySelectorAll("script, style, noscript, iframe, nav, footer, header, form")
      .forEach((el) => el.remove());

    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            "We couldn't extract readable article content from this page. Try copying and pasting the text manually.",
        },
        { status: 422 }
      );
    }

    const text = cleanExtractedText(article.textContent);

    return NextResponse.json({
      text,
      title: article.title ?? null,
      siteName: article.siteName ?? null,
      url: url.toString(),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "The request timed out while fetching this page." },
        { status: 504 }
      );
    }
    console.error("extract-url error", err);
    return NextResponse.json(
      { error: "We couldn't fetch this URL. It may be unreachable, offline, or blocking automated requests." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function cleanExtractedText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
