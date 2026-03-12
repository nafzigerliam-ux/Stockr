import { NextRequest, NextResponse } from "next/server";

const KEY = process.env.ANTHROPIC_KEY;

export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "Anthropic key not configured" }, { status: 500 });

  try {
    const body = await req.json();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}
