import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatLkr } from "@/components/sessions/SessionCard";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { feeForMember, getSession, myBooking } from "@/lib/sessions/queries";
import { flyerUrl, sessionImageUrl } from "@/lib/flyers/url";
import { parseVideoUrl } from "@/lib/sessions/video";
import { CLUB_TZ } from "@/lib/time";
import {
  attendedSession,
  averageRating,
  getMyFeedback,
  getPresenterFeedback,
} from "@/lib/sessions/feedback";
import { AddToCalendar } from "./AddToCalendar";
import { FeedbackForm } from "./FeedbackForm";
import { BookingPanel } from "./BookingPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session?.title ?? "Session" };
}

// Sessions are held in Sri Lanka, and this renders on a server whose clock is
// not necessarily the club's, so every date and time is formatted in Colombo
// time explicitly.
const TZ = CLUB_TZ;

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeOfDay(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?([ap])\.?m\.?/i, " $1m")
    .toLowerCase();
}

/** The icons the "what to expect" points take, in order. */
const EXPECT_ICONS: IconName[] = ["chat", "bulb", "users"];

/**
 * Where the flyer goes when there is one, and a drawn banner when there is
 * not -- books, a mug and a plant in the brand's colours, so the page ends on
 * something warm rather than on a form.
 */
function InspireBanner() {
  return (
    <div className="relative overflow-hidden rounded-card border border-cream-deep bg-cream">
      <div className="grid items-center sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <svg viewBox="0 0 320 170" className="h-40 w-full sm:h-44" aria-hidden>
          <defs>
            <linearGradient id="inspire-wash" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#efe4d1" />
              <stop offset="1" stopColor="#f8f2e9" />
            </linearGradient>
          </defs>
          <rect width="320" height="170" fill="url(#inspire-wash)" />
          {/* Shelf */}
          <rect x="0" y="146" width="320" height="24" fill="#e2d3b8" />
          {/* Plant */}
          <g transform="translate(46 70)">
            <path d="M22 0c-14 10-22 30-8 50" stroke="#2f7a52" strokeWidth="3" fill="none" />
            <ellipse cx="6" cy="22" rx="12" ry="6" transform="rotate(-40 6 22)" fill="#3f9b68" />
            <ellipse cx="34" cy="16" rx="12" ry="6" transform="rotate(35 34 16)" fill="#4fb07a" />
            <ellipse cx="12" cy="42" rx="11" ry="5" transform="rotate(-20 12 42)" fill="#3f9b68" />
            <ellipse cx="36" cy="38" rx="11" ry="5" transform="rotate(25 36 38)" fill="#4fb07a" />
            <path d="M4 50h36l-5 26H9z" fill="#c9982a" />
          </g>
          {/* Stack of books */}
          <g transform="translate(120 70)">
            <rect x="0" y="54" width="118" height="22" rx="3" fill="#293896" />
            <rect x="8" y="58" width="44" height="3" rx="1.5" fill="#f2cf7a" />
            <rect x="10" y="32" width="104" height="22" rx="3" fill="#00aeef" />
            <rect x="4" y="12" width="112" height="20" rx="3" fill="#f8f2e9" stroke="#e2d3b8" />
            <rect x="94" y="12" width="10" height="20" fill="#c9982a" />
            {/* An upright book */}
            <rect x="18" y="-38" width="30" height="50" rx="3" fill="#16205c" />
            <rect x="24" y="-26" width="18" height="3" rx="1.5" fill="#f2cf7a" />
          </g>
          {/* Mug */}
          <g transform="translate(250 106)">
            <rect x="0" y="0" width="34" height="40" rx="5" fill="#ffffff" stroke="#e2d3b8" />
            <path d="M34 10h6a7 7 0 0 1 0 16h-6" stroke="#e2d3b8" strokeWidth="4" fill="none" />
            <rect x="8" y="14" width="18" height="3" rx="1.5" fill="#293896" />
            <path d="M10 -6c0-6 6-6 6-12M20 -4c0-6 6-6 6-12" stroke="#c7b79a" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </svg>
        <div className="px-6 pb-6 sm:py-6 sm:pl-2 sm:pr-8">
          <p className="font-display text-2xl leading-tight text-ink sm:text-[1.7rem]">
            Come curious.
            <br />
            Leave inspired.
          </p>
          <span className="mt-3 block h-0.5 w-10 bg-brand-600" aria-hidden />
          <p className="mt-3 text-sm text-ink-muted">Great books bring people together.</p>
        </div>
      </div>
    </div>
  );
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireActiveMember();
  const { id } = await params;

  const session = await getSession(id);
  if (!session) notFound();

  const [fee, booking] = await Promise.all([
    feeForMember(id, member.userId),
    myBooking(id, member.userId),
  ]);

  // Feedback opens once the evening has happened AND the club has recorded
  // who was there -- attendance is the club's own record of the room.
  const isPresenter = session.presenter?.id === member.userId;
  const [attended, myFeedback, presenterFeedback] = session.isPast
    ? await Promise.all([
        attendedSession(id),
        getMyFeedback(id),
        isPresenter ? getPresenterFeedback(id) : Promise.resolve([]),
      ])
    : [false, [], []];
  const feedbackFor = (kind: "session" | "presenter") =>
    myFeedback.find((f) => f.kind === kind);

  const video = parseVideoUrl(session.videoUrl);
  const flyer = flyerUrl(session.flyerPath);
  const cover = sessionImageUrl(session.imagePath);
  const cancelled = session.status === "cancelled";
  const booked = booking != null && booking.status !== "cancelled";
  const presenterName = session.presenter
    ? `${session.presenter.firstName} ${session.presenter.lastName}`.trim()
    : null;

  const status = cancelled
    ? { label: "Cancelled", tone: "bg-danger-100 text-danger-600", dot: "bg-danger-600" }
    : session.isPast
      ? { label: "Happened", tone: "bg-canvas-deep text-ink-muted", dot: "bg-ink-faint" }
      : booked
        ? { label: "You're going", tone: "bg-brand-50 text-brand-700", dot: "bg-brand-600" }
        : { label: "Upcoming", tone: "bg-success-100 text-success-600", dot: "bg-success-600" };

  const priceNote =
    session.pricingKind === "free"
      ? "Free for every member"
      : fee === 0
        ? "Included with your membership"
        : "Guest fee for members of other clubs";

  const tagline =
    session.tagline ||
    (session.bookTitle
      ? `${session.bookTitle}${session.bookAuthor ? ` by ${session.bookAuthor}` : ""}`
      : null);

  return (
    <AppShell wide>
      {/* ---- Breadcrumb ---------------------------------------------------- */}
      <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          href="/sessions"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-600 hover:underline"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
            <path d="m15 6-6 6 6 6" />
          </svg>
          Sessions
        </Link>
        <span className="text-ink-faint" aria-hidden>
          /
        </span>
        <span className="truncate text-ink-muted" aria-current="page">
          {session.title}
        </span>
      </nav>

      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="reveal relative isolate overflow-hidden rounded-panel bg-brand-900 shadow-band">
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(760px 380px at 85% -10%, rgba(0,174,239,0.55), transparent 62%), radial-gradient(520px 300px at 105% 110%, rgba(249,205,89,0.28), transparent 60%), linear-gradient(135deg, #10174a, #293896)",
            }}
          />
        )}
        {/* Keeps white text readable over any photo: dark on the left where
            the words are, clear on the right where the picture is. On a phone
            the words sit at the bottom, so the shade does too. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-brand-950/90 via-brand-950/55 to-brand-950/10 sm:bg-gradient-to-r sm:from-brand-950/95 sm:via-brand-950/75 sm:to-brand-950/5"
        />

        <div className="flex min-h-[240px] flex-col justify-end p-6 sm:min-h-[300px] sm:justify-center sm:p-10 lg:max-w-[62%]">
          {session.label ? (
            <span className="mb-4 inline-flex w-fit items-center rounded-full bg-brand-600/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white ring-1 ring-white/20">
              {session.label}
            </span>
          ) : null}
          <h1 className="font-display text-3xl leading-[1.08] text-white [overflow-wrap:anywhere] sm:text-5xl">
            {session.title}
          </h1>
          {tagline ? (
            <p className="mt-3 max-w-xl text-base text-white/85 sm:text-lg">{tagline}</p>
          ) : null}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* ---- The session -------------------------------------------------- */}
        <Card className="order-2 min-w-0 lg:order-1">
          <h2 className="font-display text-2xl text-ink">About this session</h2>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-muted">
            {session.notes ||
              "The host club has not written a description yet. Book a place and come along — the details are below."}
          </p>

          {session.highlights.length ? (
            <>
              <hr className="my-6 border-line" />
              <h3 className="font-display text-xl text-ink">What to expect</h3>
              <ul className="mt-4 grid gap-4 sm:grid-cols-3">
                {session.highlights.map((point, i) => (
                  <li key={point} className="flex items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                      <Icon name={EXPECT_ICONS[i] ?? "sparkle"} className="size-6" />
                    </span>
                    <span className="text-sm leading-snug text-ink">{point}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {session.bookTitle || presenterName ? (
            <>
              <hr className="my-6 border-line" />
              <h3 className="font-display text-xl text-ink">Being presented</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {session.bookTitle ? (
                  <div className="flex items-center gap-3 rounded-card border border-line p-3">
                    <span className="grid h-14 w-11 shrink-0 place-items-center rounded-md bg-gradient-to-br from-brand-600 to-brand-900 text-white shadow-card">
                      <Icon name="book" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-ink-faint">The book</p>
                      <p className="truncate font-medium text-ink">{session.bookTitle}</p>
                      {session.bookAuthor ? (
                        <p className="truncate text-sm text-ink-muted">{session.bookAuthor}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {session.presenter && presenterName ? (
                  <Link
                    href={`/members/${session.presenter.id}`}
                    className="group flex items-center gap-3 rounded-card border border-line p-3 transition-colors hover:bg-canvas"
                  >
                    <Avatar
                      src={avatarUrl(session.presenter.id, session.presenter.avatarPath)}
                      firstName={session.presenter.firstName}
                      lastName={session.presenter.lastName}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-ink-faint">Presented by</p>
                      <p className="truncate font-medium text-ink group-hover:text-brand-600">
                        {presenterName}
                      </p>
                    </div>
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}

          {session.hostClub ? (
            <div className="mt-6 flex items-center gap-4 rounded-card bg-brand-50 p-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <Icon name="book" className="size-7" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">Hosted by</p>
                <p className="truncate font-medium text-ink">{session.hostClub.name}</p>
                <Link
                  href={`/directory?q=${encodeURIComponent(session.hostClub.name)}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                >
                  See its members
                  <Icon name="arrow-right" className="size-3.5" />
                </Link>
              </div>
            </div>
          ) : null}

          {video ? (
            <div className="mt-6">
              <h3 className="mb-3 font-display text-xl text-ink">Recording</h3>
              {/* src is CONSTRUCTED from a parsed provider + id, never the
                  pasted string -- see lib/sessions/video.ts. */}
              <div className="relative aspect-video w-full overflow-hidden rounded-card bg-ink">
                <iframe
                  src={video.embedUrl}
                  title={`${session.title} recording`}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          ) : session.videoUrl ? (
            <p className="mt-6 text-sm text-ink-muted">
              Recording:{" "}
              <a
                href={session.videoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-brand-600 hover:underline"
              >
                {session.videoUrl}
              </a>
            </p>
          ) : null}

          {/* ---- Feedback ------------------------------------------------ */}
          {attended && !cancelled ? (
            <div className="mt-6 rounded-card border border-brand-200 bg-brand-50 p-4">
              <h3 className="font-display text-xl text-ink">How was it?</h3>
              <p className="mt-1 text-sm text-ink-muted">
                Only the club admin reads what you say about the evening. The presenter
                sees their own feedback without names.
              </p>

              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <FeedbackForm
                  sessionId={session.id}
                  kind="session"
                  title="The session"
                  hint="The book, the discussion, the venue, the timing."
                  initialRating={feedbackFor("session")?.rating ?? 0}
                  initialComment={feedbackFor("session")?.comment ?? ""}
                />
                {session.presenter && !isPresenter ? (
                  <FeedbackForm
                    sessionId={session.id}
                    kind="presenter"
                    title={`${presenterName} presenting`}
                    hint="How they covered the book, and how they ran the room."
                    initialRating={feedbackFor("presenter")?.rating ?? 0}
                    initialComment={feedbackFor("presenter")?.comment ?? ""}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* What the presenter is told, without names. */}
          {isPresenter && presenterFeedback.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-display text-xl text-ink">
                Your feedback{" "}
                <span className="text-base font-normal text-ink-muted">
                  · {averageRating(presenterFeedback)} out of 5 from{" "}
                  {presenterFeedback.length}{" "}
                  {presenterFeedback.length === 1 ? "person" : "people"}
                </span>
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                Names are not shown, so people can answer honestly.
              </p>
              <ul className="mt-3 space-y-2">
                {presenterFeedback.map((f, i) => (
                  <li key={i} className="rounded-card border border-line p-3">
                    <p className="text-sm font-medium text-gold-700">{f.rating} / 5</p>
                    {f.comment ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{f.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The flyer if the club made one; otherwise a drawn banner. */}
          <div className="mt-6">
            {flyer ? (
              <a href={flyer} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={flyer}
                  alt={`Flyer for ${session.title}`}
                  className="mx-auto block h-auto w-full max-w-md rounded-card shadow-card"
                />
              </a>
            ) : (
              <InspireBanner />
            )}
          </div>
        </Card>

        {/* ---- Reserve your place ------------------------------------------- */}
        <Card className="order-1 lg:order-2 lg:sticky lg:top-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl text-ink">Reserve your place</h2>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.tone}`}
            >
              <span className={`size-1.5 rounded-full ${status.dot}`} aria-hidden />
              {status.label}
            </span>
          </div>

          <p className="mt-3 font-display text-4xl text-brand-600 tabular-nums">
            {fee === 0 ? "Free" : formatLkr(fee)}
          </p>
          <p className="text-sm text-ink-muted">{priceNote}</p>

          <hr className="my-5 border-line" />

          <ul className="space-y-3.5 text-sm text-ink">
            <li className="flex items-center gap-3">
              <Icon name="calendar" className="size-5 shrink-0 text-brand-600" />
              {longDate(session.heldAt)}
            </li>
            <li className="flex items-center gap-3">
              <Icon name="clock" className="size-5 shrink-0 text-brand-600" />
              {timeOfDay(session.heldAt)} · Sri Lanka time
            </li>
            <li className="flex items-start gap-3">
              <Icon name="pin" className="mt-0.5 size-5 shrink-0 text-brand-600" />
              <span className="min-w-0">{session.location || "Venue to be confirmed by the club"}</span>
            </li>
            {session.capacity ? (
              <li className="flex items-center gap-3">
                <Icon name="users" className="size-5 shrink-0 text-brand-600" />
                Room for {session.capacity} people
              </li>
            ) : null}
          </ul>

          <div className="mt-5 space-y-2.5">
            <BookingPanel
              sessionId={session.id}
              fee={fee}
              booking={booking}
              isPast={session.isPast}
              isCancelled={cancelled}
            />
            {!session.isPast && !cancelled ? (
              <AddToCalendar
                sessionId={session.id}
                title={session.title}
                startIso={session.heldAt}
                location={session.location}
                details={[tagline, presenterName ? `Presented by ${presenterName}` : null]
                  .filter(Boolean)
                  .join("\n")}
              />
            ) : null}
          </div>

          <hr className="my-5 border-line" />
          <p className="text-center text-sm text-ink-faint">
            Your next great conversation starts here.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
