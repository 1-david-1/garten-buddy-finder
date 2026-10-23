import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { checkName } from "@/lib/sanitize";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Building2,
  Pencil,
  Save,
  X,
  Star,
  Shield,
  Heart,
  Bell,
  Trash2,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getMyProfile,
  updateProfile,
  getMyFavorites,
  updateNotificationPrefs,
  deleteMyAccount,
} from "@/lib/profile.functions";
import { toast } from "sonner";
import { VerificationCard } from "@/components/verification-card";
import { FREIBURG_AREA_ERROR, isWithinFreiburgArea } from "@/lib/freiburg-area";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

const ROLE_LABELS: Record<string, string> = {
  customer: "Auftraggeber",
  helper_youth: "Jugendlicher Helfer (13–17)",
  helper_adult: "Nachbar-Helfer (18+)",
  helper_pro: "Profi-Gärtner",
};

function ProfilePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const getProfileFn = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateProfile);
  const getFavoritesFn = useServerFn(getMyFavorites);
  const deleteAccountFn = useServerFn(deleteMyAccount);

  const profileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getProfileFn(),
  });

  const favoritesQuery = useQuery({
    queryKey: ["my-favorites"],
    queryFn: () => getFavoritesFn(),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      // Namen streng prüfen (Positivliste), damit kein Code im Anzeigenamen landet.
      const name = checkName(form.displayName ?? "", "displayName");
      if (!name.ok) throw new Error(name.error);
      const city = (form.city ?? "").trim() ? checkName(form.city ?? "", "city") : { ok: true as const, value: "" };
      if (!city.ok) throw new Error(city.error);
      const business = (form.businessName ?? "").trim()
        ? checkName(form.businessName ?? "", "businessName")
        : { ok: true as const, value: "" };
      if (!business.ok) throw new Error(business.error);
      const rolesNow = profileQuery.data?.roles ?? [];
      const isCustomer = rolesNow.includes("customer");
      if (isCustomer && !isWithinFreiburgArea(form.postalCode)) {
        throw new Error(FREIBURG_AREA_ERROR);
      }
      return updateProfileFn({
        data: {
          displayName: name.value,
          city: city.value,
          postalCode: form.postalCode,
          bio: form.bio,
          businessName: business.value,
          ustId: form.ustId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Profil gespeichert!");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setEditing(false);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccountFn({ data: { reason: deleteReason.trim() } }),
    onSuccess: async () => {
      toast.success("Konto gelöscht");
      setDeleteOpen(false);
      await signOut();
      navigate({ to: "/" });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const notificationPrefsFn = useServerFn(updateNotificationPrefs);
  const notificationPrefsMutation = useMutation({
    mutationFn: (input: {
      enabled?: boolean;
      newBid?: boolean;
      bidUpdates?: boolean;
      gigUpdates?: boolean;
    }) => notificationPrefsFn({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["my-profile"] }),
    onError: (err) => toast.error((err as Error).message),
  });

  const startEditing = () => {
    const p = profileQuery.data?.profile;
    if (!p) return;
    setForm({
      displayName: p.display_name ?? "",
      city: p.city ?? "",
      postalCode: p.postal_code ?? "",
      bio: p.bio ?? "",
      businessName: p.business_name ?? "",
      ustId: p.ust_id ?? "",
    });
    setEditing(true);
  };

  const { navItems } = useAppNavItems();

  const profile = profileQuery.data?.profile;
  const roles = profileQuery.data?.roles ?? [];
  const isHelper = roles.some((r) => r.startsWith("helper_"));
  const isCustomer = roles.includes("customer");
  const isAdmin = roles.includes("admin");
  const isPro = roles.includes("helper_pro");
  const favorites = favoritesQuery.data?.favorites ?? [];
  const rawPrefs = (profile?.notification_prefs ?? {}) as Record<
    string,
    boolean
  >;
  const notificationPrefs = {
    enabled: rawPrefs.enabled ?? true,
    newBid: rawPrefs.new_bid ?? true,
    bidUpdates: rawPrefs.bid_updates ?? true,
    gigUpdates: rawPrefs.gig_updates ?? true,
  };

  return (
    <DashboardShell title="Mein Profil" navItems={navItems} activeKey="profile">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand text-2xl">Mein Profil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verwalte deine persönlichen Daten und Einstellungen.
          </p>
        </div>
        {!editing && profile && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="size-4 mr-2" />
            Bearbeiten
          </Button>
        )}
      </div>

      {profileQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : !profile ? (
        <p className="text-sm text-destructive">
          Profil konnte nicht geladen werden.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Hauptprofil */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardHeader className="pb-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary/15 text-primary text-xl font-semibold">
                      {(profile.display_name ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    {!editing ? (
                      <>
                        <h2 className="text-xl font-bold">
                          {profile.display_name || "Name nicht gesetzt"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {profileQuery.data?.email}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {roles.map((role) => (
                            <Badge
                              key={role}
                              variant="secondary"
                              className="text-xs"
                            >
                              {ROLE_LABELS[role] ?? role}
                            </Badge>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Anzeigename *</Label>
                          <Input
                            value={form.displayName ?? ""}
                            maxLength={60}
                            autoComplete="nickname"
                            onChange={(e) =>
                              setForm({ ...form, displayName: e.target.value })
                            }
                            className="mt-1 h-8"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              <Separator className="bg-glass-border" />

              <CardContent className="pt-5 space-y-4">
                {!editing ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          <MapPin className="size-3" /> Standort
                        </p>
                        <p className="font-medium">
                          {[profile.city, profile.postal_code]
                            .filter(Boolean)
                            .join(" · ") || "Nicht angegeben"}
                        </p>
                      </div>
                      {isPro && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                            <Building2 className="size-3" /> Firmenname
                          </p>
                          <p className="font-medium">
                            {profile.business_name || "—"}
                          </p>
                        </div>
                      )}
                    </div>

                    {profile.bio && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Über mich
                        </p>
                        <p className="text-sm">{profile.bio}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Stadt</Label>
                        <Input
                          value={form.city ?? ""}
                          onChange={(e) =>
                            setForm({ ...form, city: e.target.value })
                          }
                          placeholder="Freiburg"
                          className="mt-1 h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Postleitzahl</Label>
                        <Input
                          value={form.postalCode ?? ""}
                          onChange={(e) =>
                            setForm({ ...form, postalCode: e.target.value })
                          }
                          placeholder="79100"
                          className="mt-1 h-8"
                        />
                      </div>
                    </div>
                    {isCustomer && (
                      <p className="text-xs text-muted-foreground">
                        Als Auftraggeber aktuell nur Freiburg und Umgebung (max. 10&nbsp;km).
                      </p>
                    )}

                    {isPro && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Firmenname</Label>
                          <Input
                            value={form.businessName ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, businessName: e.target.value })
                            }
                            className="mt-1 h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">USt-IdNr.</Label>
                          <Input
                            value={form.ustId ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, ustId: e.target.value })
                            }
                            placeholder="DE123456789"
                            className="mt-1 h-8"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Über mich / Bio</Label>
                      <Textarea
                        value={form.bio ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, bio: e.target.value })
                        }
                        placeholder="Beschreibe deine Erfahrungen, Stärken und Verfügbarkeit…"
                        className="mt-1 resize-none"
                        rows={4}
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => updateMutation.mutate()}
                        disabled={updateMutation.isPending}
                        size="sm"
                      >
                        <Save className="size-4 mr-2" />
                        {updateMutation.isPending ? "Speichert…" : "Speichern"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(false)}
                        disabled={updateMutation.isPending}
                      >
                        <X className="size-4 mr-2" />
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Favoriten (nur für Customers) */}
            {!isHelper && (
              <Card className="border-glass-border bg-glass backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Heart className="size-4 text-primary" />
                    Meine Garten-Crew
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {favoritesQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Lädt…</p>
                  ) : favorites.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Du hast noch keine Helfer als Favoriten gespeichert.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {favorites.map((fav: any) => (
                        <div
                          key={fav.helper_id}
                          className="flex items-center gap-3 rounded-xl border border-glass-border p-3"
                        >
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {(fav.profiles?.display_name ?? "H")
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {fav.profiles?.display_name ?? "Helfer"}
                            </p>
                            {fav.profiles?.city && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="size-3" />
                                {fav.profiles.city}
                              </p>
                            )}
                          </div>
                          {fav.profiles?.available_today && (
                            <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">
                              Verfügbar
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardContent className="pt-5 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Account-Status
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Shield className="size-3.5" />
                      Vertrauen
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${profile.trust_score ?? 50}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-primary">
                        {profile.trust_score ?? 50}
                      </span>
                    </div>
                  </div>

                </div>

                <Separator className="bg-glass-border" />

                <p className="text-xs text-muted-foreground">
                  Mitglied seit{" "}
                  {new Date(profile.created_at).toLocaleDateString("de-DE", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </CardContent>
            </Card>

            <VerificationCard />

            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardContent className="pt-5 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Bell className="size-3.5" />
                  Benachrichtigungen
                </p>

                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">E-Mail-Benachrichtigungen</span>
                  <Switch
                    checked={notificationPrefs.enabled}
                    disabled={notificationPrefsMutation.isPending}
                    onCheckedChange={(checked) =>
                      notificationPrefsMutation.mutate({ enabled: checked })
                    }
                  />
                </div>

                {notificationPrefs.enabled && (
                  <div className="space-y-2 pl-0.5">
                    {!isHelper && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Neue Gebote auf meine Aufträge
                        </span>
                        <Switch
                          checked={notificationPrefs.newBid}
                          disabled={notificationPrefsMutation.isPending}
                          onCheckedChange={(checked) =>
                            notificationPrefsMutation.mutate({
                              newBid: checked,
                            })
                          }
                        />
                      </div>
                    )}
                    {isHelper && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Rückmeldungen zu meinen Geboten
                        </span>
                        <Switch
                          checked={notificationPrefs.bidUpdates}
                          disabled={notificationPrefsMutation.isPending}
                          onCheckedChange={(checked) =>
                            notificationPrefsMutation.mutate({
                              bidUpdates: checked,
                            })
                          }
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Auftragsstatus-Updates
                      </span>
                      <Switch
                        checked={notificationPrefs.gigUpdates}
                        disabled={notificationPrefsMutation.isPending}
                        onCheckedChange={(checked) =>
                          notificationPrefsMutation.mutate({
                            gigUpdates: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {isHelper && (
              <Card className="border-primary/20 bg-primary/5 backdrop-blur">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Helfer-Tipps
                  </p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex gap-1.5">
                      <span className="text-primary">✓</span>
                      Füge eine Bio hinzu – Kunden buchen lieber Helfer, die
                      sich vorstellen.
                    </li>
                    <li className="flex gap-1.5">
                      <span className="text-primary">✓</span>
                      Schalte "Ich arbeite heute" im Dashboard ein, um mehr
                      Aufträge zu bekommen.
                    </li>
                    <li className="flex gap-1.5">
                      <span className="text-primary">✓</span>
                      Biete faire Preise – Angebote unter dem Budget werden
                      bevorzugt.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            )}

            {!isAdmin && (
              <Card className="border-destructive/30 bg-destructive/5 backdrop-blur">
                <CardContent className="pt-5 space-y-3">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide flex items-center gap-1.5">
                    <Trash2 className="size-3.5" />
                    Konto löschen
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dein Profil und der Login werden unwiderruflich gelöscht.
                    Bitte nenne kurz den Grund – das hilft uns, GreenMatch zu verbessern.
                  </p>
                  <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        Profil löschen…
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Konto wirklich löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Diese Aktion kann nicht rückgängig gemacht werden. Alle
                          Profildaten und der Zugang werden entfernt.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-2 py-2">
                        <Label htmlFor="delete-reason">Löschgrund</Label>
                        <Textarea
                          id="delete-reason"
                          value={deleteReason}
                          onChange={(e) => setDeleteReason(e.target.value)}
                          placeholder="Warum möchtest du dein Konto löschen?"
                          rows={3}
                          maxLength={500}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Mindestens 10 Zeichen.
                        </p>
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
                          Abbrechen
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={
                            deleteAccountMutation.isPending ||
                            deleteReason.trim().length < 10
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            deleteAccountMutation.mutate();
                          }}
                        >
                          {deleteAccountMutation.isPending
                            ? "Löscht…"
                            : "Endgültig löschen"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
