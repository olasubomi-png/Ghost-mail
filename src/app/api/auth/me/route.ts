import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error("[auth/me]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
