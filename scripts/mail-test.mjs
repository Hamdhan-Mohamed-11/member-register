/**
 * SMTP smoke test for the auth mailer.
 *
 * Signup and password recovery both hinge on this one connection now, and it
 * is the piece that cannot be checked from a database suite: credentials,
 * TLS, and whether the provider will accept mail as the From address are all
 * facts about someone else's server. Run it on the VPS after setting the
 * SMTP_* vars, before anyone tries to register.
 *
 * It sends a real message. Give it an address you can actually read.
 *
 * Run: npm run test:mail -- you@example.com
 */
import nodemailer from "nodemailer";

const to = process.argv[2];
if (!to) {
  console.error("Usage: npm run test:mail -- you@example.com");
  process.exit(2);
}

const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"].filter(
  (name) => !process.env[name],
);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}. Run via \`npm run test:mail\`.`);
  process.exit(2);
}

const port = Number(process.env.SMTP_PORT ?? 587);
const secure = port === 465;

// Same construction as src/lib/email/mailer.ts, deliberately -- a test that
// connects differently from the app proves nothing about the app.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure,
  requireTLS: !secure,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
});

try {
  await transporter.verify();
  console.log(`connect  ok   ${process.env.SMTP_HOST}:${port} (${secure ? "TLS" : "STARTTLS"})`);
} catch (error) {
  console.error(`connect  FAIL ${error.message}`);
  process.exit(1);
}

try {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM_NAME
      ? `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM}>`
      : process.env.SMTP_FROM,
    to,
    subject: "123456 is your Pick a Book verification code (test)",
    text:
      "This is a test of the Pick a Book auth mailer. If it arrived, signup " +
      "and password-reset codes will arrive too.\n\nThe code above is not real.",
  });
  console.log(`send     ok   accepted for ${info.accepted.join(", ")}`);
} catch (error) {
  console.error(`send     FAIL ${error.message}`);
  process.exit(1);
}

console.log("\nNow check the inbox — and the spam folder. Accepted by the relay");
console.log("is not the same as delivered, and a code in spam is a lost member.");
