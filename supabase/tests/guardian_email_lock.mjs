// Prüft die Migration 20261030000100_role_and_guardian_email_lock.sql (Eltern-E-Mail-Sperre) in einer In-Memory-Postgres (PGlite).
// Nicht Teil der Projekt-Abhängigkeiten. Ausführen: npm i --no-save @electric-sql/pglite && node supabase/tests/guardian_email_lock.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.uid_holder (id uuid);
  create function auth.uid() returns uuid language sql as $$ select id from auth.uid_holder limit 1 $$;
  create table public.profiles (id uuid primary key, verified_at timestamptz);
  create table public.profile_private (id uuid primary key, guardian_email text);
  create table public.verification_requests (id uuid primary key default gen_random_uuid(), user_id uuid, kind text, status text);
  create table public.guardian_links (id uuid primary key default gen_random_uuid(), child_id uuid, status text);
  create function public.has_role(_u uuid, _r text) returns boolean language sql as $$ select false $$;
`);
const sql = fs.readFileSync("./supabase/migrations/20261030000100_role_and_guardian_email_lock.sql", "utf8");
await db.exec(sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.protect_guardian_email")));
const KID = "00000000-0000-0000-0000-0000000000a1";
await db.query("insert into public.profiles (id) values ($1)", [KID]);
await db.query("insert into public.profile_private (id, guardian_email) values ($1,'eltern@example.de')", [KID]);
const tryUpdate = async (label, who) => {
  await db.exec("delete from auth.uid_holder");
  if (who) await db.query("insert into auth.uid_holder values ($1)", [who]);
  try { await db.query("update public.profile_private set guardian_email = $1 where id = $2", [label + "@kind.de", KID]); console.log(label.padEnd(38), "-> erlaubt"); }
  catch (e) { console.log(label.padEnd(38), "-> GESPERRT:", e.message.slice(0, 60)); }
};
await tryUpdate("frei (noch nichts eingereicht)", KID);
await db.query("update public.profile_private set guardian_email = 'eltern@example.de' where id = $1", [KID]); // zurücksetzen (Service)
await db.query("insert into public.verification_requests (user_id, kind, status) values ($1,'youth_documents','pending')", [KID]);
await tryUpdate("Unterlagen eingereicht (pending)", KID);
await tryUpdate("Service-Zugang (ohne auth.uid)", null);
await db.query("update public.verification_requests set status='approved'"); await db.query("update public.profile_private set guardian_email='eltern@example.de' where id=$1",[KID]);
await db.query("update public.profiles set verified_at = now() where id = $1", [KID]);
await tryUpdate("verifiziert", KID);
await db.query("update public.profiles set verified_at = null"); await db.query("insert into public.guardian_links (child_id,status) values ($1,'active')", [KID]);
await tryUpdate("Eltern-Konto verknüpft", KID);
// unveränderte Adresse (z. B. Profil speichern) darf immer durch
await db.exec("delete from auth.uid_holder"); await db.query("insert into auth.uid_holder values ($1)", [KID]);
await db.query("update public.profile_private set guardian_email = 'eltern@example.de' where id = $1", [KID]); console.log("unveränderte Adresse speichern".padEnd(38), "-> erlaubt");
