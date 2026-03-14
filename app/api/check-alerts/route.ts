import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_KEY || "";
const RESEND_KEY = process.env.RESEND_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.stockrai.com";

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Get all untriggered alerts
    const { data: alerts, error } = await supabase
      .from("alerts")
      .select("*, auth.users!alerts_user_id_fkey(email)")
      .eq("triggered", false);

    if (error) throw error;
    if (!alerts || alerts.length === 0) return NextResponse.json({ checked: 0 });

    // Get unique symbols
    const symbols = [...new Set(alerts.map((a: any) => a.symbol))];

    // Fetch live prices for all symbols
    const prices: Record<string, number> = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
        const data = await r.json();
        if (data.c) prices[sym as string] = data.c;
      })
    );

    // Check each alert
    let triggered = 0;
    for (const alert of alerts as any[]) {
      const currentPrice = prices[alert.symbol];
      if (!currentPrice) continue;

      const shouldTrigger =
        (alert.condition === "above" && currentPrice >= alert.target_price) ||
        (alert.condition === "below" && currentPrice <= alert.target_price);

      if (!shouldTrigger) continue;

      // Send email
      await fetch(`${APP_URL}/api/send-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: alert.email,
          symbol: alert.symbol,
          condition: alert.condition,
          targetPrice: alert.target_price,
          currentPrice,
        }),
      });

      // Mark as triggered
      await supabase.from("alerts").update({ triggered: true }).eq("id", alert.id);
      triggered++;
    }

    return NextResponse.json({ checked: alerts.length, triggered });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
