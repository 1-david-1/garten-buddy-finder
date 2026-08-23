import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MESSAGE_MAX_LENGTH = 4000;

export interface ConversationSummary {
  id: string;
  lastMessageAt: string;
  otherUser: { id: string; displayName: string };
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  contextLabel: string | null;
}

export interface MessageItem {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const sendMessageSchema = conversationIdSchema.extend({
  body: z
    .string()
    .trim()
    .min(1, "Nachricht darf nicht leer sein.")
    .max(MESSAGE_MAX_LENGTH),
});

function otherParticipant(
  conversation: { participant_a: string; participant_b: string },
  userId: string,
) {
  return conversation.participant_a === userId
    ? conversation.participant_b
    : conversation.participant_a;
}

function assertParticipant(
  conversation: { participant_a: string; participant_b: string },
  userId: string,
) {
  if (
    conversation.participant_a !== userId &&
    conversation.participant_b !== userId
  ) {
    throw new Error("Kein Zugriff auf diese Konversation.");
  }
}

async function getContextLabel(
  supabase: SupabaseClient,
  gigId: string | null,
  listingId: string | null,
) {
  if (gigId) {
    const { data } = await supabase
      .from("gigs")
      .select("title")
      .eq("id", gigId)
      .maybeSingle();
    if (data?.title) return `Auftrag: ${data.title}`;
  }
  if (listingId) {
    const { data } = await supabase
      .from("service_listings")
      .select("title")
      .eq("id", listingId)
      .maybeSingle();
    if (data?.title) return `Angebot: ${data.title}`;
  }
  return null;
}

export const getMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(
        "id, participant_a, participant_b, gig_id, listing_id, last_message_at",
      )
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    if (!conversations?.length)
      return { conversations: [] as ConversationSummary[] };

    const conversationIds = conversations.map(
      (conversation) => conversation.id,
    );
    const otherUserIds = conversations.map((conversation) =>
      otherParticipant(conversation, userId),
    );
    const [
      { data: profiles, error: profilesError },
      { data: messages, error: messagesError },
      { data: reads, error: readsError },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", otherUserIds),
      supabase
        .from("messages")
        .select("conversation_id, sender_id, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("conversation_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", userId)
        .in("conversation_id", conversationIds),
    ]);
    if (profilesError) throw profilesError;
    if (messagesError) throw messagesError;
    if (readsError) throw readsError;

    const names = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.display_name]),
    );
    const lastRead = new Map(
      (reads ?? []).map((read) => [read.conversation_id, read.last_read_at]),
    );
    const perConversation = new Map<string, typeof messages>();
    for (const message of messages ?? []) {
      const current = perConversation.get(message.conversation_id) ?? [];
      current.push(message);
      perConversation.set(message.conversation_id, current);
    }

    return {
      conversations: await Promise.all(
        conversations.map(async (conversation) => {
          const conversationMessages =
            perConversation.get(conversation.id) ?? [];
          const latest = conversationMessages[0] ?? null;
          const readAt = lastRead.get(conversation.id);
          const unreadCount = conversationMessages.filter(
            (message) =>
              message.sender_id !== userId &&
              (!readAt || new Date(message.created_at) > new Date(readAt)),
          ).length;
          const otherUserId = otherParticipant(conversation, userId);
          return {
            id: conversation.id,
            lastMessageAt: conversation.last_message_at,
            otherUser: {
              id: otherUserId,
              displayName: names.get(otherUserId) || "Unbekannt",
            },
            lastMessage: latest
              ? {
                  body: latest.body,
                  senderId: latest.sender_id,
                  createdAt: latest.created_at,
                }
              : null,
            unreadCount,
            contextLabel: await getContextLabel(
              supabase,
              conversation.gig_id,
              conversation.listing_id,
            ),
          } satisfies ConversationSummary;
        }),
      ),
    };
  });

export const getConversationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id, participant_a, participant_b, gig_id, listing_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!conversation) throw new Error("Konversation nicht gefunden.");
    assertParticipant(conversation, userId);
    const otherUserId = otherParticipant(conversation, userId);
    const [{ data: profile, error: profileError }, contextLabel] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", otherUserId)
          .maybeSingle(),
        getContextLabel(supabase, conversation.gig_id, conversation.listing_id),
      ]);
    if (profileError) throw profileError;
    return {
      conversation: {
        id: conversation.id,
        otherUser: {
          id: otherUserId,
          displayName: profile?.display_name || "Unbekannt",
        },
        contextLabel,
      },
    };
  });

export const getConversationMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("participant_a, participant_b")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("Konversation nicht gefunden.");
    assertParticipant(conversation, userId);
    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return {
      messages: (messages ?? []).map((message): MessageItem => ({
        id: message.id,
        senderId: message.sender_id,
        body: message.body,
        createdAt: message.created_at,
      })),
    };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => sendMessageSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("participant_a, participant_b, gig_id, listing_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("Konversation nicht gefunden.");
    assertParticipant(conversation, userId);

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_id: userId,
        body: data.body,
      })
      .select("id, sender_id, body, created_at")
      .single();
    if (error) throw error;

    const recipientId = otherParticipant(conversation, userId);
    const [{ data: sender }, contextLabel] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle(),
      getContextLabel(supabase, conversation.gig_id, conversation.listing_id),
    ]);
    const { notifyUserByEmail } =
      await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: recipientId,
      category: "messages",
      subject: `Neue Nachricht von ${sender?.display_name ?? "einem Nutzer"}`,
      html: emailTemplate({
        heading: "Neue Nachricht erhalten",
        bodyLines: [
          `${sender?.display_name ?? "Ein Nutzer"} hat dir geschrieben${contextLabel ? ` (${contextLabel})` : ""}.`,
          data.body.length > 120 ? `${data.body.slice(0, 120)}…` : data.body,
        ],
        ctaLabel: "Nachricht lesen",
        ctaPath: `/messages/${data.conversationId}`,
      }),
    });
    return {
      message: {
        id: message.id,
        senderId: message.sender_id,
        body: message.body,
        createdAt: message.created_at,
      } satisfies MessageItem,
    };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => conversationIdSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("participant_a, participant_b")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("Konversation nicht gefunden.");
    assertParticipant(conversation, userId);
    const { error } = await supabase.from("conversation_reads").upsert(
      {
        conversation_id: data.conversationId,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" },
    );
    if (error) throw error;
    return { success: true };
  });

const startConversationSchema = z.object({
  otherUserId: z.string().uuid(),
  gigId: z.string().uuid().optional().nullable(),
  listingId: z.string().uuid().optional().nullable(),
});

/**
 * Findet eine bestehende Konversation mit diesem Nutzer (im selben Kontext:
 * gleicher Auftrag/gleiches Angebot, oder beide ohne Kontext) oder legt eine
 * neue an. Ohne diese Funktion gäbe es keinen Weg, ein Gespräch überhaupt zu
 * beginnen — man könnte nur auf bereits existierende Konversationen antworten.
 */
export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => startConversationSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (data.otherUserId === userId) {
      throw new Error("Du kannst nicht mit dir selbst chatten.");
    }

    const [participantA, participantB] =
      userId < data.otherUserId
        ? [userId, data.otherUserId]
        : [data.otherUserId, userId];
    const gigId = data.gigId ?? null;
    const listingId = data.listingId ?? null;

    let existingQuery = supabase
      .from("conversations")
      .select("id")
      .eq("participant_a", participantA)
      .eq("participant_b", participantB);
    existingQuery = gigId
      ? existingQuery.eq("gig_id", gigId)
      : existingQuery.is("gig_id", null);
    existingQuery = listingId
      ? existingQuery.eq("listing_id", listingId)
      : existingQuery.is("listing_id", null);

    const { data: existing, error: existingError } =
      await existingQuery.maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { conversationId: existing.id };

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        participant_a: participantA,
        participant_b: participantB,
        gig_id: gigId,
        listing_id: listingId,
      })
      .select("id")
      .single();
    if (error) throw error;

    return { conversationId: created.id };
  });
