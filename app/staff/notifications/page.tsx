import Link from "next/link";
import { Bell, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

export default async function NotificationsPage() {
  const session = await requireRole(["STAFF"]);

  const notifications = await prisma.notification.findMany({
    where: { recipientId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = notifications.filter((n) => !n.read).length;
  const nav = await getStaffNav("STAFF", session.user.id);

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Operations"
        title="Notifications"
        description="Risk flags and stale check-ins, surfaced the moment a mentor logs them."
        action={
          unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="secondary" size="sm">
                Mark all read
              </Button>
            </form>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="Risk flags from mentor check-ins will show up here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card className={n.read ? "" : "border-danger/30 bg-danger-soft/40"}>
                <CardBody className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${n.read ? "text-ink-faint" : "text-danger"}`} aria-hidden />
                    <div className="min-w-0">
                      {n.studentId ? (
                        <Link href={`/staff/students/${n.studentId}`} className="text-sm font-medium text-accent hover:text-accent-strong">
                          {n.title}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-ink">{n.title}</p>
                      )}
                      <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-ink-faint">{n.createdAt.toLocaleString()}</p>
                    </div>
                  </div>
                  {!n.read && (
                    <form action={markNotificationRead.bind(null, n.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Mark read
                      </Button>
                    </form>
                  )}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
