"use client";

import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Star, MapPin, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Helper {
  id: string;
  name: string;
  title: string;
  location: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  hourlyRate: number; // in cents
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface DaySchedule {
  date: string;
  dayName: string;
  dayNumber: number;
  slots: TimeSlot[];
  hasAvailability: boolean;
}

interface BookingSchedulerProps {
  helper?: Helper;
  weekSchedule?: DaySchedule[];
  onBookingRequest?: (data: BookingData) => void;
  onWeekChange?: (direction: "prev" | "next") => void;
  enableAnimations?: boolean;
  className?: string;
}

interface BookingData {
  helperId: string;
  date: string;
  time: string;
  serviceType: string;
  address: string;
  budgetCents: number;
}

const defaultHelper: Helper = {
  id: "1",
  name: "Max Mustermann",
  title: "Gartenhelfer",
  location: "Berlin-Mitte",
  rating: 4.8,
  reviewCount: 12,
  imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop",
  hourlyRate: 2500, // €25
};

const serviceTypes = [
  "Rasenmähen",
  "Heckeschneiden",
  "Unkraut jäten",
  "Blumen pflanzen",
  "Laub entfernen",
  "Gartenarbeit allgemein",
];

export function BookingScheduler({
  helper = defaultHelper,
  weekSchedule,
  onBookingRequest,
  onWeekChange,
  enableAnimations = true,
  className,
}: BookingSchedulerProps) {
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [weekRange] = useState("Aug 17 - Aug 22");
  const [showConfirmationView, setShowConfirmationView] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ day: string; time: string; dayName: string } | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [address, setAddress] = useState("");
  const [budget, setBudget] = useState("");
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Default week schedule
  const defaultWeek: DaySchedule[] = [
    {
      date: "Aug 17",
      dayName: "Heute",
      dayNumber: 17,
      hasAvailability: true,
      slots: [
        { time: "09:00", available: true },
        { time: "10:00", available: true },
        { time: "11:00", available: true },
        { time: "12:00", available: true },
        { time: "13:00", available: false },
        { time: "14:00", available: true },
        { time: "15:00", available: true },
        { time: "16:00", available: true },
      ],
    },
    {
      date: "Aug 18",
      dayName: "Di",
      dayNumber: 18,
      hasAvailability: true,
      slots: [
        { time: "09:00", available: true },
        { time: "10:00", available: true },
        { time: "14:00", available: true },
        { time: "15:00", available: true },
      ],
    },
    {
      date: "Aug 19",
      dayName: "Mi",
      dayNumber: 19,
      hasAvailability: true,
      slots: [
        { time: "10:00", available: true },
        { time: "11:00", available: true },
        { time: "13:00", available: true },
        { time: "14:00", available: true },
      ],
    },
    {
      date: "Aug 20",
      dayName: "Do",
      dayNumber: 20,
      hasAvailability: false,
      slots: [],
    },
    {
      date: "Aug 21",
      dayName: "Fr",
      dayNumber: 21,
      hasAvailability: true,
      slots: [
        { time: "09:00", available: true },
        { time: "10:00", available: true },
        { time: "11:00", available: true },
      ],
    },
    {
      date: "Aug 22",
      dayName: "Sa",
      dayNumber: 22,
      hasAvailability: true,
      slots: [
        { time: "10:00", available: true },
        { time: "11:00", available: true },
        { time: "12:00", available: true },
      ],
    },
  ];

  const schedule = weekSchedule || defaultWeek;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLocationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLocationDropdownOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleTimeSlotClick = (day: string, time: string) => {
    const dayInfo = schedule.find((d) => d.date === day);
    setSelectedTimeSlot({ day, time, dayName: dayInfo?.dayName || day });
    setShowConfirmationView(true);
  };

  const handleBackToMain = () => {
    setShowConfirmationView(false);
    setSelectedTimeSlot(null);
  };

  const handleConfirmBooking = () => {
    if (!selectedTimeSlot || !serviceType || !address || !budget) return;
    
    onBookingRequest?.({
      helperId: helper.id,
      date: selectedTimeSlot.day,
      time: selectedTimeSlot.time,
      serviceType,
      address,
      budgetCents: parseInt(budget) * 100,
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -25, scale: 0.95 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { type: "spring", stiffness: 400, damping: 28 },
    },
  };

  const formatPrice = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

  return (
    <motion.div
      variants={shouldAnimate ? containerVariants : {}}
      initial={shouldAnimate ? "hidden" : "visible"}
      animate="visible"
      className={cn("bg-card rounded-xl border border-border/50 shadow-lg overflow-hidden max-w-2xl", className)}
    >
      <motion.div
        initial={false}
        animate={{
          y: showConfirmationView ? "-20px" : "0px",
          opacity: showConfirmationView ? 0.3 : 1,
          scale: showConfirmationView ? 0.95 : 1,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full"
      >
        {/* Helper Profile Header */}
        <motion.div variants={shouldAnimate ? itemVariants : {}} className="p-6 pb-4">
          <div className="flex items-start justify-between gap-6">
            <motion.div whileHover={shouldAnimate ? { scale: 1.05 } : {}} className="flex-shrink-0">
              <img src={helper.imageUrl} alt={helper.name} className="w-16 h-16 rounded-lg object-cover" />
            </motion.div>

            <div className="flex-1 min-w-0 space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{helper.name}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  <span className="font-medium">{helper.rating}</span>
                  <span className="underline hover:text-foreground cursor-pointer">({helper.reviewCount} Bewertungen)</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{helper.location}</span>
              </div>
            </div>

            <motion.div
              initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
              animate={shouldAnimate ? { opacity: 1, scale: 1 } : {}}
              className="text-right flex-shrink-0"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Stundensatz</p>
              <p className="text-2xl font-bold text-emerald-500">{formatPrice(helper.hourlyRate)}</p>
            </motion.div>
          </div>
        </motion.div>

        {/* Service Type Selector */}
        <motion.div variants={shouldAnimate ? itemVariants : {}} className="px-6 pb-4">
          <label className="block text-sm text-muted-foreground mb-2">Art der Gartenarbeit</label>
          <div className="flex flex-wrap gap-2">
            {serviceTypes.map((type) => (
              <motion.button
                key={type}
                whileHover={shouldAnimate ? { scale: 1.05 } : {}}
                whileTap={shouldAnimate ? { scale: 0.95 } : {}}
                onClick={() => setServiceType(type)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  serviceType === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border/50 hover:border-border text-foreground"
                )}
              >
                {type}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Address Input */}
        <motion.div variants={shouldAnimate ? itemVariants : {}} className="px-6 pb-4">
          <label className="block text-sm text-muted-foreground mb-2">Adresse</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ihre Adresse"
            className="w-full p-3 bg-muted rounded-lg border border-border/50 hover:border-border transition-colors text-foreground placeholder:text-muted-foreground"
          />
        </motion.div>

        {/* Budget Input */}
        <motion.div variants={shouldAnimate ? itemVariants : {}} className="px-6 pb-4">
          <label className="block text-sm text-muted-foreground mb-2">Budget (€)</label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="z.B. 50"
            className="w-full p-3 bg-muted rounded-lg border border-border/50 hover:border-border transition-colors text-foreground placeholder:text-muted-foreground"
          />
        </motion.div>

        <motion.div variants={shouldAnimate ? itemVariants : {}} className="mx-6 border-t border-border/50" />

        {/* Week Navigation */}
        <motion.div variants={shouldAnimate ? itemVariants : {}} className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <motion.button
              whileHover={shouldAnimate ? { scale: 1.05 } : {}}
              whileTap={shouldAnimate ? { scale: 0.95 } : {}}
              onClick={() => onWeekChange?.("prev")}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </motion.button>
            <h3 className="font-semibold text-foreground">{weekRange}</h3>
            <motion.button
              whileHover={shouldAnimate ? { scale: 1.05 } : {}}
              whileTap={shouldAnimate ? { scale: 0.95 } : {}}
              onClick={() => onWeekChange?.("next")}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </motion.button>
          </div>
        </motion.div>

        {/* Daily Schedule */}
        <motion.div variants={shouldAnimate ? itemVariants : {}} className="px-6 pb-6 space-y-4">
          {schedule.map((day) => (
            <motion.div key={day.date} className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-foreground">
                  {day.dayName}, {day.date}
                </h4>
                {!day.hasAvailability && (
                  <span className="text-sm text-muted-foreground">Keine Verfügbarkeit</span>
                )}
              </div>

              {day.hasAvailability && (
                <div className="flex flex-wrap gap-2">
                  {day.slots.map((slot) => (
                    <motion.button
                      key={`${day.date}-${slot.time}`}
                      variants={shouldAnimate ? { hidden: { opacity: 0, scale: 0.8 }, visible: { opacity: 1, scale: 1 } } : {}}
                      whileHover={shouldAnimate && slot.available ? { scale: 1.05, y: -2 } : {}}
                      whileTap={shouldAnimate && slot.available ? { scale: 0.98 } : {}}
                      onClick={() => slot.available && handleTimeSlotClick(day.date, slot.time)}
                      disabled={!slot.available}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                        slot.available
                          ? "bg-background border-border/50 hover:border-border hover:bg-muted cursor-pointer text-foreground"
                          : "bg-muted/50 border-border/30 text-muted-foreground cursor-not-allowed opacity-60"
                      )}
                    >
                      <Clock className="w-3 h-3 inline-block mr-1" />
                      {slot.time}
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Confirmation View */}
      <motion.div
        initial={false}
        animate={{ y: showConfirmationView ? "0%" : "100%", opacity: showConfirmationView ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute top-0 left-0 w-full h-full bg-card"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleBackToMain} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Zurück</span>
            </motion.button>
            <h3 className="text-lg font-semibold text-foreground">Buchung bestätigen</h3>
            <div></div>
          </div>

          {/* Helper info summary */}
          <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
            <img src={helper.imageUrl} alt={helper.name} className="w-12 h-12 rounded-lg object-cover" />
            <div>
              <h4 className="font-semibold text-foreground">{helper.name}</h4>
              <p className="text-sm text-muted-foreground">{helper.title}</p>
            </div>
          </div>

          {selectedTimeSlot && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">Ihr Termin</p>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-lg font-semibold text-foreground">
                    {selectedTimeSlot.dayName}, {selectedTimeSlot.day}
                  </p>
                  <p className="text-xl font-bold text-primary">
                    <Clock className="w-4 h-4 inline mr-1" />
                    {selectedTimeSlot.time}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Leistung:</span>
                  <span className="text-foreground font-medium">{serviceType || "-"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Adresse:</span>
                  <span className="text-foreground font-medium">{address || "-"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Budget:</span>
                  <span className="text-foreground font-medium">{budget ? `€${budget}` : "-"}</span>
                </div>
              </div>
            </div>
          )}

          <motion.button
            whileHover={shouldAnimate ? { scale: 1.02 } : {}}
            whileTap={shouldAnimate ? { scale: 0.98 } : {}}
            onClick={handleConfirmBooking}
            disabled={!selectedTimeSlot || !serviceType || !address || !budget}
            className="w-full py-3 rounded-lg font-semibold transition-all bg-primary hover:bg-primary/90 text-primary-foreground border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Buchungsanfrage senden
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
