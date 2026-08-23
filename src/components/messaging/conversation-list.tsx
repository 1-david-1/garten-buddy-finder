import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ConversationSummary } from "@/lib/messaging.functions";

function formatRelativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} T.`;
}

export function ConversationList({
  conversations,
  activeConversationId,
}: {
  conversations: ConversationSummary[];
  activeConversationId?: string;
}) {
  if (!conversations.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <MessageSquare className="mb-3 size-10 text-muted-foreground/40" />
        <p className="font-medium">Noch keine Nachrichten</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Starte eine Konversation über ein Angebot oder einen Auftrag.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50 overflow-y-auto">
      {conversations.map((conversation) => {
        const isOwnLastMessage =
          conversation.lastMessage?.senderId !== conversation.otherUser.id;
        return (
          <Link
            key={conversation.id}
            to="/messages/$conversationId"
            params={{ conversationId: conversation.id }}
            className={`flex gap-3 p-4 transition-colors hover:bg-muted/40 ${
              conversation.id === activeConversationId ? "bg-primary/10" : ""
            }`}
          >
            <Avatar className="size-10 shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary">
                {conversation.otherUser.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {conversation.otherUser.displayName}
                  </p>
                  {conversation.contextLabel && (
                    <p className="truncate text-xs text-muted-foreground">
                      {conversation.contextLabel}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </span>
                  {conversation.unreadCount > 0 && (
                    <Badge>{conversation.unreadCount}</Badge>
                  )}
                </div>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {isOwnLastMessage && conversation.lastMessage ? "Du: " : ""}
                {conversation.lastMessage?.body ?? "Noch keine Nachrichten"}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
