import { Resend } from "resend";
import { env, resendConfigured, isProd } from "../config/env.ts";

let client: Resend | null = null;
function resend(): Resend {
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send({ to, subject, html, text }: SendArgs): Promise<{ id: string | null; skipped: boolean }> {
  if (!resendConfigured) {
    // Dev fallback: without a key, log instead of throwing so the whole auth
    // flow stays testable before credentials land.
    console.warn(`[email] RESEND_API_KEY missing — not sending "${subject}" to ${to}`);
    if (!isProd) console.warn(`[email] preview:\n${text}`);
    return { id: null, skipped: true };
  }

  const { data, error } = await resend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[email] send failed", error);
    throw new Error(error.message || "Failed to send email");
  }
  return { id: data?.id ?? null, skipped: false };
}

const BRAND = "Hamyon";

function layout({ heading, body, footer }: { heading: string; body: string; footer?: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e3e6ef;overflow:hidden;">
          <tr><td style="padding:32px 32px 8px;">
            <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8b93a5;">${BRAND}</div>
            <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#10182b;font-weight:650;">${heading}</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 32px;font-size:15px;line-height:1.6;color:#5b6478;">
            ${body}
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f6f7fb;border-top:1px solid #e3e6ef;font-size:12px;line-height:1.5;color:#8b93a5;">
            ${footer || `If you didn't request this, you can safely ignore this email.`}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function codeBlock(code: string): string {
  return `<div style="margin:24px 0;padding:18px;background:#f6f7fb;border:1px solid #e3e6ef;border-radius:12px;text-align:center;">
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:600;letter-spacing:0.28em;color:#10182b;padding-left:0.28em;">${code}</div>
  </div>`;
}

export function sendVerifyEmail({ to, username, code }: { to: string; username: string; code: string }) {
  return send({
    to,
    subject: `${code} is your ${BRAND} verification code`,
    text: `Hi ${username}, your ${BRAND} verification code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`,
    html: layout({
      heading: "Confirm your email",
      body: `<p style="margin:0;">Hi ${username}, welcome to ${BRAND}. Enter this code to confirm your email address.</p>
        ${codeBlock(code)}
        <p style="margin:0;color:#8b93a5;font-size:13px;">This code expires in ${env.OTP_TTL_MINUTES} minutes.</p>`,
    }),
  });
}

export function sendResetPasswordEmail({ to, username, code }: { to: string; username: string; code: string }) {
  return send({
    to,
    subject: `${code} is your ${BRAND} password reset code`,
    text: `Hi ${username}, your ${BRAND} password reset code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes. If you didn't request this, ignore this email.`,
    html: layout({
      heading: "Reset your password",
      body: `<p style="margin:0;">Hi ${username}, use this code to set a new password.</p>
        ${codeBlock(code)}
        <p style="margin:0;color:#8b93a5;font-size:13px;">This code expires in ${env.OTP_TTL_MINUTES} minutes.</p>`,
      footer: `If you didn't request a password reset, ignore this email — your password will stay the same.`,
    }),
  });
}

export function sendTransferOtpEmail({
  to,
  username,
  code,
  amount,
  recipient,
}: {
  to: string;
  username: string;
  code: string;
  amount: string;
  recipient: string;
}) {
  return send({
    to,
    subject: `${code} — confirm your $${amount} USDC transfer`,
    text: `Hi ${username}, confirm sending ${amount} USDC to ${recipient} with code ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes. If this wasn't you, change your password immediately.`,
    html: layout({
      heading: "Confirm your transfer",
      body: `<p style="margin:0;">You're sending <strong>$${amount} USDC</strong> to:</p>
        <div style="margin:12px 0 0;padding:12px 14px;background:#f6f7fb;border:1px solid #e3e6ef;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#10182b;word-break:break-all;">${recipient}</div>
        ${codeBlock(code)}
        <p style="margin:0;color:#8b93a5;font-size:13px;">This code expires in ${env.OTP_TTL_MINUTES} minutes. Network fees are covered — the full amount arrives.</p>`,
      footer: `If you didn't start this transfer, change your password immediately — someone else may have access to your account.`,
    }),
  });
}

export function sendDeleteAccountEmail({ to, username, code }: { to: string; username: string; code: string }) {
  return send({
    to,
    subject: `${code} — confirm deleting your ${BRAND} account`,
    text: `Hi ${username}, confirm permanent deletion of your ${BRAND} account with code ${code}. This cannot be undone.`,
    html: layout({
      heading: "Delete your account",
      body: `<p style="margin:0;">Hi ${username}, use this code to permanently delete your ${BRAND} account. <strong>This cannot be undone</strong>, and any remaining balance will become unreachable.</p>
        ${codeBlock(code)}
        <p style="margin:0;color:#8b93a5;font-size:13px;">This code expires in ${env.OTP_TTL_MINUTES} minutes.</p>`,
      footer: `If you didn't request this, ignore this email and change your password.`,
    }),
  });
}

export function sendWelcomeEmail({ to, username, address }: { to: string; username: string; address: string }) {
  return send({
    to,
    subject: `Your ${BRAND} wallet is ready`,
    text: `Hi ${username}, your ${BRAND} wallet is ready. Your address: ${address}`,
    html: layout({
      heading: "Your wallet is ready",
      body: `<p style="margin:0;">Hi ${username}, your USDC wallet on Base has been created. Here's your address — anyone can send USDC to it.</p>
        <div style="margin:16px 0 0;padding:12px 14px;background:#f6f7fb;border:1px solid #e3e6ef;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#10182b;word-break:break-all;">${address}</div>
        <p style="margin:16px 0 0;color:#8b93a5;font-size:13px;">Network fees are covered for you — you never need to hold ETH.</p>`,
      footer: `You're on Base Sepolia testnet. Funds here have no real value.`,
    }),
  });
}
