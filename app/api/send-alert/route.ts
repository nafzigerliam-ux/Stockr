import { NextRequest, NextResponse } from "next/server";

const RESEND_KEY = process.env.RESEND_KEY || "";

export async function POST(req: NextRequest) {
  if (!RESEND_KEY) return NextResponse.json({ error: "Resend key not configured" }, { status: 500 });

  try {
    const { to, symbol, condition, targetPrice, currentPrice } = await req.json();
    if (!to || !symbol) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const direction = condition === "above" ? "risen above" : "fallen below";
    const change = condition === "above"
      ? `+${((currentPrice - targetPrice) / targetPrice * 100).toFixed(2)}%`
      : `${((currentPrice - targetPrice) / targetPrice * 100).toFixed(2)}%`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#04060f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#090e1c;border-radius:16px;border:1px solid #1a2840;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6d28d9,#38bdf8);padding:28px 32px;">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:1px;">STOCKR <span style="font-size:14px;opacity:0.8;">AI</span></div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">Price Alert Triggered</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:32px;font-weight:800;color:#38bdf8;font-family:monospace;margin-bottom:4px;">${symbol}</div>
      <div style="font-size:15px;color:#e8edf5;margin-bottom:24px;">
        has <strong style="color:${condition === "above" ? "#34d399" : "#f87171"}">${direction}</strong> your target of <strong style="color:#e8edf5;">$${Number(targetPrice).toFixed(2)}</strong>
      </div>
      <div style="background:#0d1428;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #1a2840;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#5a7090;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Current Price</span>
          <span style="color:#e8edf5;font-weight:700;font-size:18px;font-family:monospace;">$${Number(currentPrice).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#5a7090;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Your Target</span>
          <span style="color:#5a7090;font-family:monospace;">$${Number(targetPrice).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#5a7090;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Difference</span>
          <span style="color:${condition === "above" ? "#34d399" : "#f87171"};font-family:monospace;font-weight:700;">${change}</span>
        </div>
      </div>
      <a href="https://www.stockrai.com" style="display:block;text-align:center;background:linear-gradient(135deg,#6d28d9,#38bdf8);color:#fff;text-decoration:none;padding:14px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
        View Portfolio â
      </a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1a2840;text-align:center;">
      <span style="color:#5a7090;font-size:11px;">You're receiving this because you set a price alert on Stockr AI. <a href="https://www.stockrai.com" style="color:#38bdf8;">Manage alerts</a></span>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Stockr AI <alerts@stockrai.com>",
        to: [to],
        subject: `ð ${symbol} Alert â Price ${condition === "above" ? "â²" : "â¼"} $${Number(currentPrice).toFixed(2)}`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Resend error");
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
