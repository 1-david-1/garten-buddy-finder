import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { completeOnboarding, getMyRoles } from "@/lib/roles.functions";
import { useI18n } from "@/lib/i18n";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "customer" | "helper_youth" | "helper_adult" | "helper_pro";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const submit = useServerFn(completeOnboarding);
  const getRoles = useServerFn(getMyRoles);

  const rolesQuery = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles() });

  useEffect(() => {
    if (rolesQuery.data?.roles?.length) {
      navigate({ to: "/dashboard" });
    }
  }, [rolesQuery.data, navigate]);

  const [role, setRole] = useState<Role | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    city: "",
    postalCode: "",
    birthdate: "",
    businessName: "",
    vatId: "",
    guardianEmail: "",
  });
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (payload: Parameters<typeof submit>[0]) => submit(payload),
    onSuccess: () => navigate({ to: "/dashboard" }),
    onError: (e) => setError((e as Error).message),
  });

  const roles: { key: Role }[] = [
    { key: "customer" },
    { key: "helper_youth" },
    { key: "helper_adult" },
    { key: "helper_pro" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-brand text-3xl">{t("onboarding.title")}</h1>

        {!role ? (
          <div className="mt-8 space-y-3">
            {roles.map((r) => (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className="w-full rounded-2xl border border-glass-border bg-glass p-5 text-left backdrop-blur transition hover:border-primary/60 hover:bg-primary/5"
              >
                <div className="font-semibold">{t(`onboarding.role.${r.key}`)}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t(`onboarding.role.${r.key}.desc`)}</div>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="mt-8 space-y-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mut.mutate({
                data: {
                  role,
                  displayName: form.displayName,
                  city: form.city || null,
                  postalCode: form.postalCode || null,
                  birthdate: form.birthdate || null,
                  businessName: form.businessName || null,
                  vatId: form.vatId || null,
                  guardianEmail: form.guardianEmail || null,
                  language: locale,
                },
              });
            }}
          >
            <Field label={t("onboarding.displayName")} value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("onboarding.city")} value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label={t("onboarding.postal")} value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} />
            </div>
            {(role === "helper_youth" || role === "helper_adult" || role === "helper_pro") && (
              <Field label={t("onboarding.birthdate")} type="date" value={form.birthdate} onChange={(v) => setForm({ ...form, birthdate: v })} required />
            )}
            {role === "helper_youth" && (
              <Field label={t("onboarding.guardianEmail")} type="email" value={form.guardianEmail} onChange={(v) => setForm({ ...form, guardianEmail: v })} required />
            )}
            {role === "helper_pro" && (
              <>
                <Field label={t("onboarding.businessName")} value={form.businessName} onChange={(v) => setForm({ ...form, businessName: v })} required />
                <Field label={t("onboarding.vatId")} value={form.vatId} onChange={(v) => setForm({ ...form, vatId: v })} required />
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-between pt-2">
              <Button type="button" variant="ghost" onClick={() => setRole(null)}>
                {t("onboarding.back")}
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? t("common.loading") : t("onboarding.submit")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}
