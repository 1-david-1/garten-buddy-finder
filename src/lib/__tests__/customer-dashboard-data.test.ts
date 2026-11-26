import { describe, expect, it } from "vitest";
import {
  appointmentCalendar,
  awaitsPaymentRelease,
  budgetKind,
  countGigGroups,
  deriveCustomerTasks,
  gigJourney,
  JOURNEY_STEPS,
  monthlyBudget,
  OTHER_SERVICE,
  pickNextAppointment,
  relativeDay,
  serviceBreakdown,
  sumBudget,
  upcomingAppointments,
  type GigLike,
} from "../customer-dashboard-data";

const gig = (over: Partial<GigLike> & { id: string }): GigLike => ({
  title: `Auftrag ${over.id}`,
  status: "open",
  scheduled_at: null,
  assigned_helper_id: null,
  budget_cents: 5000,
  ...over,
});

describe("Kunden-Dashboard: Aufgaben", () => {
  it("leitet Aufgaben aus Auftragsstatus und Zahlung ab; Zahlungen zuerst, Wartendes zuletzt", () => {
    const tasks = deriveCustomerTasks(
      [
        gig({ id: "1", status: "pending_helper", scheduled_at: "2026-12-01T10:00:00Z" }),
        gig({ id: "2", status: "negotiating" }),
        gig({ id: "3", status: "pending_helper" }),
        gig({ id: "4", status: "completed", assigned_helper_id: "h", reviews: [] }),
        gig({ id: "5", status: "completed", assigned_helper_id: "h", reviews: [{ id: "r", direction: "customer_to_helper" }] }),
        gig({ id: "6", status: "completed", assigned_helper_id: "h" }),
        gig({ id: "7", status: "open" }),
        gig({ id: "8", status: "completed", assigned_helper_id: "h", payment_state: "held", reviews: [] }),
      ],
      2,
    );
    expect(tasks.map((t) => t.key)).toEqual([
      "pay-8",
      "negotiating-2",
      "date-3",
      "review-4",
      "unread-messages",
      "waiting-1",
    ]);
    const pay = tasks[0];
    expect(pay.cta).toBe("Zahlung freigeben");
    const review = tasks.find((t) => t.key === "review-4");
    expect(review?.gigId).toBe("4");
    expect(review?.tab).toBe("past");
    expect(tasks[4].title).toBe("2 ungelesene Nachrichten");
    expect(tasks[4].target).toBe("messages");
    expect(tasks[5].tone).toBe("info");
  });

  it("berücksichtigt die Bewertungsrichtung: Helfer-Bewertung versteckt nicht den Kunden-Button", () => {
    const helperOnly = gig({
      id: "only-helper",
      status: "completed",
      assigned_helper_id: "h",
      reviews: [{ id: "r2", direction: "helper_to_customer" }],
    });
    const both = gig({
      id: "both",
      status: "completed",
      assigned_helper_id: "h",
      reviews: [
        { id: "r2", direction: "helper_to_customer" },
        { id: "r1", direction: "customer_to_helper" },
      ],
    });
    const tasks = deriveCustomerTasks([helperOnly, both], 0);
    expect(tasks.map((t) => t.key)).toEqual(["review-only-helper"]);
  });

  it("fragt nach der Zahlung nur, solange sie wirklich freigegeben werden kann", () => {
    const done = (payment_state: string | null) =>
      gig({ id: "x", status: "completed", assigned_helper_id: "h", payment_state, reviews: [{ id: "r", direction: "customer_to_helper" }] });
    expect(awaitsPaymentRelease(done("held"))).toBe(true);
    expect(awaitsPaymentRelease(done("pending"))).toBe(true);
    expect(awaitsPaymentRelease(done("releasing"))).toBe(true);
    expect(awaitsPaymentRelease(done("paid_out"))).toBe(false);
    expect(awaitsPaymentRelease(done("disputed"))).toBe(false);
    expect(awaitsPaymentRelease(done("cancelled"))).toBe(false);
    expect(awaitsPaymentRelease(done(null))).toBe(false);
    expect(deriveCustomerTasks([done("paid_out")], 0)).toEqual([]);
    expect(deriveCustomerTasks([done("disputed")], 0)).toEqual([]);
  });

  it("meldet keine Aufgaben, wenn nichts ansteht", () => {
    expect(deriveCustomerTasks([gig({ id: "1" })], 0)).toEqual([]);
    expect(deriveCustomerTasks([], 1)[0].title).toBe("1 ungelesene Nachricht");
  });
});

describe("Kunden-Dashboard: nächster Termin (deutsche Ortszeit)", () => {
  // 18.11.2026, 12:00 Uhr in Deutschland (Winterzeit = UTC+1)
  const now = new Date("2026-11-18T11:00:00Z");

  it("nimmt den frühesten bestätigten Termin ab heute", () => {
    const next = pickNextAppointment(
      [
        gig({ id: "past", status: "assigned", scheduled_at: "2026-11-10T08:00:00Z" }),
        gig({ id: "later", status: "assigned", scheduled_at: "2026-11-25T08:00:00Z" }),
        gig({ id: "soon", status: "assigned", scheduled_at: "2026-11-19T08:00:00Z" }),
        gig({ id: "open", status: "open", scheduled_at: "2026-11-18T14:00:00Z" }),
      ],
      now,
    );
    expect(next?.id).toBe("soon");
  });

  it("zählt einen Termin von heute früh noch zu heute", () => {
    const next = pickNextAppointment(
      [gig({ id: "morning", status: "assigned", scheduled_at: "2026-11-18T07:00:00Z" })],
      now,
    );
    expect(next?.id).toBe("morning");
  });

  it("zeigt laufende Aufträge zuerst und kennt den Fall ohne Termin", () => {
    const running = gig({ id: "run", status: "in_progress" });
    const planned = gig({ id: "plan", status: "assigned", scheduled_at: "2026-11-19T08:00:00Z" });
    expect(pickNextAppointment([planned, running], now)?.id).toBe("run");
    expect(pickNextAppointment([gig({ id: "x" })], now)).toBeNull();
    expect(pickNextAppointment([], now)).toBeNull();
  });
});

describe("Kunden-Dashboard: Zähler und Datum", () => {
  it("zählt offene, geplante und erledigte Aufträge; unbezahlte erledigte zählen als offen", () => {
    expect(
      countGigGroups([
        gig({ id: "1", status: "open" }),
        gig({ id: "2", status: "negotiating" }),
        gig({ id: "3", status: "pending_helper" }),
        gig({ id: "4", status: "assigned" }),
        gig({ id: "5", status: "in_progress" }),
        gig({ id: "6", status: "completed", payment_state: "paid_out" }),
        gig({ id: "7", status: "cancelled" }),
        gig({ id: "8", status: "draft" }),
        gig({ id: "9", status: "completed", payment_state: "held" }),
      ]),
    ).toEqual({ open: 4, planned: 2, done: 1 });
  });

  it("beschreibt Tage relativ - nach deutschem Kalendertag, nicht nach UTC", () => {
    // 18.11.2026, 23:30 Uhr in Deutschland (= 22:30 UTC)
    const now = new Date("2026-11-18T22:30:00Z");
    expect(relativeDay("2026-11-18T06:00:00Z", now)).toBe("Heute");
    // 23:30 UTC ist in Deutschland schon 00:30 am 19.11. - in UTC wäre es noch "heute"
    expect(relativeDay("2026-11-18T23:30:00Z", now)).toBe("Morgen");
    expect(relativeDay("2026-11-22T06:00:00Z", now)).toBe("In 4 Tagen");
    expect(relativeDay("2026-12-20T06:00:00Z", now)).toBe("");
    expect(relativeDay("2026-11-10T06:00:00Z", now)).toBe("");
  });
});

describe("Kunden-Dashboard: Grafiken", () => {
  // Mittwoch, 18. November 2026, 11 Uhr deutscher Zeit
  const now = new Date("2026-11-18T10:00:00Z");

  it("zeigt den Weg eines Auftrags von der Anfrage bis zur Zahlung", () => {
    const j = (status: string, payment_state?: string | null) => gigJourney({ status, payment_state });
    expect(JOURNEY_STEPS).toHaveLength(5);
    expect(j("open")).toEqual({ reached: 0, finished: false });
    expect(j("negotiating")).toEqual({ reached: 0, finished: false });
    expect(j("pending_helper")).toEqual({ reached: 0, finished: false });
    expect(j("assigned")).toEqual({ reached: 1, finished: false });
    expect(j("in_progress")).toEqual({ reached: 2, finished: false });
    // Erledigt, Zahlung wartet auf den Kunden oder wird geklärt: noch nicht fertig
    expect(j("completed", "held")).toEqual({ reached: 3, finished: false });
    expect(j("completed", "disputed")).toEqual({ reached: 3, finished: false });
    // Zahlung freigegeben: alles erreicht
    expect(j("completed", "paid_out")).toEqual({ reached: 4, finished: true });
    // Kein Zahlungsvorgang: fertig, aber "Bezahlt" bleibt unerreicht
    expect(j("completed", null)).toEqual({ reached: 3, finished: true });
    expect(j("completed", "cancelled")).toEqual({ reached: 3, finished: true });
    // Stornierte Aufträge und Entwürfe haben keinen Weg
    expect(j("cancelled")).toBeNull();
    expect(j("draft")).toBeNull();
  });

  it("rechnet nur Geld ein, das wirklich im Spiel ist", () => {
    expect(budgetKind({ status: "open" })).toBeNull();
    expect(budgetKind({ status: "pending_helper" })).toBeNull();
    expect(budgetKind({ status: "cancelled" })).toBeNull();
    expect(budgetKind({ status: "assigned" })).toBe("planned");
    expect(budgetKind({ status: "in_progress" })).toBe("planned");
    expect(budgetKind({ status: "completed", payment_state: "held" })).toBe("planned");
    expect(budgetKind({ status: "completed", payment_state: "disputed" })).toBe("planned");
    expect(budgetKind({ status: "completed", payment_state: "paid_out" })).toBe("paid");
    expect(budgetKind({ status: "completed", payment_state: null })).toBeNull();
    expect(budgetKind({ status: "completed", payment_state: "cancelled" })).toBeNull();

    expect(
      sumBudget([
        gig({ id: "1", status: "completed", payment_state: "paid_out", budget_cents: 4000 }),
        gig({ id: "2", status: "completed", payment_state: "paid_out", budget_cents: 2500 }),
        gig({ id: "3", status: "assigned", budget_cents: 3000 }),
        gig({ id: "4", status: "open", budget_cents: 9900 }),
      ]),
    ).toEqual({ paidCents: 6500, plannedCents: 3000 });
  });

  it("verteilt das Budget auf Monate in deutscher Ortszeit (drei zurück, zwei voraus)", () => {
    const months = monthlyBudget(
      [
        gig({ id: "1", status: "completed", payment_state: "paid_out", scheduled_at: "2026-10-05T08:00:00Z", budget_cents: 5000 }),
        gig({ id: "2", status: "assigned", scheduled_at: "2026-11-25T08:00:00Z", budget_cents: 3000 }),
        // 23:30 UTC am 30.11. ist in Deutschland schon der 1.12. - gehört in den Dezember
        gig({ id: "3", status: "assigned", scheduled_at: "2026-11-30T23:30:00Z", budget_cents: 1200 }),
        // ohne Termin zählt das Erstellungsdatum
        gig({ id: "4", status: "completed", payment_state: "paid_out", created_at: "2026-09-10T08:00:00Z", budget_cents: 800 }),
        // außerhalb des Zeitfensters
        gig({ id: "5", status: "assigned", scheduled_at: "2027-06-01T08:00:00Z", budget_cents: 7777 }),
        // kein Geld im Spiel
        gig({ id: "6", status: "pending_helper", scheduled_at: "2026-11-20T08:00:00Z", budget_cents: 9999 }),
      ],
      now,
    );
    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(months.map((m) => m.label)).toEqual(["Aug", "Sep", "Okt", "Nov", "Dez", "Jan"]);
    expect(months.filter((m) => m.current).map((m) => m.key)).toEqual(["2026-11"]);
    const by = Object.fromEntries(months.map((m) => [m.key, [m.paidCents, m.plannedCents]]));
    expect(by["2026-09"]).toEqual([800, 0]);
    expect(by["2026-10"]).toEqual([5000, 0]);
    expect(by["2026-11"]).toEqual([0, 3000]);
    expect(by["2026-12"]).toEqual([0, 1200]);
    expect(by["2026-08"]).toEqual([0, 0]);
    expect(by["2027-01"]).toEqual([0, 0]);
  });

  it("kommt mit dem Jahreswechsel und kaputten Datumsangaben zurecht", () => {
    const months = monthlyBudget(
      [gig({ id: "1", status: "assigned", scheduled_at: "kein-datum", budget_cents: 100 })],
      new Date("2026-12-20T10:00:00Z"),
    );
    expect(months.map((m) => m.title)).toEqual(["Sep 2026", "Okt 2026", "Nov 2026", "Dez 2026", "Jan 2027", "Feb 2027"]);
    expect(months.every((m) => m.paidCents === 0 && m.plannedCents === 0)).toBe(true);
  });

  it("zählt Leistungen, die häufigste zuerst, und fasst Seltenes zusammen", () => {
    expect(serviceBreakdown([])).toEqual([]);
    expect(serviceBreakdown([gig({ id: "x", status: "cancelled", service_type: "laub" })])).toEqual([]);

    const mk = (id: string, service_type: string | null, status = "open") => gig({ id: `${id}`, status, service_type });
    const rows = serviceBreakdown(
      [
        mk("1", "rasenmähen"),
        mk("2", "rasenmähen"),
        mk("3", "rasenmähen"),
        mk("4", "laub"),
        mk("5", "laub"),
        mk("6", "unkraut"),
        mk("7", "baumpflege"),
        mk("8", "heckenschnitt"),
        mk("9", "bewässerung"),
        mk("10", "laub", "cancelled"),
      ],
      3,
    );
    expect(rows.map((r) => r.value)).toEqual(["rasenmähen", "laub", "baumpflege", OTHER_SERVICE]);
    expect(rows.map((r) => r.count)).toEqual([3, 2, 1, 3]);
    expect(rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1, 10);

    // Nur eine Leistung mehr als erlaubt: sie steht mit Namen da statt als "Weitere"
    const four = serviceBreakdown([mk("1", "a"), mk("2", "b"), mk("3", "c"), mk("4", "d")], 3);
    expect(four.map((r) => r.value)).toEqual(["a", "b", "c", "d"]);
    // Fehlende Leistung zählt als "sonstiges"
    expect(serviceBreakdown([mk("1", null)]).map((r) => r.value)).toEqual(["sonstiges"]);
  });

  it("baut einen Mini-Kalender für zwei Wochen ab Montag", () => {
    const days = appointmentCalendar(
      [
        gig({ id: "1", status: "assigned", scheduled_at: "2026-11-20T08:00:00Z" }),
        gig({ id: "2", status: "in_progress", scheduled_at: "2026-11-20T12:00:00Z" }),
        gig({ id: "3", status: "pending_helper", scheduled_at: "2026-11-24T08:00:00Z" }),
        gig({ id: "4", status: "open", scheduled_at: "2026-11-19T08:00:00Z" }),
        gig({ id: "5", status: "assigned", scheduled_at: "2026-12-30T08:00:00Z" }),
        gig({ id: "6", status: "assigned", scheduled_at: null }),
      ],
      now,
    );
    expect(days).toHaveLength(14);
    expect(days[0].key).toBe("2026-11-16");
    expect(days[0].isoWeekday).toBe(1);
    expect(days[13].key).toBe("2026-11-29");
    expect(days[13].isoWeekday).toBe(7);
    expect(days.filter((d) => d.today).map((d) => d.key)).toEqual(["2026-11-18"]);
    expect(days.filter((d) => d.past).map((d) => d.key)).toEqual(["2026-11-16", "2026-11-17"]);
    const at = (key: string) => days.find((d) => d.key === key)!;
    expect(at("2026-11-20")).toMatchObject({ confirmed: 2, requested: 0 });
    expect(at("2026-11-24")).toMatchObject({ confirmed: 0, requested: 1 });
    // Offene Aufträge sind noch kein Termin, weit entfernte liegen außerhalb
    expect(at("2026-11-19")).toMatchObject({ confirmed: 0, requested: 0 });
    expect(days.reduce((n, d) => n + d.confirmed + d.requested, 0)).toBe(3);
  });

  it("der Kalender beginnt auch sonntags in der laufenden Woche", () => {
    // Sonntag, 22. November 2026
    const days = appointmentCalendar([], new Date("2026-11-22T10:00:00Z"));
    expect(days[0].key).toBe("2026-11-16");
    expect(days[6].today).toBe(true);
    expect(days[6].isoWeekday).toBe(7);
  });

  it("nennt nach dem nächsten Einsatz die folgenden bestätigten Termine", () => {
    const gigs = [
      gig({ id: "late", status: "assigned", scheduled_at: "2026-11-27T08:00:00Z" }),
      gig({ id: "running", status: "in_progress", scheduled_at: "2026-11-18T07:00:00Z" }),
      gig({ id: "soon", status: "assigned", scheduled_at: "2026-11-19T08:00:00Z" }),
      gig({ id: "past", status: "assigned", scheduled_at: "2026-11-10T08:00:00Z" }),
      gig({ id: "ask", status: "pending_helper", scheduled_at: "2026-11-20T08:00:00Z" }),
      gig({ id: "mid", status: "assigned", scheduled_at: "2026-11-23T08:00:00Z" }),
    ];
    expect(pickNextAppointment(gigs, now)?.id).toBe("running");
    expect(upcomingAppointments(gigs, now).map((g) => g.id)).toEqual(["soon", "mid"]);
    expect(upcomingAppointments(gigs, now, 5).map((g) => g.id)).toEqual(["soon", "mid", "late"]);
    expect(upcomingAppointments(gigs, now, 1).map((g) => g.id)).toEqual(["soon"]);
    // Nur ein Termin: nichts danach
    expect(upcomingAppointments([gigs[2]], now)).toEqual([]);
    // Ein laufender Auftrag ohne Datum ist der nächste, steht aber nicht in der Liste "danach"
    const noDate = [gig({ id: "r", status: "in_progress" }), gig({ id: "r2", status: "in_progress" })];
    expect(upcomingAppointments(noDate, now)).toEqual([]);
  });
});
