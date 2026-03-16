import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.stockrai.com";

async function sbFetch(path: string, method = "GET", body?: object) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const res = await fetch(SUPABASE_URL + "/rest/v1" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  try {
    const alerts = await sbFetch("/alerts?triggered=eq.false&select=*");
    if (!Array.isArray(alerts) || alerts.length === 0) return NextResponse.json({ checked: 0 });
    const symbols: string[] = [...new Set(alerts.map((a: Record<string, string>) => a.symbol))];
    const prices: Record<string, number> = {};
    await Promise.allSettled(symbols.map(async (sym) => {
      const r = await fetch("https://finnhub.io/api/v1/quote?symbol=" + sym + "&token=" + FINNHUB_KEY);
      const d = await r.json();
      if (d.c) prices[sym] = d.c;
    }));
    let triggered = 0;
    for (const alert of alerts) {
      const cur = prices[alert.symbol];
      if (!cur) continue;
      const hit = (alert.condition === "above" && cur >= alert.target_price) || (alert.condition === "below" && cur <= alert.target_price);
      if (!hit) continue;
      await fetch(APP_URL + "/api/send-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: alert.email, symbol: alert.symbol, condition: alert.condition, targetPrice: alert.target_price, currentPrice: cur }) });
      await sbFetch("/alerts?id=eq." + alert.id, "PATCH", { triggered: true });
      triggered++;
    }
    return NextResponse.json({ checked: alerts.length, triggered });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
