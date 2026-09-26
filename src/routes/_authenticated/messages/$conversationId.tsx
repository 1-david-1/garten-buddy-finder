import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  getConversationDetail,
  getConversationMessages,
  markConversationRead,
  sendMessage,
  type MessageItem,
} from "@/lib/messaging.functions";
import {
  getGigDetails,
  proposeGigDate,
} from "@/lib/gigs.functions";
import { respondToBooking } from "@/lib/service-listings.functions";
import { useAppNavItems } from "@/lib/use-app-nav";
import { supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute(
  "/_authenticated/messages/$conversationId",
)({
  beforeLoad: ({ params }) => {
    if (!UUID.test(params.conversationId)) throw redirect({ to: "/messages" });
  },
  loader: ({ params }) =>
    getConversationDetail({ data: { conversationId: params.conversationId } }),
  component: ConversationDetail,
});

function ConversationDetail() {
  const { conversationId } = Route.useParams();
  const { conversation } = Route.useLoaderData();
  const { navItems } = useAppNavItems();
  const getMessages = useServerFn(getConversationMessages);
  const send = useServerFn(sendMessage);
  const markRead = useServerFn(markConversationRead);
  const getGigFn = useServerFn(getGigDetails);
  const proposeDateFn = useServerFn(proposeGigDate);
  const respondFn = useServerFn(respondToBooking);
  const queryClient = useQueryClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [dateProposal, setDateProposal] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const gigQuery = useQuery({
    queryKey: ["gig", conversation.gigId],
    queryFn: () => getGigFn({ data: { gigId: conversation.gigId! } }),
    enabled: !!conversation.gigId,
  });

  const proposeDateMutation = useMutation({
    mutationFn: (input: { gigId: string; scheduledAt: string }) =>
      proposeDateFn({ data: input }),
    onSuccess: () => {
      toast.success("Terminvorschlag gesendet!");
      queryClient.invalidateQueries({ queryKey: ["gig", conversation.gigId] });
      setDateProposal("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const respondMutation = useMutation({
    mutationFn: async (input: { gigId: string; accept: boolean; customerId: string }) => {
      await respondFn({ data: { gigId: input.gigId, accept: input.accept } });
      return input;
    },
    onSuccess: (input) => {
      toast.success(input.accept ? "Termin bestätigt!" : "Anfrage abgelehnt.");
      queryClient.invalidateQueries({ queryKey: ["gig", conversation.gigId] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  useEffect(() => {
    let active = true;
    setMessages([]);
    setIsLoading(true);
    getMessages({ data: { conversationId } })
      .then(({ messages: loadedMessages }) => {
        if (active) setMessages(loadedMessages);
      })
      .catch(
        () =>
          active && toast.error("Nachrichten konnten nicht geladen werden."),
      )
      .finally(() => active && setIsLoading(false));
    void markRead({ data: { conversationId } });
    return () => {
      active = false;
    };
  }, [conversationId, getMessages, markRead]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [
                  ...current,
                  {
                    id: incoming.id,
                    senderId: incoming.sender_id,
                    body: incoming.body,
                    createdAt: incoming.created_at,
                  },
                ],
          );
          void markRead({ data: { conversationId } });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, markRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || isSending) return;
    setIsSending(true);
    try {
      const { message } = await send({ data: { conversationId, body: input } });
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
      setInput("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nachricht konnte nicht gesendet werden.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <DashboardShell
      title="Nachrichten"
      navItems={navItems}
      activeKey="messages"
    >
      <section className="flex min-h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
        <header className="flex flex-col gap-3 border-b border-border/50 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 font-medium text-primary">
              {conversation.otherUser.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-medium">
                {conversation.otherUser.displayName}
              </h1>
              {conversation.contextLabel && (
                <p className="truncate text-xs text-muted-foreground">
                  {conversation.contextLabel}
                </p>
              )}
            </div>
          </div>
          {gigQuery.data?.gig && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {gigQuery.data.gig.status === "pending_helper"
                    ? "Termin-Abstimmung"
                    : "Auftrags-Status"}
                </span>
                <span className="text-xs font-medium">
                  {gigQuery.data.gig.scheduled_at
                    ? new Date(gigQuery.data.gig.scheduled_at).toLocaleString("de-DE")
                    : "Noch kein Termin festgelegt"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Date Proposal for Customer */}
                {userId === gigQuery.data?.gig?.customer_id &&
                gigQuery.data?.gig?.status === "pending_helper" &&
                !gigQuery.data?.gig?.scheduled_at && (
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={dateProposal}
                      onChange={(e) => setDateProposal(e.target.value)}
                      className="h-7 w-36 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!dateProposal || proposeDateMutation.isPending}
                      onClick={() =>
                        proposeDateMutation.mutate({
                          gigId: conversation.gigId!,
                          scheduledAt: new Date(dateProposal).toISOString(),
                        })
                      }
                    >
                      Senden
                    </Button>
                  </div>
                )}
                {/* Date Confirmation for Helper */}
                {userId === gigQuery.data?.gig?.assigned_helper_id &&
                gigQuery.data?.gig?.status === "pending_helper" &&
                gigQuery.data?.gig?.scheduled_at && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          gigId: conversation.gigId!,
                          accept: true,
                          customerId: gigQuery.data?.gig?.customer_id ?? "",
                        })
                      }
                    >
                      Bestätigen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-destructive"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          gigId: conversation.gigId!,
                          accept: false,
                          customerId: gigQuery.data?.gig?.customer_id ?? "",
                        })
                      }
                    >
                      Ablehnen
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>
        <main className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Lade Nachrichten…
            </p>
          ) : messages.length ? (
            messages.map((message) => {
              const fromOtherUser =
                message.senderId === conversation.otherUser.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${fromOtherUser ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${fromOtherUser ? "bg-muted" : "bg-primary text-primary-foreground"}`}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.body}
                    </p>
                    <p
                      className={`mt-1 text-right text-xs ${fromOtherUser ? "text-muted-foreground" : "text-primary-foreground/70"}`}
                    >
                      {new Date(message.createdAt).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Nachrichten. Schreibe die erste Nachricht.
            </p>
          )}
          <div ref={messagesEndRef} />
        </main>
        <form
          className="flex items-end gap-3 border-t border-border/50 bg-muted/30 p-3"
          onSubmit={handleSubmit}
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Nachricht schreiben…"
            className="min-h-11 max-h-32 resize-none"
            disabled={isSending}
            maxLength={4000}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isSending || !input.trim()}
            aria-label="Nachricht senden"
          >
            <Send />
          </Button>
        </form>
      </section>
    </DashboardShell>
  );
}
