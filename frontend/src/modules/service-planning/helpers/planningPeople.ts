import type { ProfileSummary } from '../../../components/servicesPlanning';
import { normalizeText } from './normalizeService';
import { foldText } from './planningSheet';

// Shared by the official-workbook sync and the Excel importer, so both read people and rows the same way.

const cleanText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

export const titleCase = (value: string) =>
  cleanText(value)
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => `${space}${letter.toUpperCase()}`);

// How the workbook names people; anything else is matched against the staff profiles.
export const PERSON_ALIAS_MAP: Record<string, string> = {
  ALFREDO: 'Alfredo Acevedo',
  ANGEL: 'Luis Angel Perez',
  BENJA: 'Benjamin Martinez',
  BENJAMIN: 'Benjamin Martinez',
  CARLOS: 'Carlos Muniz',
  CHITALA: 'Miguel Chitala',
  'D. GARCIA': 'Diego Garcia Garcia',
  DIEGO: 'Diego Garcia Garcia',
  'DIEGO G': 'Diego Garcia Garcia',
  'DIEGO GARCIA': 'Diego Garcia Garcia',
  EDUARDO: 'Eduardo Ignacio Bautista',
  ERICK: 'Erick Duran',
  FCO: 'Francisco',
  FRANCISCO: 'Francisco',
  GARCIA: 'Diego Garcia Garcia',
  GUILLERMO: 'Guillermo Martinez',
  GUILLRMO: 'Guillermo Martinez',
  HECTOR: 'Hector Cortes',
  IVONNE: 'Ivonne Jaramillo',
  LALO: 'Eduardo Ignacio Bautista',
  MARTHA: 'Martha Carbajal',
  MEMO: 'Guillermo Martinez',
  MONTANEZ: 'Ricardo Montanez',
  NAVARRO: 'Diego Navarro',
  OLIVIA: 'Olivia Angulo',
  RICARDO: 'Ricardo Montanez',
  'RICARDO M': 'Ricardo Montanez',
  'RICARDO V': 'Ricardo Vilchis',
  'RICARDO VILCHYS': 'Ricardo Vilchis',
  VILCHIS: 'Ricardo Vilchis',
};

// Words that make a companion cell a note ("PAGADO", "SE CAMBIA A NOV") rather than a person.
const NOTE_WORDS = /\b(PAGAD\w*|PENDIENTE|CAMBI\w*|RUTA|EQUIPOS?|SE|NOV\w*|DIAS?|PREVENTIVOS?|CANCELAD\w*|POSPUEST\w*|COMODATOS?|GARANTIA|CORRECTIVO|FALCON)\b|\d/;

// One activity = same week, same subject (type, platform, locality) and same serial.
// Punctuation is ignored so "H, GRAL IGUALA" and "H. GRAL IGUALA" are the same place.
export const buildRowKey = (weekLabel: string, subject: string | null | undefined, serial: string | null | undefined) =>
  [foldText(weekLabel), foldText(subject || '').replace(/[^A-Z0-9]/g, ''), foldText(serial || '').replace(/[^A-Z0-9]/g, '')].join('|');

export const looseKey = (key: string) => key.split('|').slice(0, 2).join('|');

export const createPeopleResolver = (profiles: ProfileSummary[]) => {
  const named = profiles.filter((profile) => cleanText(profile.nombre_completo));
  const byName = new Map(named.map((profile) => [normalizeText(profile.nombre_completo || ''), profile]));
  const byToken = new Map<string, ProfileSummary[]>();
  for (const profile of named) {
    for (const token of new Set(normalizeText(profile.nombre_completo || '').split(' '))) {
      byToken.set(token, [...(byToken.get(token) || []), profile]);
    }
  }

  const resolve = (raw: string) => {
    const folded = foldText(raw);
    if (!folded) return null;
    const alias = PERSON_ALIAS_MAP[folded] || PERSON_ALIAS_MAP[cleanText(folded.replace(/\./g, ' '))];
    const exact = byName.get(normalizeText(alias || raw));
    if (exact) return exact.nombre_completo || null;
    if (alias) return alias;
    const tokenMatches = byToken.get(normalizeText(raw));
    return tokenMatches?.length === 1 ? tokenMatches[0].nombre_completo || null : null;
  };

  return {
    profileFor: (name: string) => byName.get(normalizeText(name)) || null,
    engineers: (tokens: string[]) =>
      Array.from(
        new Set(
          tokens
            .filter((token) => !/^(PENDIENTE|NA|N\/A|POR DEFINIR)$/.test(foldText(token)))
            .map((token) => resolve(token) || titleCase(token))
            .filter(Boolean),
        ),
      ),
    // Companion cells mix people and notes; unknown two- or three-word names are kept as external people.
    companions: (tokens: string[]) => {
      const people: string[] = [];
      const notes: string[] = [];
      for (const token of tokens) {
        const person = resolve(token);
        const folded = foldText(token);
        if (person) people.push(person);
        else if (!NOTE_WORDS.test(folded) && /^[A-Z]+(?: [A-Z]+){1,2}$/.test(folded)) people.push(titleCase(token));
        else notes.push(cleanText(token));
      }
      return { people, notes };
    },
  };
};
