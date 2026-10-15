// Presentation mode: when true, people's names in the service metrics are blurred (and replaced by
// «Colaborador N» where a blur cannot reach) so the owner can present in public. Off since 2026-10-14.
export const HIDE_PEOPLE = false;

const aliases = new Map<string, string>();
const aliasOf = (name: string) => {
  const key = name.trim().toLowerCase();
  if (!aliases.has(key)) aliases.set(key, `Colaborador ${aliases.size + 1}`);
  return aliases.get(key)!;
};

// Stand-in for places a blur cannot reach: chart labels, select options, titles and generated decks.
export const shownName = <T extends string | null | undefined>(name: T): T =>
  (HIDE_PEOPLE && name && name.trim() ? aliasOf(name) : name) as T;

export const hidePointPerson = <T extends { responsible: string }>(point: T): T =>
  point.responsible === 'Sin responsable' ? point : { ...point, responsible: shownName(point.responsible) };
