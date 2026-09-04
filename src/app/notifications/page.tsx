import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireActiveMember } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications/queries";
import { relativeTime } from "@/lib/time";
import { markAllNotificationsRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

/**
 * Icon and tint per kind. An unknown kind -- one added to the database ahead of
 * the app -- falls through to the neutral bell rather than rendering nothing,
 * because a notification you cannot see is worse than one that looks generic.
 */
const STYLE: Record<string, { icon: IconName; tone: string }> = {
  "video.approved": { icon: "check", tone: "bg-success-100 text-success-600" },
  "video.rejected": { icon: "cross", tone: "bg-danger-100 text-danger-600" },
  "join.approved": { icon: "sparkle", tone: "bg-success-100 text-success-600" },
  "join.rejected": { icon: "cross", tone: "bg-danger-100 text-danger-600" },
  "payment.received": { icon: "card", tone: "bg-brand-50 text-brand-700" },
  "points.awarded": { icon: "star", tone: "bg-gold-100 text-gold-700" },
  "membership.added": { icon: "users", tone: "bg-brand-50 text-brand-700" },
  "membership.changed": { icon: "refresh", tone: "bg-warning-100 text-warning-600" },
  "role.changed": { icon: "shield", tone: "bg-brand-50 text-brand-700" },
  "account.status": { icon: "check", tone: "bg-success-100 text-success-600" },
};

const FALLBACK = { icon: "bell" as IconName, tone: "bg-canvas-deep text-ink-muted" };

export default async function NotificationsPage() {
  await requireActiveMember();

  const notifications = await listNotifications();
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `${unread} unread`
            : "Approvals, payments and points land here."
        }
        action={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="inline-flex items-center min-h-9 px-3 rounded-lg text-sm font-medium text-brand-600 hover:bg-brand-50"
              >
                Mark all read
              </button>
            </form>
          ) : undefined
        }
      />

      <Card flush>
        {notifications.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="When the club approves a video, records your points or takes a payment, you'll hear about it here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((n) => {
              const style = STYLE[n.kind] ?? FALLBACK;
              const isUnread = !n.readAt;

              return (
                <li key={n.id}>
                  {/*
                    A form, not a link: pressing a notification has to mark it
                    read as well as navigate, and doing that server-side keeps
                    the whole list free of client JavaScript.
                  */}
                  <form action={openNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    {n.href ? (
                      <input type="hidden" name="href" value={n.href} />
                    ) : null}
                    <button
                      type="submit"
                      className={`group w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-canvas ${
                        isUnread ? "bg-brand-50/40" : ""
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${style.tone}`}
                      >
                        <Icon name={style.icon} className="size-[18px]" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span
                            className={`min-w-0 flex-1 truncate ${
                              isUnread ? "font-semibold text-ink" : "font-medium text-ink"
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 text-xs text-ink-faint tabular-nums">
                            {relativeTime(n.createdAt)}
                          </span>
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 block text-sm text-ink-muted">
                            {n.body}
                          </span>
                        ) : null}
                      </span>

                      {/*
                        The unread dot repeats what the bolder title already
                        says, on purpose: weight alone is a poor signal for
                        anyone who cannot easily compare two lines of text.
                      */}
                      {isUnread ? (
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-600">
                          <span className="sr-only">Unread</span>
                        </span>
                      ) : null}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
