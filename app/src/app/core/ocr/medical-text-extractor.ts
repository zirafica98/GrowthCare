import { Confidence, DocumentCategory } from '../models/models';

/**
 * Vendor-neutral, rule-based extraction of CANDIDATE values from OCR text.
 * Tuned on Serbian clinical report formats ("Datum i vreme pregleda",
 * "Dijagnoza(MKB 10)", "Th:", lab lines "IGF-1 90.1 [18.9-116.0] (ng/mL)").
 *
 * Output is untrusted: every value must be reviewed by a parent before it is
 * saved. Nothing here interprets results — reference ranges and flags are
 * copied exactly as printed on the source.
 */

export type FieldName =
  | 'document_date'
  | 'doctor'
  | 'specialty'
  | 'clinic'
  | 'diagnosis'
  | 'medication'
  | 'strength'
  | 'dose'
  | 'dose_unit'
  | 'frequency'
  | 'scheduled_time'
  | 'follow_up'
  | 'height_cm'
  | 'weight_kg'
  | 'lab_date'
  | 'title';

export interface ExtractedField {
  name: FieldName;
  value: string;
  confidence: Confidence;
}

export interface ExtractedLabResult {
  test_name: string;
  result_value: string;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  source_text: string;
  confidence: Confidence;
}

export interface ExtractionResult {
  documentType: DocumentCategory;
  fields: ExtractedField[];
  labResults: ExtractedLabResult[];
}

export const FIELD_LABELS: Record<FieldName, string> = {
  document_date: 'Datum dokumenta',
  doctor: 'Lekar',
  specialty: 'Specijalnost',
  clinic: 'Ustanova',
  diagnosis: 'Dijagnoza (tekst sa dokumenta)',
  medication: 'Terapija / lek',
  strength: 'Jačina',
  dose: 'Doza',
  dose_unit: 'Jedinica',
  frequency: 'Učestalost',
  scheduled_time: 'Vreme primene',
  follow_up: 'Sledeća kontrola',
  height_cm: 'Visina (cm)',
  weight_kg: 'Težina (kg)',
  lab_date: 'Datum analiza',
  title: 'Naslov',
};

const DATE_RE = /(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/;
const NAME_WORD = "[A-ZČĆŽŠĐ][a-zčćžšđ]+";

function toIsoDate(m: RegExpMatchArray | null): string | null {
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1990 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function num(s: string): string {
  return s.replace(',', '.').replace(/\s+/g, '');
}

/** Collapse OCR whitespace noise but keep line structure. */
export function normalizeText(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ /g, ' ');
}

export function extractDocumentDate(text: string): ExtractedField | null {
  const labelled: [RegExp, Confidence][] = [
    [new RegExp(`Datum i vreme (?:pregleda|prijema)\\s*:?\\s*${DATE_RE.source}`, 'i'), 'high'],
    [new RegExp(`(?<!rođenja\\s?)Datum\\s*:\\s*${DATE_RE.source}`, 'i'), 'high'],
    [new RegExp(`Datum (?:izdavanja|uzorkovanja|prijema uzorka)\\s*:?\\s*${DATE_RE.source}`, 'i'), 'high'],
    [new RegExp(`Kreirano\\s*:?\\s*${DATE_RE.source}`, 'i'), 'medium'],
  ];
  for (const [re, conf] of labelled) {
    const iso = toIsoDate(text.match(re));
    if (iso) return { name: 'document_date', value: iso, confidence: conf };
  }
  // Fallback: first date that is not a date of birth.
  const all = [...text.matchAll(new RegExp(DATE_RE.source, 'g'))];
  for (const m of all) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 20), m.index).toLowerCase();
    if (before.includes('rođ') || before.includes('rod')) continue;
    const iso = toIsoDate(m);
    if (iso) return { name: 'document_date', value: iso, confidence: 'low' };
  }
  return null;
}

export function extractDoctor(text: string): ExtractedField | null {
  const re = new RegExp(`(?:Spec\\.\\s*)?\\bDr\\.?\\s*(?:med\\.?\\s*)?(${NAME_WORD}(?:\\s+${NAME_WORD}){1,2})`, 'g');
  const names = [...text.matchAll(re)].map((m) => m[1].trim());
  if (!names.length) return null;
  // The signing doctor usually appears last (signature block); quoted earlier reports appear before.
  const counts = new Map<string, number>();
  names.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  const last = names[names.length - 1];
  return { name: 'doctor', value: `Dr ${last}`, confidence: (counts.get(last) ?? 0) > 1 ? 'high' : 'medium' };
}

const SPECIALTIES: [RegExp, string][] = [
  [/endokrinolog/i, 'Dečja endokrinologija'],
  [/neuroradiolog|radiolog/i, 'Radiologija'],
  [/anesteziolog/i, 'Anesteziologija'],
  [/oftalmolog|pregledi? oči|fundus/i, 'Oftalmologija'],
  [/kardiolog/i, 'Kardiologija'],
  [/biohemij|laboratorij/i, 'Laboratorija'],
  [/pedijatr/i, 'Pedijatrija'],
];

export function extractSpecialty(text: string): ExtractedField | null {
  const header = text.split('\n').slice(0, 25).join('\n');
  const titleLine = header.match(/IZVE[ŠS]TAJ[^\n]*|NALAZ [A-ZČĆŽŠĐ]+[^\n]*/i)?.[0] ?? '';
  for (const [re, label] of SPECIALTIES) {
    if (re.test(titleLine)) return { name: 'specialty', value: label, confidence: 'high' };
  }
  for (const [re, label] of SPECIALTIES) {
    if (re.test(text)) return { name: 'specialty', value: label, confidence: 'low' };
  }
  return null;
}

export function extractClinic(text: string): ExtractedField | null {
  const m = text.match(/(Op[šs]ta bolnica[^\n|,]*|Dom zdravlja[^\n|,]*|Klini[čc]ki centar[^\n|,]*|KBC[^\n|,]*|Institut[^\n|,]*|Univerzitetska de[čc]ja klinika[^\n|,]*)/i);
  if (!m) return null;
  return { name: 'clinic', value: m[1].replace(/[„“”"]/g, '"').trim(), confidence: 'medium' };
}

export function extractDiagnosis(text: string): ExtractedField | null {
  const m = text.match(/Dijagno(?:za|ze)\s*(?:\(MKB\s*-?\s*10\))?\s*:?\s*([A-Z]\d{2}(?:\.\d)?[^\n(]*)/i);
  if (m) return { name: 'diagnosis', value: m[1].trim().replace(/\s+/g, ' '), confidence: 'high' };
  return null;
}

/** Therapy line, e.g. "Th: Omnitrope 15 mg / 1,5 mL … u 22 h ( 0,4 mg / 24 h …". */
export function extractTherapy(text: string): ExtractedField[] {
  const flat = text.replace(/\n/g, ' ');
  const thMatches = [...flat.matchAll(/\bTh\s*:\s*([^]*?)(?=\bTh\s*:|STATUS\s*:|Dijagno|Upu[ćc]uje|Kontrola kod|Potpis|$)/gi)];
  // Use the last therapy block that is not "nihil" (earlier ones are often quoted history).
  const block = thMatches.map((m) => m[1].trim()).reverse().find((b) => !/^\s*(sa [^.]*?strane )?(za sada )?nihil/i.test(b));
  if (!block) return [];
  const out: ExtractedField[] = [];
  const name = block.match(/^([A-ZČĆŽŠĐa-zčćžšđ][A-Za-zČĆŽŠĐčćžšđ-]+(?:\s+[A-Z][A-Za-z-]+)?)/);
  if (name) out.push({ name: 'medication', value: name[1].trim(), confidence: 'medium' });
  const strength = block.match(/(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|IU|i\.j\.)\s*\/\s*\d*(?:[.,]\d+)?\s*m[lL])/i)
    ?? block.match(/\ba\s+(\d+(?:[.,]\d+)?\s*mg\s*\/\s*\d+\s*m[lL])/i);
  if (strength) out.push({ name: 'strength', value: strength[1].replace(/\s+/g, ' ').trim(), confidence: 'medium' });

  // Daily dose: "(0,4 mg / 24 h" or "1 x 5 ml dnevno" or "0.4 mg dnevno".
  const per24 = block.match(/(\d+(?:[.,]\d+)?)\s*(mg|ml|mL|IU|i\.j\.|mcg)\s*\/\s*24\s*h/i);
  const timesDaily = block.match(/(\d)\s*x\s*(\d+(?:[.,]\d+)?)\s*(mg|ml|mL|IU)\b/i);
  const perDay = block.match(/(\d+(?:[.,]\d+)?)\s*(mg|ml|mL|IU)\s*(?:dnevno|na dan)/i);
  if (per24) {
    out.push({ name: 'dose', value: num(per24[1]), confidence: 'medium' }, { name: 'dose_unit', value: per24[2].toLowerCase(), confidence: 'medium' });
  } else if (timesDaily) {
    out.push({ name: 'dose', value: num(timesDaily[2]), confidence: 'medium' }, { name: 'dose_unit', value: timesDaily[3].toLowerCase(), confidence: 'medium' });
    out.push({ name: 'frequency', value: `${timesDaily[1]}x dnevno`, confidence: 'medium' });
  } else if (perDay) {
    out.push({ name: 'dose', value: num(perDay[1]), confidence: 'low' }, { name: 'dose_unit', value: perDay[2].toLowerCase(), confidence: 'low' });
  }
  if (/svak(e|i|og) ve[čc]er|svakodnevno|dnevno|svaki dan/i.test(block) && !out.some((f) => f.name === 'frequency')) {
    out.push({ name: 'frequency', value: 'Svaki dan', confidence: 'medium' });
  }
  const time = block.match(/\bu\s*(\d{1,2})(?:[:.](\d{2}))?\s*h\b/i);
  if (time && Number(time[1]) < 24) {
    out.push({ name: 'scheduled_time', value: `${time[1].padStart(2, '0')}:${time[2] ?? '00'}`, confidence: 'medium' });
  }
  return out;
}

/** Follow-up: explicit date ("Kontrola 24.11.2026") or a relative interval ("za 1 mesec"). */
export function extractFollowUp(text: string, documentDate: string | null): ExtractedField | null {
  const flat = text.replace(/\n/g, ' ');
  const explicit = flat.match(new RegExp(`(?:Kontrol[a-z]*|Ponovni pregled)[^.]{0,60}?${DATE_RE.source}`, 'i'));
  const iso = explicit ? toIsoDate(explicit) : null;
  if (iso) return { name: 'follow_up', value: iso, confidence: 'high' };
  const rel = flat.match(/(?:Kontrol[a-z]*|Ponovni pregled)[^.]{0,80}?za\s+(\d+)\s*(dan|nedelj|mesec|meseci|godin)/i);
  if (rel && documentDate) {
    const n = Number(rel[1]);
    const d = new Date(`${documentDate}T12:00:00`);
    const unit = rel[2].toLowerCase();
    if (unit.startsWith('dan')) d.setDate(d.getDate() + n);
    else if (unit.startsWith('nedelj')) d.setDate(d.getDate() + 7 * n);
    else if (unit.startsWith('mesec')) d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    return { name: 'follow_up', value: d.toISOString().slice(0, 10), confidence: 'low' };
  }
  return null;
}

/** Child's own height/weight from a STATUS section — skips parents' heights and birth values. */
export function extractMeasurements(text: string): ExtractedField[] {
  const flat = text.replace(/\n/g, ' ');
  const status = flat.match(/STATUS\s*:([^]*?)(?:\.\s*Ko[žz]a|\.\s*[A-ZČĆŽŠĐ]{3,}|$)/i)?.[1] ?? '';
  const out: ExtractedField[] = [];
  const scope = status || flat;
  const h = scope.match(/\bTV\s+(?!majke|oca|na\s)(\d{2,3}(?:[.,]\d)?)\s*cm/i) ?? scope.match(/(?:visina|telesna visina)\s*:?\s*(\d{2,3}(?:[.,]\d)?)\s*cm/i);
  const w = scope.match(/\bTM\s+(?!na\s)(\d{1,3}(?:[.,]\d{1,2})?)\s*kg/i) ?? scope.match(/(?:te[žz]ina|telesna masa)\s*:?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*kg/i);
  const conf: Confidence = status ? 'high' : 'low';
  if (h) out.push({ name: 'height_cm', value: num(h[1]), confidence: conf });
  if (w) out.push({ name: 'weight_kg', value: num(w[1]), confidence: conf });
  return out;
}

const LAB_INLINE = /(?:^|[,:;\n]|\.\s)\s*([A-Za-zČĆŽŠĐčćžšđ][^,:;[\]\n]{0,48}?)\s+([<>]?\s?\d+(?:[.,]\d+)?)\s*(H|L|↑|↓|\*)?\s*\[([^\]\n]{1,30})\]\s*(?:\(([^)\n]{1,25})\))?/g;
const LAB_TABLE = /^\s*([A-Za-zČĆŽŠĐčćžšđ][\w\-ČĆŽŠĐčćžšđ/() ]{1,40}?)\s{1,}([<>]?\d+(?:[.,]\d+)?)\s+(?:(H|L|↑|↓)\s+)?([a-zA-Zµ%][\w/*.µ%^]*(?:\/[\w.]+)?)\s+([<>]?\s*\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?)\s*$/gm;
const STIM_TEST = /(GLUKOZ[AE]|HORMON[A]?\s+RASTA|KORTIZOL)\s*\(\s*([^)]+?)\s*\)\s*:\s*((?:\d+\s*minut[a]?\s*:\s*[\d.,]+\s*)+)/gi;

export function extractLabResults(text: string): ExtractedLabResult[] {
  const flat = normalizeText(text).replace(/\s*\n\s*/g, ' ');
  const out: ExtractedLabResult[] = [];
  const seen = new Set<string>();
  const push = (r: ExtractedLabResult) => {
    const key = `${r.test_name.toLowerCase()}|${r.result_value}`;
    if (seen.has(key)) return; // reports often quote the same panel several times
    seen.add(key);
    out.push(r);
  };

  for (const m of flat.matchAll(LAB_INLINE)) {
    const name = m[1].replace(/^(i|and)\s+/i, '').replace(/^.*\burađeni\s+\S+\s*/i, '').trim();
    if (!name || /^\d/.test(name) || name.length < 2) continue;
    push({
      test_name: name,
      result_value: m[2].replace(/\s+/g, ' ').replace(',', '.'),
      flag: m[3] ?? null,
      reference_range: m[4].trim(),
      unit: m[5]?.trim() ?? null,
      source_text: m[0].replace(/^[,:;.\s]+/, '').trim(),
      confidence: m[5] ? 'high' : 'medium',
    });
  }
  for (const m of normalizeText(text).matchAll(LAB_TABLE)) {
    push({
      test_name: m[1].trim(),
      result_value: m[2].replace(',', '.'),
      flag: m[3] ?? null,
      unit: m[4],
      reference_range: m[5].replace(/\s+/g, ''),
      source_text: m[0].trim(),
      confidence: 'medium',
    });
  }
  // Dynamic (stimulation) tests: "HORMONA RASTA(ng/ml): 0 minut:0.315 30 minut:4.230 …"
  for (const m of flat.matchAll(STIM_TEST)) {
    const base = /HORMON/i.test(m[1]) ? 'Hormon rasta' : /KORTIZOL/i.test(m[1]) ? 'Kortizol' : 'Glukoza';
    for (const p of m[3].matchAll(/(\d+)\s*minut[a]?\s*:\s*([\d.,]+)/gi)) {
      push({
        test_name: `${base} (${p[1]} min)`,
        result_value: num(p[2]).replace(/\.$/, ''),
        unit: m[2].trim(),
        reference_range: null,
        flag: null,
        source_text: `${m[1]} ${p[0]}`,
        confidence: 'medium',
      });
    }
  }
  return out;
}

export function extractLabDate(text: string): ExtractedField | null {
  const m = text.replace(/\n/g, ' ').match(new RegExp(`(?:Laboratorijski nalazi|analize|uzorak)[^.]{0,30}?(?:ura[đd]eni|uzet[a-z]*|od)\\s*:?\\s*${DATE_RE.source}`, 'i'));
  const iso = toIsoDate(m);
  return iso ? { name: 'lab_date', value: iso, confidence: 'high' } : null;
}

export function classify(text: string, labCount: number): DocumentCategory {
  const t = text.toLowerCase();
  const head = t.split('\n').slice(0, 30).join(' ');
  if (/\brecept\b|lekarski recept/.test(head)) return 'prescription';
  if (/\buput\b|uputnica/.test(head)) return 'referral';
  if (/radiolog|rtg snimak|mr pregled|ultrazvu|\bct\b/.test(head) && !/endokrinolog/.test(head)) return 'imaging';
  if (labCount >= 3 && !/izve[šs]taj lekara|nalaz i mi[šs]ljenje|specijalisti[čc]ki/.test(head)) return 'laboratory';
  if (/izve[šs]taj|nalaz i mi[šs]ljenje|specijalisti[čc]ki|anamnez/.test(t)) return 'doctor_report';
  if (labCount >= 3) return 'laboratory';
  return 'other';
}

const CATEGORY_TITLE: Record<DocumentCategory, string> = {
  doctor_report: 'Izveštaj lekara',
  laboratory: 'Laboratorija',
  prescription: 'Recept',
  referral: 'Uput',
  imaging: 'Snimak / imidžing',
  therapy: 'Terapija',
  other: 'Dokument',
};

export function extractAll(rawText: string): ExtractionResult {
  const text = normalizeText(rawText);
  const labResults = extractLabResults(text);
  const documentType = classify(text, labResults.length);
  const fields: ExtractedField[] = [];
  const add = (f: ExtractedField | null) => f && fields.push(f);

  const date = extractDocumentDate(text);
  add(date);
  add(extractDoctor(text));
  const specialty = extractSpecialty(text);
  add(specialty);
  add(extractClinic(text));
  add(extractDiagnosis(text));
  extractTherapy(text).forEach(add);
  add(extractFollowUp(text, date?.value ?? null));
  extractMeasurements(text).forEach(add);
  if (labResults.length) add(extractLabDate(text));
  add({
    name: 'title',
    value: specialty && documentType !== 'laboratory' ? `${CATEGORY_TITLE[documentType]} — ${specialty.value}` : CATEGORY_TITLE[documentType],
    confidence: 'medium',
  });
  return { documentType, fields, labResults };
}

/** Lower confidence when the OCR engine itself was unsure. */
export function adjustForOcrConfidence<T extends { confidence: Confidence }>(items: T[], ocrConfidence: number | null): T[] {
  if (ocrConfidence === null || ocrConfidence >= 75) return items;
  const down: Record<Confidence, Confidence> = { high: 'medium', medium: 'low', low: 'low' };
  return items.map((i) => ({ ...i, confidence: down[i.confidence] }));
}
