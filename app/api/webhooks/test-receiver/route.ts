import { NextResponse, NextRequest } from "next/server";

/** A convenience echo endpoint so webhook subscriptions can be demoed
 * without a real external server — point a subscription's URL at
 * `${origin}/api/webhooks/test-receiver` and watch the delivery log on
 * /staff/webhooks fill in with real 200s from a real HTTP round trip. Not
 * meant for production use; it does nothing but acknowledge. */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-maatram-signature");
  const eventType = req.headers.get("x-maatram-event");
  const body = await req.json().catch(() => null);
  console.log(`[webhook test-receiver] ${eventType} (sig ${signature?.slice(0, 8)}…)`, body);
  return NextResponse.json({ received: true, eventType });
}
