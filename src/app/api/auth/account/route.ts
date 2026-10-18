import { NextResponse } from "next/server";
import {
  getCurrentUser,
  destroyAllUserSessions,
  clearSessionCookie,
} from "@/lib/auth/session";
import { softDeleteUser } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { inboxes } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * Soft-delete the account. Owned mailboxes are detached (userId set null)
 * so they become anonymous again. Sessions are revoked.
 */
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    await db
      .update(inboxes)
      .set({ userId: null, updatedAt: new Date() })
      .where(and(eq(inboxes.userId, user.id), isNull(inboxes.deletedAt)));

    await softDeleteUser(user.id);
    await destroyAllUserSessions(user.id);
    await clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[auth/account DELETE]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
