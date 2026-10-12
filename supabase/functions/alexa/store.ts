// ORION · the skill's own tables (alexa_*), written as the database owner. Orion's business data is never written
// here: dictated tickets, parts and notes only become real when the person approves them in Orion web.
import { svc as sql } from "./db.ts";

type Row = Record<string, any>;

// ── Linking ──────────────────────────────────────────────────────────────────
export async function linkedUser(alexaUserId: string) {
  // reviewer: Amazon's certification account (public.alexa_reviewers, never staff) — it hears demo data only.
  const rows = await sql`
    select l.user_id, l.notify, p.nombre_completo, coalesce(p.rol::text, 'cliente') as rol, u.email,
      (coalesce(p.rol::text, 'cliente') not in ('admin', 'tecnico') and exists(select 1 from public.alexa_reviewers r where r.email = lower(u.email))) as reviewer
    from public.alexa_links l
    left join public.profiles p on p.id = l.user_id
    join auth.users u on u.id = l.user_id
    where l.alexa_user_id = ${alexaUserId}`;
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  sql`update public.alexa_links set last_seen_at = now() where alexa_user_id = ${alexaUserId}`.catch(() => undefined);
  return { id: r.user_id as string, email: (r.email as string | null) ?? null, fullName: (r.nombre_completo as string | null) ?? "", role: r.rol as "admin" | "tecnico" | "cliente", notify: Boolean(r.notify), reviewer: Boolean(r.reviewer) };
}

/** 6-digit code valid for 10 minutes; one live code per device. */
export async function newLinkCode(alexaUserId: string) {
  for (let i = 0; i < 5; i++) {
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
    try {
      await sql.begin(async (tx) => {
        await tx`delete from public.alexa_link_codes where alexa_user_id = ${alexaUserId} or expires_at < now()`;
        await tx`insert into public.alexa_link_codes (code, alexa_user_id, expires_at) values (${code}, ${alexaUserId}, now() + interval '10 minutes')`;
      });
      return code;
    } catch {
      /* code collision: try another */
    }
  }
  throw new Error("could not allocate a link code");
}

export async function setNotify(alexaUserId: string, on: boolean) {
  await sql`update public.alexa_links set notify = ${on} where alexa_user_id = ${alexaUserId}`;
}

// ── Answers finished after the 8-second window ───────────────────────────────
export async function startAnswer(alexaUserId: string, userId: string, question: string) {
  const [r] = await sql`insert into public.alexa_answers (alexa_user_id, user_id, question) values (${alexaUserId}, ${userId}, ${question.slice(0, 500)}) returning id`;
  return (r as Row).id as string;
}
export async function finishAnswer(id: string, answer: string) {
  await sql`update public.alexa_answers set answer = ${answer}, status = 'done', finished_at = now() where id = ${id}`;
}
export async function failAnswer(id: string, error: string) {
  console.error("background answer", id, error);
  await sql`update public.alexa_answers set answer = ${error.slice(0, 300)}, status = 'error', finished_at = now() where id = ${id}`;
}
/** The awaited answer (or the newest undelivered one from the last 15 minutes); marks it delivered when done. */
export async function takeAnswer(alexaUserId: string, id?: string) {
  const rows = id
    ? await sql`select * from public.alexa_answers where id = ${id} and alexa_user_id = ${alexaUserId}`
    : await sql`select * from public.alexa_answers where alexa_user_id = ${alexaUserId} and delivered_at is null and created_at > now() - interval '15 minutes' order by created_at desc limit 1`;
  const a = rows[0] as Row | undefined;
  if (!a) return null;
  if (a.status !== "pending") await sql`update public.alexa_answers set delivered_at = now() where id = ${a.id}`;
  return a as { id: string; question: string; answer: string | null; status: "pending" | "done" | "error" };
}

// ── Alerts ───────────────────────────────────────────────────────────────────
export async function openAlerts(userId: string) {
  return (await sql`
    select id, kind, severity, title, speech, serial, created_at from public.alexa_alerts
    where user_id = ${userId} and acknowledged_at is null and created_at > now() - interval '3 days'
    order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, created_at desc
    limit 12`) as Array<{ id: string; kind: string; severity: string; title: string; speech: string; serial: string | null; created_at: Date }>;
}
export async function ackAll(userId: string) {
  const rows = await sql`update public.alexa_alerts set acknowledged_at = now(), ack_via = 'voz' where user_id = ${userId} and acknowledged_at is null returning id`;
  return rows.length;
}

// ── Voice diagnosis cases (the DRI learning loop) ────────────────────────────
export async function saveVoiceCase(userId: string, c: { serial: string; model: string | null; failed: string[]; correct: string[]; sources: Row[]; result: Row; existingId?: string }) {
  const hyps = (c.result.hypotheses ?? []).map((h: Row) => ({ key: h.key, title: h.title, score: h.score, subsystem: h.subsystem }));
  const contrast = { exonerations: c.result.exonerations ?? [], discriminating: c.result.discriminating ?? [], lotFindings: c.result.lotFindings ?? [] };
  const sources = c.sources.map((s) => ({ kind: s.kind, label: s.label, failed: s.failed, correct: s.correct }));
  if (c.existingId) {
    const rows = await sql`
      update public.alexa_voice_cases set failed_tests = ${c.failed}, correct_tests = ${c.correct}, sources = ${sql.json(sources)},
        hypotheses = ${sql.json(hyps)}, top_hypothesis = ${hyps[0]?.key ?? null}, contrast = ${sql.json(contrast)}, updated_at = now()
      where id = ${c.existingId} and user_id = ${userId} returning id`;
    if (rows.length) return c.existingId;
  }
  const [r] = await sql`
    insert into public.alexa_voice_cases (user_id, serial, equipment_model, failed_tests, correct_tests, sources, hypotheses, top_hypothesis, contrast, follow_up_at)
    values (${userId}, ${c.serial}, ${c.model}, ${c.failed}, ${c.correct}, ${sql.json(sources)}, ${sql.json(hyps)}, ${hyps[0]?.key ?? null}, ${sql.json(contrast)}, now() + interval '20 hours')
    returning id`;
  return (r as Row).id as string;
}
export async function recordCheck(caseId: string, check: Row) {
  await sql`update public.alexa_voice_cases set checks = checks || ${sql.json([{ ...check, at: new Date().toISOString() }])}, updated_at = now() where id = ${caseId}`;
}
export async function latestOpenCase(userId: string) {
  const [r] = await sql`select id, serial from public.alexa_voice_cases where user_id = ${userId} and outcome is null and created_at > now() - interval '7 days' order by created_at desc limit 1`;
  return (r as { id: string; serial: string } | undefined) ?? null;
}
export async function setOutcome(caseId: string, outcome: string, note: string | null, confirmed: string | null) {
  await sql`update public.alexa_voice_cases set outcome = ${outcome}, outcome_note = coalesce(${note}, outcome_note),
    confirmed_hypothesis = coalesce(${outcome === "resuelto" ? confirmed : null}, confirmed_hypothesis), updated_at = now() where id = ${caseId}`;
}

// ── Pending actions (approved in Orion web) ──────────────────────────────────
export async function createAction(userId: string, kind: "ticket" | "refaccion" | "bitacora", summary: string, payload: Row) {
  const [r] = await sql`insert into public.alexa_pending_actions (user_id, kind, summary, payload) values (${userId}, ${kind}, ${summary.slice(0, 300)}, ${sql.json(payload)}) returning id`;
  return (r as Row).id as string;
}
export async function pendingActions(userId: string) {
  const rows = await sql`select id, kind, summary, created_at from public.alexa_pending_actions where user_id = ${userId} and status = 'pendiente' order by created_at desc limit 20`;
  return rows as unknown as Array<{ id: string; kind: string; summary: string; created_at: Date }>;
}
