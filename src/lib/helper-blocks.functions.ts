import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseInput, saveRecurringBlocksSchema } from "@/lib/validation";
import type { RecurringBlockRule } from "@/lib/recurring-blocks";

/** Die eigenen wiederkehrenden Sperrzeiten (Stundenplan). */
export const getMyRecurringBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ blocks: RecurringBlockRule[] }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("helper_recurring_blocks")
      .select("weekday, start_time, end_time, label, valid_from, valid_until")
      .eq("helper_id", userId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw error;
    return {
      blocks: (data ?? []).map((r) => ({
        weekday: r.weekday,
        startTime: String(r.start_time).slice(0, 5),
        endTime: String(r.end_time).slice(0, 5),
        label: r.label,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
      })),
    };
  });

/**
 * Ersetzt alle eigenen Sperrzeiten durch die übergebenen. Zuerst werden die neuen Zeilen angelegt und erst danach die
 * alten gelöscht: Schlägt das Anlegen fehl, bleibt der bisherige Stundenplan unverändert.
 */
export const saveMyRecurringBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(saveRecurringBlocksSchema, data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => String(r.role).startsWith("helper_"))) {
      throw new Error("Sperrzeiten können nur Helfer festlegen.");
    }

    const { data: existing, error: loadError } = await supabase
      .from("helper_recurring_blocks")
      .select("id")
      .eq("helper_id", userId);
    if (loadError) throw loadError;
    const oldIds = (existing ?? []).map((r) => r.id);

    if (data.blocks.length > 0) {
      // Obergrenze der Datenbank (100 pro Helfer) gilt auch während des Austauschs: alte Zeilen zählen mit.
      if (oldIds.length + data.blocks.length > 100) {
        const { error: clearError } = await supabase.from("helper_recurring_blocks").delete().eq("helper_id", userId);
        if (clearError) throw clearError;
        oldIds.length = 0;
      }
      const { error: insertError } = await supabase.from("helper_recurring_blocks").insert(
        data.blocks.map((b) => ({
          helper_id: userId,
          weekday: b.weekday,
          start_time: b.startTime,
          end_time: b.endTime,
          label: b.label?.trim() ? b.label.trim() : null,
          valid_from: b.validFrom || null,
          valid_until: b.validUntil || null,
        })),
      );
      if (insertError) throw insertError;
    }

    if (oldIds.length > 0) {
      const { error: deleteError } = await supabase.from("helper_recurring_blocks").delete().in("id", oldIds);
      if (deleteError) throw deleteError;
    }

    return { count: data.blocks.length };
  });
