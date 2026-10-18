import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearSessionCookie,
  destroySession,
} from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export const runtime = "nodejs";

export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) {
      await destroySession(token);
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[auth/logout]",
      err instanceof Error ? err.message : "unknown"
    );
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  }
}
