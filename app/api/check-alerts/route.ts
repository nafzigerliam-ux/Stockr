import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.stockrai.com";

async function supabaseRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  return res.json();
}

export async function GET(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const alerts = await supabaseRequest("/alerts?triggered=eq.false&select=*");
    if (!alerts || !Array.isArray(alerts) || alerts.length === 0) return NextResponse.json({ checked: 0 });

    const symbols: string[] = [...new Set(alerts.map((a: any) => a.symbol as string))];

    const prices: Record<string, number> = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
        const data = await r.json();
        if (data.c) prices[sym] = data.c;
      })
    );

    let triggered = 0;
    for (const alert of alerts) {
      const currentPrice = prices[alert.symbol];
      if (!currentPrice) continue;
      const shouldTrigger =
        (alert.condition === "above" && currentPrice >= alert.target_price) ||
        (alert.condition === "below" && currentPrice <= alert.target_price);
      if (!shouldTrigger) continue;

      await fetch(`${APP_URL}/api/send-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: alert.email, symbol: alert.symbol, condition: alert.condition, targetPrice: alert.target_price, currentPrice }),
      });

      await supabaseRequest(`/alerts?id=eq.${alert.id}`, {
        method: "PATCH",
        body: JSON.stringify({ triggered: true }),
      });
      triggered++;
    }

    return NextResponse.json({ checked: alerts.length, triggered });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
