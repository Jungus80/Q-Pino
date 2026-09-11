import { CITIES, COUNTRIES, regionNameEntries } from '../normalize/geo';
import { MANUFACTURERS } from '../normalize/catalog';
import { modalitySynonymEntries } from '../normalize/modality';
import { jaroWinkler, normalizeInstitutionName, normalizeText } from '../normalize/text';
import type { Modality } from '../schema/observation';
import { MAX_QUERY_LIMIT, QUERY_ORDERS, type QueryGroupBy, type QueryMetric } from './dsl';

// Deterministic reading of an analytics question — no LLM. Finds every entity the
// question names (countries, cities, regions, manufacturers, modalities, clients) using
// the same dictionaries capture uses (gazetteer, catalog, modality synonyms), plus
// regex-level intent: age ranges, breakdown ("por país"), metric ("antigüedad promedio"),
// flags (desactualizado / incompleto / para renovar), top-N and ordering.
//
// Its output is what src/core/query/reconcile.ts anchors the LLM's QueryDsl against:
// the LLM proposes, this confirms. Every rule here is plain code, unit-tested and
// evaluated against eval/golden/query-questions.jsonl without a device.

export type QueryHints = {
  /** normalizeText(question) split into words — what LLM values are anchored against. */
  words: string[];
  country: string[];
  city: string[];
  region: string[];
  manufacturer: string[];
  modality: Modality[];
  /** Ambiguous bare codes ("us") — can confirm an LLM value, never add one alone. */
  modalityCodes: Modality[];
  institution: string[];
  /** Canonical values (any field) the question explicitly excludes ("excepto resonadores"). */
  excluded: string[];
  minAge?: number;
  maxAge?: number;
  minConfidence?: number;
  maxConfidence?: number;
  incomplete: boolean;
  stale: boolean;
  renewalDue: boolean;
  groupBy?: QueryGroupBy;
  metric?: QueryMetric;
  limit?: number;
  order?: (typeof QUERY_ORDERS)[number];
  /** Looser keyword evidence: enough to keep an LLM-set flag/metric, not to add one. */
  mentions: {
    age: boolean;
    confidence: boolean;
    clients: boolean;
    /** A generic equipment noun ("equipos", "equipment") — not a specific modality. */
    equipment: boolean;
    incomplete: boolean;
    stale: boolean;
    renewal: boolean;
    ascending: boolean;
  };
  /** Every number in the question (digits or words) plus ages derived from years. */
  numbers: number[];
  hasDomainSignal: boolean;
  /** Asks for a judgement ("el mejor fabricante") rather than a fact. */
  subjective: boolean;
  notes: string[];
};

export type AnalyzeOptions = { now?: Date; institutions?: string[] };

// ---------------------------------------------------------------------------
// Text normalization

/** Like normalizeText but keeps what the regexes need: decimals and "%". */
function normalizeForPatterns(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
    .replace(/[^\p{L}\p{N}%\u0000\s]/gu, ' ')
    .replace(/\u0000/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Entity dictionary

type EntityField = 'country' | 'city' | 'region' | 'manufacturer' | 'modality';
type DictEntry = { field: EntityField; value: string; weak: boolean };
type EntityMatch = DictEntry & { start: number; end: number };

// Modality synonyms that are also everyday words: "us" is an English pronoun and the
// United States. They may confirm a value the LLM chose, never add one on their own.
const WEAK_MODALITY_SYNONYMS = new Set(['us']);

// Domain words that must never be typo-matched to an entity name.
const NO_FUZZY = new Set([
  'equipos', 'equipo', 'clientes', 'cliente', 'hospital', 'hospitales', 'clinicas', 'modalidad', 'modalidades',
  'fabricante', 'fabricantes', 'antiguedad', 'confianza', 'promedio', 'cuantos', 'cuantas', 'tienen', 'tenemos',
  'ciudad', 'ciudades', 'paises', 'region', 'regiones', 'marcas', 'total', 'mayor', 'menor', 'menos', 'entre',
  'desde', 'hasta', 'despues', 'antes', 'equipment', 'clients', 'country', 'countries', 'manufacturer',
  'average', 'mayores', 'menores', 'medico', 'medicos', 'medica', 'centros', 'instalados', 'monitoreo',
]);

let dictionary: Map<string, DictEntry[]> | null = null;

function getDictionary(): Map<string, DictEntry[]> {
  if (dictionary) return dictionary;
  const map = new Map<string, DictEntry[]>();
  const put = (raw: string, field: EntityField, value: string, weak = false) => {
    const phrase = normalizeText(raw);
    if (!phrase) return;
    const list = map.get(phrase) ?? [];
    if (!list.some((e) => e.field === field && e.value === value)) list.push({ field, value, weak });
    map.set(phrase, list);
  };
  for (const c of COUNTRIES) for (const n of [c.label, ...c.names]) put(n, 'country', c.iso);
  for (const city of CITIES) for (const n of [city.name, ...city.aliases]) put(n, 'city', city.name);
  // Two-letter region codes are skipped: "na" and "eu" are everyday Portuguese words.
  for (const { name, match } of regionNameEntries()) if (name.length > 2) put(name, 'region', match.key);
  for (const m of MANUFACTURERS) for (const n of [m.name, ...m.aliases]) put(n, 'manufacturer', m.name);
  for (const { name, modality } of modalitySynonymEntries()) put(name, 'modality', modality, WEAK_MODALITY_SYNONYMS.has(name));
  dictionary = map;
  return map;
}

function singularCandidates(word: string): string[] {
  const out: string[] = [];
  if (word.length > 4 && word.endsWith('es')) out.push(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s')) out.push(word.slice(0, -1));
  return out;
}

/** Longest-exact-match-first over 1–4 word spans, then a strict typo-tolerant pass
 * (Jaro-Winkler ≥ 0.93, same first letter, ≥5 letters) over whatever is left. */
function matchEntities(words: string[]): { matches: EntityMatch[]; consumed: boolean[] } {
  const dict = getDictionary();
  const consumed = new Array<boolean>(words.length).fill(false);
  const matches: EntityMatch[] = [];
  const isFree = (i: number, n: number) => {
    for (let k = i; k < i + n; k++) if (consumed[k]) return false;
    return true;
  };
  const take = (i: number, n: number, entries: DictEntry[]) => {
    for (const e of entries) matches.push({ ...e, start: i, end: i + n });
    for (let k = i; k < i + n; k++) consumed[k] = true;
  };

  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (!isFree(i, n)) continue;
      const phrase = words.slice(i, i + n).join(' ');
      let entries = dict.get(phrase);
      if (!entries && n === 1) {
        for (const candidate of singularCandidates(phrase)) {
          entries = dict.get(candidate);
          if (entries) break;
        }
      }
      if (entries) take(i, n, entries);
    }
  }

  for (let n = 2; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (!isFree(i, n)) continue;
      const phrase = words.slice(i, i + n).join(' ');
      if (phrase.replace(/ /g, '').length < 5 || NO_FUZZY.has(phrase) || /\d/.test(phrase)) continue;
      let best: { entries: DictEntry[]; score: number } | undefined;
      for (const [key, entries] of dict) {
        if (key.length < 5 || key[0] !== phrase[0] || key.split(' ').length !== n) continue;
        const score = jaroWinkler(phrase, key);
        if (score >= 0.93 && (!best || score > best.score)) best = { entries, score };
      }
      if (best) take(i, n, best.entries);
    }
  }

  return { matches: matches.sort((a, b) => a.start - b.start), consumed };
}

/** Clients named in the question, matched against the institutions actually stored.
 * Every non-generic token of the client's name must appear (typo-tolerant for long
 * tokens); single-token names must match exactly, so "hospitales universitarios"
 * never narrows down to one client called "Hospital Universitario". */
function matchInstitutions(words: string[], consumed: boolean[], institutions: string[]): string[] {
  const available = words.filter((_, i) => !consumed[i]);
  const present = new Set(available);
  const found: string[] = [];
  for (const name of institutions) {
    const tokens = normalizeInstitutionName(name).split(' ').filter(Boolean);
    if (tokens.length === 0) continue;
    const ok = tokens.every(
      (t) =>
        present.has(t) ||
        (tokens.length > 1 && t.length >= 5 && available.some((w) => w[0] === t[0] && jaroWinkler(w, t) >= 0.92))
    );
    if (ok && !found.includes(name)) found.push(name);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Exclusion ("excepto resonadores", "clientes sin tomógrafos")

const EXCLUSION_PHRASES = [
  'excepto', 'salvo', 'exceto', 'except', 'excluding', 'excluyendo', 'sin', 'sem', 'without',
  'menos los', 'menos las', 'menos el', 'menos la', 'menos os', 'menos as',
  'que no sean', 'que no son', 'que no tienen', 'que no tengan', 'no tienen', 'no tiene', 'sin contar',
  'a excepcion de', 'other than', 'nao tem', 'que nao sejam', 'que nao tem', 'do not have', 'dont have', 'fuera de',
].map((p) => p.split(' '));
const SKIPPABLE = new Set(['el', 'la', 'los', 'las', 'the', 'o', 'a', 'os', 'as', 'de', 'del', 'do', 'da', 'dos', 'das', 'equipos', 'equipamentos']);
const CONJUNCTIONS = new Set(['y', 'e', 'ni', 'o', 'ou', 'or', 'and', 'nor', 'nem']);

function exclusionBefore(words: string[], start: number): string[] | null {
  for (let k = start - 1; k >= 0; k--) {
    for (const phrase of EXCLUSION_PHRASES) {
      const from = k - phrase.length + 1;
      if (from >= 0 && phrase.every((w, idx) => words[from + idx] === w)) return phrase;
    }
    if (!SKIPPABLE.has(words[k])) return null;
  }
  return null;
}

function findExclusions(words: string[], matches: EntityMatch[]): { excluded: Set<EntityMatch>; phrase: string | null } {
  const excluded = new Set<EntityMatch>();
  let phrase: string | null = null;
  let chainField: EntityField | null = null;
  let chainEnd = -1;
  for (const m of matches) {
    const between = words.slice(chainEnd, m.start);
    const continuesChain =
      chainField === m.field && chainEnd >= 0 && between.every((w) => CONJUNCTIONS.has(w) || SKIPPABLE.has(w));
    const trigger = exclusionBefore(words, m.start);
    if (trigger || continuesChain) {
      excluded.add(m);
      if (trigger && !phrase) phrase = `${trigger.join(' ')} ${words.slice(m.start, m.end).join(' ')}`;
      chainField = m.field;
      chainEnd = m.end;
    } else {
      chainField = null;
      chainEnd = -1;
    }
  }
  return { excluded, phrase };
}

// ---------------------------------------------------------------------------
// Numbers

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, um: 1, one: 1, dos: 2, dois: 2, duas: 2, two: 2, tres: 3, three: 3,
  cuatro: 4, quatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, siete: 7, sete: 7, seven: 7,
  ocho: 8, oito: 8, eight: 8, nueve: 9, nove: 9, nine: 9, diez: 10, dez: 10, ten: 10,
  once: 11, eleven: 11, doce: 12, twelve: 12, quince: 15, fifteen: 15, veinte: 20, vinte: 20, twenty: 20,
};
// Words too common to count as a number mention outside an explicit pattern.
const WEAK_NUMBER_WORDS = new Set(['un', 'una', 'uno', 'um', 'one', 'once', 'a']);
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')})`;

function parseNum(token: string): number {
  return NUMBER_WORDS[token] ?? parseFloat(token);
}

function collectNumbers(q: string, now: Date): number[] {
  const out: number[] = [];
  for (const m of q.matchAll(/\d+(?:\.\d+)?/g)) {
    const n = parseFloat(m[0]);
    out.push(n);
    if (n >= 1900 && n <= now.getFullYear()) out.push(now.getFullYear() - n);
  }
  for (const w of q.split(' ')) if (w in NUMBER_WORDS && !WEAK_NUMBER_WORDS.has(w)) out.push(NUMBER_WORDS[w]);
  return out;
}

// ---------------------------------------------------------------------------
// Age / confidence ranges

const YEARS = '(?:anos?|years?|yrs?)';
const re = (source: string) => new RegExp(source);

const AGE_RANGE_RE = re(`\\b(?:entre|between|de)\\s+${NUM}\\s+(?:y|e|and|a|to)\\s+${NUM}\\s+${YEARS}\\b`);
const AGE_MIN_RE = re(
  `\\b(?:mas de|mayor(?:es)? (?:a|de|que)|superior(?:es)? a|por encima de|over|older than|more than|mais de|acima de|al menos|minimo|at least|pelo menos|no menos de)\\s+${NUM}\\s+${YEARS}\\b`
);
const AGE_MIN_SUFFIX_RE = re(`\\b${NUM}\\s+${YEARS}\\s+(?:o|ou|or)\\s+(?:mas|more|mais)\\b`);
const AGE_MAX_RE = re(
  `\\b(?:menos de|menor(?:es)? (?:a|de|que)|inferior(?:es)? a|hasta|no mas de|under|less than|younger than|newer than|at most|up to|ate|abaixo de|maximo|como mucho)\\s+${NUM}\\s+${YEARS}\\b`
);
const AGE_MAX_SUFFIX_RE = re(`\\b${NUM}\\s+${YEARS}\\s+(?:o|ou|or)\\s+(?:menos|less|fewer)\\b`);
const YEAR_BEFORE_RE = re(
  `\\b(?:antes de|antes del|anterior(?:es)? a|before|prior to|antes do|hasta|ate)\\s+(?:el\\s+|del\\s+|o\\s+|the\\s+)?(?:ano\\s+|year\\s+)?((?:19|20)\\d{2})\\b`
);
const YEAR_AFTER_RE = re(
  `\\b(?:despues de|desde|after|since|a partir de|posterior(?:es)? a|depois de|from)\\s+(?:el\\s+|del\\s+|o\\s+|the\\s+)?(?:ano\\s+|year\\s+)?((?:19|20)\\d{2})\\b`
);

const CONFIDENCE_WORD = '(?:confianza|confidence|confianca|certeza|confiabilidad)';
const CONFIDENCE_MIN_RE = re(
  `\\b${CONFIDENCE_WORD}\\s+(?:de\\s+)?(?:mayor|superior|mas|por encima|above|over|greater|at least|minima|acima|maior|al menos|minimo)\\s*(?:a|de|que|than|of|do)?\\s*${NUM}\\s*(?:%|por ciento|percent)?`
);
const CONFIDENCE_MIN_PREFIX_RE = re(
  `\\b(?:al menos|mas de|over|at least|minimo|pelo menos|mais de|above)\\s+${NUM}\\s*(?:%|por ciento|percent)?\\s+(?:de\\s+|of\\s+)?${CONFIDENCE_WORD}`
);
const CONFIDENCE_MAX_RE = re(
  `\\b${CONFIDENCE_WORD}\\s+(?:de\\s+)?(?:menor|inferior|menos|por debajo|below|under|less|lower|abaixo)\\s*(?:a|de|que|than|of|do)?\\s*${NUM}\\s*(?:%|por ciento|percent)?`
);
const CONFIDENCE_MAX_PREFIX_RE = re(
  `\\b(?:menos de|por debajo de|below|under|less than|abaixo de|inferior a|menor a|menor que)\\s+${NUM}\\s*(?:%|por ciento|percent)?\\s+(?:de\\s+|of\\s+)?${CONFIDENCE_WORD}`
);
const CONFIDENCE_HIGH_RE = re(`\\b(?:alta|high|elevada)\\s+${CONFIDENCE_WORD}|${CONFIDENCE_WORD}\\s+(?:alta|high|elevada)\\b`);
const CONFIDENCE_LOW_RE = re(`\\b(?:baja|low|baixa)\\s+${CONFIDENCE_WORD}|${CONFIDENCE_WORD}\\s+(?:baja|low|baixa)\\b`);
// "media" is deliberately absent: "confianza media" means *average* confidence.
const CONFIDENCE_MEDIUM_RE = re(`\\b(?:intermedia|moderada|medium)\\s+${CONFIDENCE_WORD}|${CONFIDENCE_WORD}\\s+(?:intermedia|moderada|medium)\\b`);
// The Dashboard's confidence bands (src/core/score/confidence.ts): Alta ≥70, Media 40–69, Baja <40.
const HIGH_CONFIDENCE_MIN = 70;
const MEDIUM_CONFIDENCE_MIN = 40;
const LOW_CONFIDENCE_MAX = 39;
const MEDIUM_CONFIDENCE_MAX = 69;

// "verificados hace más de un año" is about when a client was last seen, not how old its
// equipment is — these spans are removed before ages are read.
const RECENCY_RE = new RegExp(
  `\\b(?:hace|desde hace|ha|faz|for|in the last|en los ultimos)\\s+(?:mas de\\s+|menos de\\s+|mais de\\s+|more than\\s+|over\\s+|about\\s+)?(?:${NUM}\\s+)?${YEARS}\\b`,
  'g'
);

// ---------------------------------------------------------------------------
// Flags

const INCOMPLETE_RE =
  /\b(incomplet\w*|faltante\w*|datos? faltantes?|falta(?:n)? (?:datos|informacion|info)|sin (?:datos|informacion|fabricante|modelo|marca|antiguedad|edad)|missing (?:data|info\w*|fields?)|dados? incompletos?|sem (?:dados|informacao|fabricante|modelo)|desconocid\w*|unknown)\b/;
const INCOMPLETE_LOOSE_RE = /incomplet|falt|missing|sin dato|sem dado|desconoc|unknown|vaci|complet/;
const STALE_RE =
  /\b(desactualizad\w*|sin (?:verificar|actualizar|visitar|revisar)|no (?:verificad\w*|actualizad\w*|visitad\w*)|outdated|out of date|stale|not (?:verified|updated|visited)|unverified|desatualizad\w*|sem (?:verificar|atualizar)|nao verificad\w*|(?:verificad|actualizad|visitad)\w* hace mas de (?:un|1) ano)\b/;
const STALE_LOOSE_RE = /actualiz|verific|atualiz|update|stale|outdated|visit|revis/;
const RENEWAL_RE =
  /\b(renova\w*|renew\w*|reemplaz\w*|sustitu\w*|substitu\w*|obsolet\w*|recambio|replace\w*|fin de (?:su )?vida util|end of life|vida util (?:cumplida|vencida|agotada)|para cambiar|troca\w*)\b/;
const RENEWAL_LOOSE_RE = /renov|renew|reempl|sustit|substit|obsol|replac|vida util|cambi|troca|upgrade/;

const AGE_MENTION_RE = /\b(antig\w*|edad\w*|anos?|years?|old\w*|idade\w*|viej\w*|nuev\w*|recient\w*|age|novos?|antigos?)\b/;
const CONFIDENCE_MENTION_RE = /confian|confidence|certeza|confiab/;
const CLIENT_MENTION_RE =
  /\b(clientes?|hospital\w*|clinicas?|instituci\w*|instituic\w*|centros?|clients?|customers?|hospitais|sites?)\b/;
const EQUIPMENT_MENTION_RE =
  /\b(equipos?|equipamient\w*|equipamentos?|equipment|units?|unidades?|aparatos?|maquinas?|devices?|sistemas?|parque|activos?|assets?)\b/;
const ASCENDING_RE = /\b(menos|fewer|less|least|menor(?:es)?|nuevos?|recientes?|newest|novos?|ascendente|ascending|de menor a mayor|do menor para o maior)\b/;
const SUBJECTIVE_RE = /\b(mejor(?:es)?|peor(?:es)?|best|worst|melhor(?:es)?|pior(?:es)?|recomienda\w*|recommend\w*|deberiamos|should)\b/;
const DOMAIN_RE =
  /\b(parque|base instalada|installed base|instalad\w*|cuant[oa]s|how many|quant[oa]s|total|inventario|inventory|modalidad\w*|fabricante\w*|marcas?|pais\w*|ciudad\w*|region\w*|antig\w*|confian\w*|renova\w*|equip\w*|client\w*|hospital\w*|clinic\w*|manufacturer\w*|countr\w*|cit(?:y|ies)|brands?)\b/;

// ---------------------------------------------------------------------------
// Breakdown / metric / ranking

const DIMS: { groupBy: QueryGroupBy; source: string }[] = [
  { groupBy: 'country', source: 'pais(?:es)?|countr(?:y|ies)' },
  { groupBy: 'city', source: 'ciudad(?:es)?|cidades?|cit(?:y|ies)' },
  { groupBy: 'region', source: 'region(?:es|s)?|regiao|regioes|zonas?' },
  {
    groupBy: 'modality',
    source: 'modalidad(?:es)?|modalidades?|modalit(?:y|ies)|tipos? de equipos?|tipos? de equipamentos?|equipment types?|types? of equipment|tecnologias?|tipos?',
  },
  { groupBy: 'manufacturer', source: 'fabricantes?|marcas?|manufacturers?|brands?|vendors?|proveedor(?:es)?|fornecedor(?:es)?' },
  {
    groupBy: 'institution',
    source: 'clientes?|hospital(?:es)?|hospitais|clinicas?|instituci(?:on|ones)|instituic(?:ao|oes)|clients?|customers?|hospitals?|centros?',
  },
  {
    groupBy: 'ageBucket',
    source: 'rangos? de antiguedad|tramos? de antiguedad|rangos? de edad|antiguedad(?:es)?|edad(?:es)?|idades?|age',
  },
];
const DIM = `(${DIMS.map((d) => d.source).join('|')})`;
const DIM_CLASSIFIERS = DIMS.map((d) => ({ groupBy: d.groupBy, re: new RegExp(`^(?:${d.source})$`) }));
const ART = '(?:(?:el|la|los|las|the|o|a|os|as)\\s+)?';
const MORE = '(mas|more|most|mais|mayor|menos|fewer|less|least|menor)';
const OLDER = '(mas antiguos?|mas antiguas?|mas viejos?|mas viejas?|oldest|older|mais antigos?|mas nuevos?|mas nuevas?|mas recientes?|newest|mais novos?)';

function classifyDim(text: string): QueryGroupBy | undefined {
  return DIM_CLASSIFIERS.find((d) => d.re.test(text))?.groupBy;
}

type GroupRule = {
  re: RegExp;
  /** Which capture group holds the dimension word. */
  dimGroup: number;
  /** Plain "which X"/"qué X hay" phrasings about clients mean "list them", not a breakdown. */
  allowInstitution: boolean;
  allowAgeBucket: boolean;
  /** Capture group holding more/less or older/newer wording, if any. */
  rankGroup?: number;
  limitGroup?: number;
  ageRanking?: boolean;
};

const GROUP_RULES: GroupRule[] = [
  // "por país", "agrupado por fabricante", "by country", "per client"
  {
    re: new RegExp(
      `\\b(?:por|by|per|segun|agrupad[oa]s? por|desglosad[oa]s? por|separad[oa]s? por|broken down by|split by|grouped by)\\s+(?:cada\\s+|each\\s+)?${ART}${DIM}\\b`,
      'g'
    ),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: true,
  },
  // "cada cliente", "each country"
  { re: new RegExp(`\\b(?:cada|each)\\s+${DIM}\\b`, 'g'), dimGroup: 1, allowInstitution: true, allowAgeBucket: false },
  // "de qué países", "en qué ciudades", "in which countries"
  {
    re: new RegExp(`\\b(?:de|en|em|in|from)\\s+(?:que|cuales|quais|which|what)\\s+${DIM}\\b`, 'g'),
    dimGroup: 1,
    allowInstitution: false,
    allowAgeBucket: false,
  },
  // "qué fabricantes hay", "cuáles son los fabricantes", "which countries"
  {
    re: new RegExp(`\\b(?:que|cuales|quais|which|what)\\s+(?:son\\s+(?:los|las)\\s+|sao\\s+(?:os|as)\\s+|are\\s+the\\s+)?${DIM}\\b`, 'g'),
    dimGroup: 1,
    allowInstitution: false,
    allowAgeBucket: false,
  },
  // "fabricantes más comunes", "países principales"
  {
    re: new RegExp(`\\b${DIM}\\s+(?:mas\\s+(?:comunes|frecuentes|usad[oa]s|populares|grandes)|mais comuns|principales)\\b`, 'g'),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: false,
  },
  // "most common brands", "principales países", "top clientes"
  {
    re: new RegExp(`\\b(?:most common|principales|top)\\s+${DIM}\\b`, 'g'),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: false,
  },
  // "distribución de modalidades", "breakdown by manufacturer"
  {
    re: new RegExp(
      `\\b(?:distribucion|desglose|reparto|breakdown|distribution|distribuicao|composicion|participacion|ranking|clasificacion)\\s+(?:de\\s+|por\\s+|of\\s+|by\\s+|da\\s+|do\\s+|del\\s+)?${ART}${DIM}\\b`,
      'g'
    ),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: true,
  },
  // "clientes con más equipos", "países que tienen menos resonadores"
  {
    re: new RegExp(`\\b${DIM}\\s+(?:con|with|com|que tienen?|que tem|having)\\s+${ART}${MORE}\\b`, 'g'),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: false,
    rankGroup: 2,
  },
  // "qué país tiene más equipos", "which client has the most"
  {
    re: new RegExp(`\\b(?:que|cual|cuales|which|what|qual|quais)\\s+${DIM}\\s+(?:tiene|tienen|has|have|tem|concentra\\w*)\\s+${ART}${MORE}\\b`, 'g'),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: false,
    rankGroup: 2,
  },
  // "clientes con los equipos más antiguos", "clientes más antiguos"
  {
    re: new RegExp(
      `\\b${DIM}\\s+(?:(?:con|with|com)\\s+${ART}(?:equipos\\s+|equipment\\s+|equipamentos\\s+)?)?${OLDER}\\b`,
      'g'
    ),
    dimGroup: 1,
    allowInstitution: true,
    allowAgeBucket: false,
    rankGroup: 2,
    ageRanking: true,
  },
  // "los 3 clientes", "top 5 países", "the 3 brands"
  {
    re: new RegExp(`\\b(?:top|los|las|primeros|primeras|the|os|as|primeiros|primeiras|mejores|principales)\\s+${NUM}\\s+${DIM}\\b`, 'g'),
    dimGroup: 2,
    allowInstitution: true,
    allowAgeBucket: false,
    limitGroup: 1,
  },
  // "3 clientes con más equipos"
  {
    re: new RegExp(`\\b${NUM}\\s+${DIM}\\s+(?:con|with|com|que)\\s+${ART}${MORE}\\b`, 'g'),
    dimGroup: 2,
    allowInstitution: true,
    allowAgeBucket: false,
    limitGroup: 1,
    rankGroup: 3,
  },
];

const TOP_ALONE_RE = re(`\\btop\\s+${NUM}\\b`);
const OLDEST_EQUIPMENT_RE = re(
  `\\b(?:(?:top|los|las|primeros|the|os|as)\\s+${NUM}\\s+)?(?:equipos|equipment|equipamentos|unidades|units)\\s+${OLDER}\\b`
);
const MULTI_GROUP_RE = new RegExp(`\\b(?:por|by)\\s+${ART}${DIM}\\s+(?:y|e|and)\\s+(?:por\\s+|by\\s+)?${ART}${DIM}\\b`);

const AVG_AGE_RE =
  /\b(?:(?:antiguedad|edad|idade|age)\s+(?:promedio|media|medio|average|mean)|(?:promedio|media|average|mean)\s+(?:de\s+(?:la\s+)?|da\s+|of\s+(?:the\s+)?)?(?:antiguedad|edad|idade|age)|(?:que tan|how)\s+(?:antiguos?|antiguas?|viejos?|viejas?|old)|cuantos anos tienen|(?:que|cual es la)\s+(?:antiguedad|edad)|idade media|(?:antiguedad|edad|idade)\s+(?:de|da|do|dos|das)\s+(?:los|las|el|la|os|as|mis|nuestros|nuestras)|how old)\b/;
const AVG_CONFIDENCE_RE =
  /\b(?:(?:confianza|confidence|confianca|certeza)\s+(?:promedio|media|medio|average|mean)|(?:promedio|media|average|mean)\s+(?:de\s+(?:la\s+)?|of\s+)?(?:confianza|confidence|confianca)|nivel(?:es)? de confianza|(?:que tan|how|quao)\s+(?:confiables?|fiables?|reliable|confiaveis)|confiabilidad de|reliability of)\b/;
const CLIENT_COUNT_RE =
  /\b(?:cuant[oa]s|numero de|cantidad de|how many|quant[oa]s|number of|total de)\s+(?:clientes|hospitales|clinicas|instituciones|centros|clients|customers|hospitals|hospitais|instituicoes|clinics)\b/;

type GroupDetection = {
  groupBy?: QueryGroupBy;
  limit?: number;
  order?: 'asc' | 'desc';
  metric?: QueryMetric;
  multiple: boolean;
};

function detectGroupBy(q: string): GroupDetection {
  const found: { index: number; groupBy: QueryGroupBy; limit?: number; order?: 'asc' | 'desc'; metric?: QueryMetric }[] = [];

  for (const rule of GROUP_RULES) {
    for (const m of q.matchAll(rule.re)) {
      const groupBy = classifyDim(m[rule.dimGroup]);
      if (!groupBy) continue;
      if (groupBy === 'institution' && !rule.allowInstitution) continue;
      if (groupBy === 'ageBucket' && !rule.allowAgeBucket) continue;
      const rank = rule.rankGroup ? m[rule.rankGroup] : undefined;
      found.push({
        index: m.index ?? 0,
        groupBy,
        limit: rule.limitGroup ? parseNum(m[rule.limitGroup]) : undefined,
        order: rank ? (ASCENDING_RE.test(rank) ? 'asc' : 'desc') : undefined,
        metric: rule.ageRanking ? 'avgAge' : undefined,
      });
    }
  }

  const oldest = q.match(OLDEST_EQUIPMENT_RE);
  if (oldest && found.length === 0) {
    found.push({
      index: oldest.index ?? 0,
      groupBy: 'institution',
      limit: oldest[1] ? parseNum(oldest[1]) : undefined,
      order: ASCENDING_RE.test(oldest[2]) ? 'asc' : 'desc',
      metric: 'avgAge',
    });
  }

  if (found.length === 0) return { multiple: false };
  found.sort((a, b) => a.index - b.index);
  const groupBy = found[0].groupBy;
  const same = found.filter((f) => f.groupBy === groupBy);
  const multi = q.match(MULTI_GROUP_RE);
  const multiple =
    new Set(found.map((f) => f.groupBy)).size > 1 || (multi !== null && classifyDim(multi[1]) !== classifyDim(multi[2]));
  const top = q.match(TOP_ALONE_RE);
  return {
    groupBy,
    limit: same.find((f) => f.limit !== undefined)?.limit ?? (top ? parseNum(top[1]) : undefined),
    order: same.find((f) => f.order)?.order,
    metric: same.find((f) => f.metric)?.metric,
    multiple,
  };
}

// ---------------------------------------------------------------------------

export function analyzeQuestion(question: string, options: AnalyzeOptions = {}): QueryHints {
  const now = options.now ?? new Date();
  const words = normalizeText(question).split(' ').filter(Boolean);
  const q = normalizeForPatterns(question);
  const notes: string[] = [];

  const { matches, consumed } = matchEntities(words);
  const { excluded: excludedMatches, phrase: exclusionPhrase } = findExclusions(words, matches);
  const institution = matchInstitutions(words, consumed, options.institutions ?? []);

  const entities = { country: [] as string[], city: [] as string[], region: [] as string[], manufacturer: [] as string[] };
  const modality: Modality[] = [];
  const modalityCodes: Modality[] = [];
  const excluded: string[] = [];
  for (const m of matches) {
    if (excludedMatches.has(m)) {
      if (!excluded.includes(m.value)) excluded.push(m.value);
      continue;
    }
    if (m.field === 'modality') {
      const list = m.weak ? modalityCodes : modality;
      if (!list.includes(m.value as Modality)) list.push(m.value as Modality);
    } else if (!entities[m.field].includes(m.value)) {
      entities[m.field].push(m.value);
    }
  }
  if (exclusionPhrase) {
    notes.push(`Todavía no puedo excluir valores («${exclusionPhrase}»): ese filtro no se aplicó, así que el resultado los incluye.`);
  }

  // Ages
  const qAge = q.replace(RECENCY_RE, ' ');
  let minAge: number | undefined;
  let maxAge: number | undefined;
  const range = qAge.match(AGE_RANGE_RE);
  if (range) {
    minAge = parseNum(range[1]);
    maxAge = parseNum(range[2]);
  } else {
    const min = qAge.match(AGE_MIN_RE) ?? qAge.match(AGE_MIN_SUFFIX_RE);
    const max = qAge.match(AGE_MAX_RE) ?? qAge.match(AGE_MAX_SUFFIX_RE);
    if (min) minAge = parseNum(min[1]);
    if (max) maxAge = parseNum(max[1]);
    const before = qAge.match(YEAR_BEFORE_RE);
    const after = qAge.match(YEAR_AFTER_RE);
    if (before && minAge === undefined) minAge = now.getFullYear() - parseInt(before[1], 10);
    if (after && maxAge === undefined) maxAge = now.getFullYear() - parseInt(after[1], 10);
  }

  // Confidence: explicit bounds ("mayor a 80%", "menos de 60% de confianza"), else the
  // Dashboard's bands ("alta/baja confianza").
  const percent = (token: string) => {
    const n = parseNum(token);
    return n > 0 && n <= 1 ? n * 100 : n;
  };
  let minConfidence: number | undefined;
  let maxConfidence: number | undefined;
  const confMin = q.match(CONFIDENCE_MIN_RE) ?? q.match(CONFIDENCE_MIN_PREFIX_RE);
  const confMax = q.match(CONFIDENCE_MAX_RE) ?? q.match(CONFIDENCE_MAX_PREFIX_RE);
  if (confMin) minConfidence = percent(confMin[1]);
  if (confMax) maxConfidence = percent(confMax[1]);
  if (!confMin && !confMax) {
    if (CONFIDENCE_HIGH_RE.test(q)) minConfidence = HIGH_CONFIDENCE_MIN;
    else if (CONFIDENCE_LOW_RE.test(q)) maxConfidence = LOW_CONFIDENCE_MAX;
    else if (CONFIDENCE_MEDIUM_RE.test(q)) {
      minConfidence = MEDIUM_CONFIDENCE_MIN;
      maxConfidence = MEDIUM_CONFIDENCE_MAX;
    }
  }

  const group = detectGroupBy(q);
  if (group.multiple && group.groupBy) {
    notes.push('Solo puedo desglosar por una dimensión a la vez; usé la primera que mencionaste.');
  }

  let metric: QueryMetric | undefined = group.metric;
  if (AVG_AGE_RE.test(q)) metric = 'avgAge';
  else if (AVG_CONFIDENCE_RE.test(q)) metric = 'confidence';
  else if (!metric && CLIENT_COUNT_RE.test(q)) metric = 'clients';

  let order = group.order;
  if (/\b(?:de menor a mayor|ascendente|ascending|do menor para o maior)\b/.test(q)) order = 'asc';
  else if (/\b(?:de mayor a menor|descendente|descending|do maior para o menor)\b/.test(q)) order = 'desc';

  const limit = group.limit !== undefined ? Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.round(group.limit))) : undefined;

  const incomplete = INCOMPLETE_RE.test(q);
  const stale = STALE_RE.test(q);
  const renewalDue = RENEWAL_RE.test(q);

  const subjective = SUBJECTIVE_RE.test(q);
  if (subjective) {
    notes.push('No puedo valorar qué es mejor o peor; te muestro los datos de todos los equipos para que compares.');
  }

  const hasEntity = matches.length > 0 || institution.length > 0;
  const hasDomainSignal =
    hasEntity ||
    DOMAIN_RE.test(q) ||
    group.groupBy !== undefined ||
    incomplete ||
    stale ||
    renewalDue ||
    minAge !== undefined ||
    maxAge !== undefined;

  return {
    words,
    ...entities,
    modality,
    modalityCodes,
    institution,
    excluded,
    minAge,
    maxAge,
    minConfidence,
    maxConfidence,
    incomplete,
    stale,
    renewalDue,
    groupBy: group.groupBy,
    metric,
    limit,
    order,
    mentions: {
      age: AGE_MENTION_RE.test(q),
      confidence: CONFIDENCE_MENTION_RE.test(q),
      clients: CLIENT_MENTION_RE.test(q),
      equipment: EQUIPMENT_MENTION_RE.test(q),
      incomplete: INCOMPLETE_LOOSE_RE.test(q),
      stale: STALE_LOOSE_RE.test(q),
      renewal: RENEWAL_LOOSE_RE.test(q),
      ascending: ASCENDING_RE.test(q),
    },
    numbers: collectNumbers(q, now),
    hasDomainSignal,
    subjective,
    notes,
  };
}

/** True when `value` (a string the LLM wrote) actually appears in the question — as the
 * same word sequence, or, for values of 5+ letters, a near-identical one (typos,
 * "brasileños" vs "Brasil"). Token-level on purpose: a substring check would anchor "BR"
 * to "hombres". */
export function isAnchoredInQuestion(value: string, words: string[]): boolean {
  const target = normalizeText(value).split(' ').filter(Boolean);
  if (target.length === 0) return false;
  const phrase = target.join(' ');
  for (let i = 0; i + target.length <= words.length; i++) {
    const span = words.slice(i, i + target.length).join(' ');
    if (span === phrase) return true;
    if (phrase.length >= 5 && jaroWinkler(span, phrase) >= 0.88) return true;
  }
  return false;
}

const GENERIC_WORD_RE = new RegExp(`^(?:${DIMS.map((d) => d.source).join('|')}|equip\\w*|todos?|todas?|parque|total|base instalada)$`);

/** A value that is just a domain word ("equipos", "países", "clientes") copied out of the
 * question into a filter slot — anchored, but never a real filter value. */
export function isGenericQueryWord(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized.length === 0 || GENERIC_WORD_RE.test(normalized);
}
