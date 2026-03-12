import { NextRequest, NextResponse } from "next/server";

const BASE = "https://finnhub.io/api/v1";
const KEY  = process.env.FINNHUB_KEY;

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "Finnhub key not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint"); // quote | candle | search | news | company-news
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  let url = "";

  if (endpoint === "quote") {
    const symbol = searchParams.get("symbol");
    url = `${BASE}/quote?symbol=${symbol}&token=${KEY}`;

  } else if (endpoint === "candle") {
    const symbol     = searchParams.get("symbol");
    const resolution = searchParams.get("resolution") || "D";
    const from       = searchParams.get("from");
    const to         = searchParams.get("to");
    url = `${BASE}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${KEY}`;

  } else if (endpoint === "search") {
    const q = searchParams.get("q");
    url = `${BASE}/search?q=${encodeURIComponent(q!)}&token=${KEY}`;

  } else if (endpoint === "news") {
    const category = searchParams.get("category") || "general";
    url = `${BASE}/news?category=${category}&token=${KEY}`;

  } else if (endpoint === "company-news") {
    const symbol = searchParams.get("symbol");
    const from   = searchParams.get("from");
    const to     = searchParams.get("to");
    url = `${BASE}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${KEY}`;

  } else {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 400 });
  }

  try {
    const r = await fetch(url);
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}
