import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * The app's own mailer.
 *
 * Auth email used to be Supabase's job: GoTrue held the SMTP credentials and
 * rendered its own templates. That worked for signup confirmation and magic
 * links and never worked for `recovery` (DEPLOYMENT.md had it as an open
 * blocker: "real members who forget a password currently have no way back
 * in"), and it was unfixable from this repo -- the failure lived inside a
 * service we do not control.
 *
 * So delivery moves here. GoTrue still MINTS and VERIFIES the codes -- that is
 * the security-relevant half and it stays where the tokens are -- but the
 * message itself is composed and sent by this process, over our own SMTP
 * server, with our own templates. One mail path for every auth email, visible
 * in our logs, testable locally.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getMailFrom(): string {
  const address = required("SMTP_FROM");
  const name = process.env.SMTP_FROM_NAME?.trim();
  return name ? `"${name.replace(/"/g, "")}" <${address}>` : address;
}

let transporter: Transporter | undefined;

/**
 * Port 465 is implicit TLS; everything else starts in the clear and upgrades.
 * `requireTLS` is what makes that second case safe -- without it, a server that
 * fails to offer STARTTLS gets the message anyway, in plaintext, with a
 * one-time password in it. Better to fail the send.
 */
export function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`SMTP_PORT is not a valid port number: ${process.env.SMTP_PORT}`);
    }
    const secure = port === 465;

    transporter = nodemailer.createTransport({
      host: required("SMTP_HOST"),
      port,
      secure,
      requireTLS: !secure,
      auth: { user: required("SMTP_USER"), pass: required("SMTP_PASSWORD") },
    });
  }
  return transporter;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Sends one message. Throws on failure -- callers decide whether the user
 * should be told, and for the auth flows the answer is deliberately "not
 * always" (see the enumeration note in lib/auth/otp.ts).
 */
export async function sendMail(mail: Mail): Promise<void> {
  await getTransporter().sendMail({
    from: getMailFrom(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
