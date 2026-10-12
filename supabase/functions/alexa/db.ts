// ORION · database access for the Alexa function.
// `svc`  — the database owner, ONLY for the alexa_* tables (links, answers, alerts, voice cases, pending actions).
// `asUser` — everything else: a transaction that becomes the linked person (`set local role authenticated` plus the
//            same JWT claims PostgREST would set), so Orion's RLS decides what Alexa may read or write.
import postgres from "npm:postgres@3.4.9";

const DB_URL = Deno.env.get("ORION_ALEXA_DB_URL") ?? Deno.env.get("SUPABASE_DB_URL") ?? "";

export const sql = postgres(DB_URL, {
  prepare: false, // works through the transaction pooler too
  max: 4,
  idle_timeout: 20,
  connect_timeout: 8,
  onnotice: () => {},
});
export type Tx = postgres.TransactionSql<Record<string, never>> | postgres.Sql<Record<string, never>>;

export interface Identity {
  id: string;
  email: string | null;
}

export async function asUser<T>(who: Identity, fn: (tx: postgres.TransactionSql<Record<string, never>>) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: who.id, role: "authenticated", aud: "authenticated", ...(who.email ? { email: who.email } : {}) });
  const out = await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${who.id}, true), set_config('request.jwt.claim.role', 'authenticated', true)`;
    await tx.unsafe("set local role authenticated");
    // A slow query must not eat Alexa's 8 seconds (background answers get their own, longer budget).
    await tx.unsafe("set local statement_timeout = '15s'");
    return await fn(tx);
  });
  return out as T;
}

export const svc = sql;
