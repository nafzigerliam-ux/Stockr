import { NextRequest, NextResponse } from "next/server";

const KEY = process.env.ALPHAVANTAGE_KEY;

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "no_key" }, { status: 200 });
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "general";
  let url = "https://www.alphavantage.co/query?function=NEWS_SENTIMENT&limit=8";
  if (category === "general") url += `&topics=financial_markets&apikey=${KEY}`;
  else if (category === "forex") url += `&topics=forex&apikey=${KEY}`;
  else url += `&tickers=${category}&apikey=${KEY}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}
