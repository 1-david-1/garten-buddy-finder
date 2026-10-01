import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { de } from "date-fns/locale";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getNotifications,
  markNotificationsRead,
  type AppNotification,
} from "@/lib/notifications.functions";

/**
 * Glocke fürs Benachrichtigungszentrum. Zeigt die letzten Einträge aus
 * der notifications-Tabelle (angelegt von notifyUserByEmail() bei so gut
 * wie jeder relevanten Aktion: neue Buchungsanfrage, Gebot, Nachricht,
 * Storno, Auftrag abgeschlossen, ...) und hält sie per Realtime aktuell.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const getNotificationsFn = useServerFn(getNotifications);
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotificationsFn(),
    enabled: !!user,
  });

  const markReadFn = useServerFn(markNotificationsRead);
  const markReadMutation = useMutation({
    mutationFn: (input: { notificationId?: string; all?: boolean }) =>
      markReadFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Live-Updates: neue Benachrichtigung poppt sofort auf, kein Neuladen nötig.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: { title: string; body: string | null; link: string | null } }) => {
          toast(payload.new.title, {
            description: payload.new.body ?? undefined,
            action: payload.new.link
              ? {
                  label: "Ansehen",
                  onClick: () => navigate({ to: payload.new.link! }),
                }
              : undefined,
          });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, navigate]);

  if (!user) return null;

  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  const handleClick = (n: AppNotification) => {
    if (!n.readAt) markReadMutation.mutate({ notificationId: n.id });
    setOpen(false);
    if (n.link) navigate({ to: n.link });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Benachrichtigungen</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-1.5 py-1 text-xs text-muted-foreground"
              onClick={() => markReadMutation.mutate({ all: true })}
            >
              <CheckCheck className="size-3.5" />
              Alle gelesen
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Noch keine Benachrichtigungen.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                    !n.readAt ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.readAt && (
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  {n.body && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/70">
                    {formatDistanceToNowStrict(new Date(n.createdAt), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
