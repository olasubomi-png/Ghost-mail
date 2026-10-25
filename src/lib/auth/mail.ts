/**
 * Outbound transactional email via Resend when RESEND_API_KEY is set.
 * Never logs tokens or full links in production logs.
 */

function appBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<{ sent: boolean; reason?: string }> {
  const link = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendTransactional(to, "Verify your VeilMail account", {
    text: `Verify your VeilMail account by opening this link:\n\n${link}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
    html: `<p>Verify your VeilMail account:</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<{ sent: boolean; reason?: string }> {
  const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendTransactional(to, "Reset your VeilMail password", {
    text: `Reset your password by opening this link:\n\n${link}\n\nThis link expires in 1 hour. If you did not request a reset, ignore this email.`,
    html: `<p>Reset your VeilMail password:</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
  });
}

async function sendTransactional(
  to: string,
  subject: string,
  body: { text: string; html: string }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.AUTH_FROM_EMAIL ||
    `noreply@${(process.env.EMAIL_DOMAIN || "localhost").toLowerCase()}`;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[auth/mail] RESEND_API_KEY not set – email not sent (dev)");
    }
    return { sent: false, reason: "mail_not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: body.text,
        html: body.html,
      }),
    });
    if (!res.ok) {
      console.error("[auth/mail] send failed", { status: res.status });
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch {
    console.error("[auth/mail] network error");
    return { sent: false, reason: "network_error" };
  }
}
