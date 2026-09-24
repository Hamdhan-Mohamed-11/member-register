import "server-only";

import type { Mail } from "./mailer";

const BRAND = "Pick a Book";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One shell for every auth email. Inline styles only, no external CSS and no
 * images: mail clients strip <style> blocks and block remote content, and a
 * code the reader cannot see is a support ticket.
 */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1b19;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e6e3dd;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8478;">${BRAND}</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${heading}</h1>
      ${bodyHtml}
    </div>
    <p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#8a8478;">
      This message was sent by ${BRAND}. Please do not reply to it.
    </p>
  </body>
</html>`;
}

function codeBlock(code: string, minutes: number): string {
  return `
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">Your verification code is:</p>
      <p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:0.28em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(code)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">It expires in ${minutes} minutes and can only be used once.</p>`;
}

export function signupCodeEmail(args: {
  to: string;
  code: string;
  expiresInMinutes: number;
  firstName?: string;
}): Mail {
  const name = args.firstName?.trim();
  const greetingText = name ? `Hi ${name},` : "Hi,";
  const greetingHtml = name ? `Hi ${escapeHtml(name)},` : "Hi,";

  return {
    to: args.to,
    subject: `${args.code} is your ${BRAND} verification code`,
    text: [
      greetingText,
      "",
      `Your ${BRAND} verification code is: ${args.code}`,
      `It expires in ${args.expiresInMinutes} minutes and can only be used once.`,
      "",
      "If you did not try to create an account, you can ignore this email.",
    ].join("\n"),
    html: layout(
      "Confirm your email address",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${greetingHtml} enter this code on the sign-up page to finish creating your account.</p>
      ${codeBlock(args.code, args.expiresInMinutes)}
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6f6a60;">If you did not try to create an account, you can ignore this email.</p>`,
    ),
  };
}

/**
 * Invites stay a LINK rather than a code, unlike signup and recovery.
 *
 * The recipient did not ask for this email and has no account yet, so there is
 * nothing for a code to confirm -- the link IS the proof they read the
 * mailbox, and it drops them straight on the page that sets their password.
 * Making forty new employees each type a code from a mail they were not
 * expecting buys nothing.
 */
export function inviteEmail(args: {
  to: string;
  actionLink: string;
  /**
   * Naming the club is what makes this recognisable. Without it the message
   * says only "your employer", which reads like a phishing attempt to someone
   * who did not know it was coming -- and they are the majority of recipients.
   */
  clubName?: string;
}): Mail {
  const club = args.clubName?.trim();
  const joining = club ? `${club}, a ${BRAND} club` : `a ${BRAND} club`;

  return {
    to: args.to,
    subject: club ? `You're invited to ${club}` : `You're invited to ${BRAND}`,
    text: [
      `Your employer has set up a membership for you at ${joining}.`,
      "",
      "Open this link to choose a password and finish setting up your account:",
      args.actionLink,
      "",
      "The link expires, so use it soon. If you were not expecting this, you",
      "can ignore this email.",
    ].join("\n"),
    html: layout(
      club ? `You're invited to ${escapeHtml(club)}` : "You're invited",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Your employer has set up a membership for you at <strong>${escapeHtml(joining)}</strong>. Choose a password and your account is ready.</p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(args.actionLink)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">Set up my account</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6f6a60;">If the button does not work, paste this into your browser:<br><span style="word-break:break-all;">${escapeHtml(args.actionLink)}</span></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6f6a60;">The link expires, so use it soon. If you were not expecting this, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetCodeEmail(args: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Mail {
  return {
    to: args.to,
    subject: `${args.code} is your ${BRAND} password reset code`,
    text: [
      `Your ${BRAND} password reset code is: ${args.code}`,
      `It expires in ${args.expiresInMinutes} minutes and can only be used once.`,
      "",
      "If you did not ask to reset your password, you can ignore this email --",
      "your password has not changed.",
    ].join("\n"),
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Enter this code on the password reset page to choose a new password.</p>
      ${codeBlock(args.code, args.expiresInMinutes)}
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6f6a60;">If you did not ask to reset your password, you can ignore this email — your password has not changed.</p>`,
    ),
  };
}

/**
 * The book is ready to collect.
 *
 * Sent when an admin approves a borrow request: the member is expected to
 * come to the office for it, so the message has to say what, where and by
 * when, and say it in the email rather than only behind a login.
 */
/** The placeholders a club may use in the borrow email, and what they mean. */
export const BORROW_EMAIL_PLACEHOLDERS: { token: string; means: string }[] = [
  { token: "{name}", means: "the member's first name" },
  { token: "{book}", means: "the book, with its author" },
  { token: "{title}", means: "just the book's title" },
  { token: "{place}", means: "where books are collected" },
  { token: "{due}", means: "the date it is due back, or blank" },
  { token: "{due_line}", means: "a whole sentence about the due date, or nothing" },
  { token: "{link}", means: "a link to the member's borrowing page" },
];

/** Fills the placeholders in one line of a club's own wording. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}

/**
 * The book is ready to collect.
 *
 * Sent when an admin approves a borrow request: the member is expected to
 * come to the office for it, so the message has to say what, where and by
 * when, and say it in the email rather than only behind a login.
 *
 * The words come from Settings when the club has written their own; the text
 * below is the fallback, and is also what a club gets back by clearing the
 * box. Placeholders are filled here rather than by the admin typing details
 * in by hand -- a subject line with last week's book in it is worse than a
 * plain one.
 */
export function borrowApprovedEmail(args: {
  to: string;
  firstName: string;
  bookTitle: string;
  bookAuthor?: string | null;
  dueOn?: string | null;
  collectAt?: string | null;
  link: string;
  /** The club's own subject and body, when they have written them. */
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
}): Mail {
  const book = args.bookAuthor
    ? `${args.bookTitle} by ${args.bookAuthor}`
    : args.bookTitle;
  const where = args.collectAt?.trim() || `the ${BRAND} office`;
  const due = args.dueOn
    ? new Date(`${args.dueOn}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const name = args.firstName?.trim() || "there";

  const values: Record<string, string> = {
    name,
    book,
    title: args.bookTitle,
    place: where,
    due,
    due_line: due ? `Please return it by ${due}.` : "",
    link: args.link,
  };

  const subject = fill(
    args.subjectTemplate?.trim() || "{book} is ready to collect",
    { ...values, book: args.bookTitle },
  );

  const body = fill(
    args.bodyTemplate?.trim() ||
      [
        "Hello {name},",
        "",
        "Your borrow request for {book} has been approved.",
        "",
        "Come to {place} to pick it up, and bring your member details.",
        "",
        "{due_line}",
        "",
        "If you no longer need it, cancel from your borrowing page so someone else can take it.",
      ].join("\n"),
    values,
  );

  // Blank lines separate paragraphs, the way the person writing it in the
  // settings box expects them to.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return {
    to: args.to,
    subject,
    text: [...paragraphs, `See your borrowing: ${args.link}`].join("\n\n"),
    html: layout(
      escapeHtml(subject),
      [
        ...paragraphs.map(
          (block) =>
            `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`,
        ),
        `<p style="margin:20px 0 0;">
        <a href="${escapeHtml(args.link)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">See my borrowing</a>
      </p>`,
      ].join("\n      "),
    ),
  };
}
