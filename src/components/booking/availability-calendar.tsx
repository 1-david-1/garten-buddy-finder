"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DayAvailability {
  date: string;
  dayName: string;
  dayNumber: number;
  month: string;
  slots: TimeSlot[];
}

interface TimeSlot {
  time: string;
  isAvailable: boolean;
}

interface AvailabilityCalendarProps {
  initialAvailability?: DayAvailability[];
  onSave?: (availability: SavedAvailability[]) => void;
  className?: string;
}

interface SavedAvailability {
  date: string;
  time: string;
  isAvailable: boolean;
}

const timeSlots = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const monthNames = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function generateWeekDays(offset: number = 0): DayAvailability[] {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() + offset * 7 - today.getDay() + 1); // Start from Monday

  const days: DayAvailability[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);

    days.push({
      date: date.toISOString().split("T")[0],
      dayName: dayNames[date.getDay()],
      dayNumber: date.getDate(),
      month: monthNames[date.getMonth()],
      slots: timeSlots.map((time) => ({
        time,
        isAvailable: Math.random() > 0.5, // Demo: random availability
      })),
    });
  }

  return days;
}

export function AvailabilityCalendar({
  initialAvailability,
  onSave,
  className,
}: AvailabilityCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [availability, setAvailability] = useState<DayAvailability[]>(
    initialAvailability || generateWeekDays(0),
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Update availability when week changes
  useEffect(() => {
    if (!initialAvailability) {
      setAvailability(generateWeekDays(weekOffset));
    }
  }, [weekOffset, initialAvailability]);

  const toggleSlot = (dayIndex: number, slotIndex: number) => {
    const newAvailability = [...availability];
    newAvailability[dayIndex].slots[slotIndex].isAvailable =
      !newAvailability[dayIndex].slots[slotIndex].isAvailable;
    setAvailability(newAvailability);
    setHasChanges(true);
  };

  const selectAllDay = (dayIndex: number, available: boolean) => {
    const newAvailability = [...availability];
    newAvailability[dayIndex].slots = newAvailability[dayIndex].slots.map((slot) => ({
      ...slot,
      isAvailable: available,
    }));
    setAvailability(newAvailability);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);

    const savedData: SavedAvailability[] = [];
    availability.forEach((day) => {
      day.slots.forEach((slot) => {
        savedData.push({
          date: day.date,
          time: slot.time,
          isAvailable: slot.isAvailable,
        });
      });
    });

    // Call the save function
    if (onSave) {
      await onSave(savedData);
    }

    setTimeout(() => {
      setIsSaving(false);
      setHasChanges(false);
    }, 500);
  };

  const weekStart = availability[0] ? `${availability[0].dayNumber}. ${availability[0].month}` : "";
  const weekEnd = availability[6] ? `${availability[6].dayNumber}. ${availability[6].month}` : "";

  const availableCount = availability.reduce(
    (count, day) => count + day.slots.filter((s) => s.isAvailable).length,
    0,
  );

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border/50 shadow-lg overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Verfügbarkeit</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Legen Sie fest, wann Sie arbeiten können
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Verfügbare Slots</p>
            <p className="text-2xl font-bold text-primary">{availableCount}</p>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="p-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-foreground">
              {weekStart} - {weekEnd}
            </p>
          </div>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-4 space-y-4">
        {availability.map((day, dayIndex) => {
          const dayAvailableCount = day.slots.filter((s) => s.isAvailable).length;
          const isFullyAvailable = dayAvailableCount === day.slots.length;
          const isPartiallyAvailable = dayAvailableCount > 0 && !isFullyAvailable;

          return (
            <div key={day.date} className="space-y-2">
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center font-semibold",
                      isFullyAvailable
                        ? "bg-emerald-100 text-emerald-700"
                        : isPartiallyAvailable
                          ? "bg-amber-100 text-amber-700"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {day.dayNumber}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{day.dayName}</p>
                    <p className="text-xs text-muted-foreground">{day.month}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => selectAllDay(dayIndex, true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Alle
                  </button>
                  <span className="text-xs text-muted-foreground">•</span>
                  <button
                    onClick={() => selectAllDay(dayIndex, false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Keine
                  </button>
                </div>
              </div>

              {/* Time Slots */}
              <div className="flex flex-wrap gap-2 ml-13">
                {day.slots.map((slot, slotIndex) => (
                  <motion.button
                    key={slot.time}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleSlot(dayIndex, slotIndex)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-lg border transition-all",
                      slot.isAvailable
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        : "bg-muted/50 border-border/30 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {slot.isAvailable && <Check className="w-3 h-3" />}
                      {slot.time}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200"></span>
            <span>Verfügbar</span>
            <span className="w-3 h-3 rounded bg-muted/50 border border-border/30 ml-2"></span>
            <span>Nicht verfügbar</span>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Speichern...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Speichern
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
