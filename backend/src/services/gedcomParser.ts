/**
 * GEDCOM 5.5 / 5.5.1 Parser
 * Supports: INDI, FAM, NAME, BIRT, DEAT, PLAC, DATE, SEX, OCCU, NOTE, MARR, HUSB, WIFE, CHIL
 * Handles: CONC/CONT continuation, fuzzy dates, ANSEL/UTF-8 encodings, Windows line endings
 */

export interface ParsedIndividual {
  gedcomId: string;
  firstName: string;
  lastName: string;
  maidenName?: string;
  birthDate?: Date | null;
  birthDateRaw?: string;
  birthPlace?: string;
  deathDate?: Date | null;
  deathDateRaw?: string;
  deathPlace?: string;
  occupation?: string;
  sex?: string;
  biography?: string;
}

export interface ParsedFamily {
  gedcomId: string;
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
  marriageDate?: Date | null;
  marriageDateRaw?: string;
  marriagePlace?: string;
}

export interface ParsedGedcom {
  individuals: ParsedIndividual[];
  families: ParsedFamily[];
  warnings: string[];
}

interface GedcomLine {
  level: number;
  xref?: string;
  tag: string;
  value: string;
}

// ─── Month map ────────────────────────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const FUZZY_PREFIXES = /^(ABT|BEF|AFT|EST|CAL|CIRCA|CIR|FROM|TO|BET|AND)\s+/i;

// ─── Date parser ──────────────────────────────────────────────────────────────
export function parseGedcomDate(raw: string): { date: Date | null; isFuzzy: boolean } {
  if (!raw || !raw.trim()) return { date: null, isFuzzy: false };

  const stripped = raw.trim().replace(FUZZY_PREFIXES, '');
  const isFuzzy = FUZZY_PREFIXES.test(raw.trim());

  const parts = stripped.trim().split(/\s+/);

  try {
    if (parts.length === 3) {
      // DD MON YYYY
      const day = parseInt(parts[0], 10);
      const month = MONTH_MAP[parts[1].toUpperCase()];
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && month !== undefined && !isNaN(year)) {
        return { date: new Date(year, month, day), isFuzzy };
      }
    }
    if (parts.length === 2) {
      // MON YYYY
      const month = MONTH_MAP[parts[0].toUpperCase()];
      const year = parseInt(parts[1], 10);
      if (month !== undefined && !isNaN(year)) {
        return { date: new Date(year, month, 1), isFuzzy: true };
      }
    }
    if (parts.length === 1) {
      // YYYY
      const year = parseInt(parts[0], 10);
      if (!isNaN(year) && year > 1000 && year < 2100) {
        return { date: new Date(year, 0, 1), isFuzzy: true };
      }
    }
  } catch {
    // fall through
  }

  return { date: null, isFuzzy: true };
}

// ─── Name parser ──────────────────────────────────────────────────────────────
export function parseGedcomName(raw: string): {
  firstName: string;
  lastName: string;
  maidenName?: string;
} {
  if (!raw || !raw.trim()) {
    return { firstName: 'Unknown', lastName: 'Unknown' };
  }

  // Format: "Given /Surname/" or "Given /Surname/ Suffix"
  const surnameMatch = raw.match(/^(.*?)\s*\/([^/]*)\//);
  if (surnameMatch) {
    const given = surnameMatch[1].trim();
    const surname = surnameMatch[2].trim();
    const firstName = given || 'Unknown';
    const lastName = surname || 'Unknown';
    return { firstName, lastName };
  }

  // No slashes — treat whole string as full name
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] || 'Unknown', lastName: 'Unknown' };
  }
  const lastName = parts.pop() || 'Unknown';
  const firstName = parts.join(' ') || 'Unknown';
  return { firstName, lastName };
}

// ─── Line parser ──────────────────────────────────────────────────────────────
function parseLine(line: string): GedcomLine | null {
  // Normalise Windows line endings
  line = line.replace(/\r/g, '').trim();
  if (!line) return null;

  // GEDCOM line: LEVEL [XREF] TAG [VALUE]
  const match = line.match(/^(\d+)\s+(@[^@]+@\s+)?(\S+)\s*(.*)$/);
  if (!match) return null;

  return {
    level: parseInt(match[1], 10),
    xref: match[2]?.trim().replace(/@/g, ''),
    tag: match[3].toUpperCase(),
    value: match[4].trim(),
  };
}

// ─── Strip GEDCOM pointer ─────────────────────────────────────────────────────
function stripPointer(value: string): string {
  return value.replace(/@/g, '').trim();
}

// ─── Build record blocks ──────────────────────────────────────────────────────
interface GedcomRecord {
  id: string;
  tag: string;
  lines: GedcomLine[];
}

function buildRecords(lines: GedcomLine[]): GedcomRecord[] {
  const records: GedcomRecord[] = [];
  let current: GedcomRecord | null = null;

  for (const line of lines) {
    if (line.level === 0 && line.xref) {
      if (current) records.push(current);
      current = { id: line.xref, tag: line.tag, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) records.push(current);

  return records;
}

// ─── Extract subordinate block value (handles CONC/CONT) ─────────────────────
function extractValue(lines: GedcomLine[], parentLevel: number, tag: string): string {
  let value = '';
  let inBlock = false;

  for (const line of lines) {
    if (line.level === parentLevel + 1 && line.tag === tag) {
      value = line.value;
      inBlock = true;
    } else if (inBlock && line.level === parentLevel + 2) {
      if (line.tag === 'CONT') {
        value += '\n' + line.value;
      } else if (line.tag === 'CONC') {
        value += line.value;
      }
    } else if (inBlock && line.level <= parentLevel + 1 && line.tag !== tag) {
      inBlock = false;
    }
  }

  return value;
}

// ─── Extract date + place from an event block (e.g. BIRT, DEAT, MARR) ────────
function extractEventBlock(
  lines: GedcomLine[],
  eventTag: string,
): { dateRaw: string; place: string } {
  let dateRaw = '';
  let place = '';
  let inEvent = false;
  let eventLevel = -1;

  for (const line of lines) {
    if (line.tag === eventTag && !inEvent) {
      inEvent = true;
      eventLevel = line.level;
      continue;
    }
    if (inEvent) {
      if (line.level <= eventLevel) {
        // Exited the event block
        if (line.tag === eventTag) {
          // Another instance — reset (take last)
          inEvent = true;
          eventLevel = line.level;
          dateRaw = '';
          place = '';
        } else {
          break;
        }
      }
      if (line.tag === 'DATE') dateRaw = line.value;
      if (line.tag === 'PLAC') place = line.value;
    }
  }

  return { dateRaw, place };
}

// ─── Extract NOTE (handles CONC/CONT) ────────────────────────────────────────
function extractNote(lines: GedcomLine[]): string {
  const parts: string[] = [];
  let inNote = false;
  let noteLevel = -1;

  for (const line of lines) {
    if (line.tag === 'NOTE') {
      if (inNote) parts.push('\n');
      inNote = true;
      noteLevel = line.level;
      if (line.value) parts.push(line.value);
      continue;
    }
    if (inNote) {
      if (line.level <= noteLevel && line.tag !== 'CONT' && line.tag !== 'CONC') {
        inNote = false;
        continue;
      }
      if (line.tag === 'CONT') parts.push('\n' + line.value);
      else if (line.tag === 'CONC') parts.push(line.value);
    }
  }

  return parts.join('').trim();
}

// ─── Parse INDI record ────────────────────────────────────────────────────────
function parseIndividual(record: GedcomRecord, warnings: string[]): ParsedIndividual {
  const lines = record.lines;
  const nameRaw = extractValue(lines, 0, 'NAME');
  const { firstName, lastName, maidenName } = parseGedcomName(nameRaw);

  const birth = extractEventBlock(lines, 'BIRT');
  const death = extractEventBlock(lines, 'DEAT');

  let birthDate: Date | null = null;
  let deathDate: Date | null = null;

  if (birth.dateRaw) {
    const parsed = parseGedcomDate(birth.dateRaw);
    birthDate = parsed.date;
    if (!parsed.date && birth.dateRaw) {
      warnings.push(`Could not parse birth date '${birth.dateRaw}' for ${firstName} ${lastName}`);
    }
  }

  if (death.dateRaw) {
    const parsed = parseGedcomDate(death.dateRaw);
    deathDate = parsed.date;
    if (!parsed.date && death.dateRaw) {
      warnings.push(`Could not parse death date '${death.dateRaw}' for ${firstName} ${lastName}`);
    }
  }

  const sex = lines.find((l) => l.tag === 'SEX')?.value;
  const occupation = lines.find((l) => l.tag === 'OCCU')?.value;
  const note = extractNote(lines);

  return {
    gedcomId: record.id,
    firstName,
    lastName,
    maidenName,
    birthDate,
    birthDateRaw: birth.dateRaw || undefined,
    birthPlace: birth.place || undefined,
    deathDate,
    deathDateRaw: death.dateRaw || undefined,
    deathPlace: death.place || undefined,
    occupation: occupation || undefined,
    sex: sex || undefined,
    biography: note || undefined,
  };
}

// ─── Parse FAM record ─────────────────────────────────────────────────────────
function parseFamily(record: GedcomRecord, warnings: string[]): ParsedFamily {
  const lines = record.lines;
  const husbLine = lines.find((l) => l.tag === 'HUSB');
  const wifeLine = lines.find((l) => l.tag === 'WIFE');
  const childLines = lines.filter((l) => l.tag === 'CHIL');

  const marr = extractEventBlock(lines, 'MARR');
  let marriageDate: Date | null = null;

  if (marr.dateRaw) {
    const parsed = parseGedcomDate(marr.dateRaw);
    marriageDate = parsed.date;
    if (!parsed.date && marr.dateRaw) {
      warnings.push(`Could not parse marriage date '${marr.dateRaw}' for family ${record.id}`);
    }
  }

  return {
    gedcomId: record.id,
    husbandId: husbLine ? stripPointer(husbLine.value) : undefined,
    wifeId: wifeLine ? stripPointer(wifeLine.value) : undefined,
    childIds: childLines.map((l) => stripPointer(l.value)),
    marriageDate,
    marriageDateRaw: marr.dateRaw || undefined,
    marriagePlace: marr.place || undefined,
  };
}

// ─── Main parse function ──────────────────────────────────────────────────────
export function parseGedcom(content: string): ParsedGedcom {
  const warnings: string[] = [];

  // Normalise line endings
  const normalised = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalised.split('\n');

  const parsedLines: GedcomLine[] = [];
  for (const raw of rawLines) {
    const line = parseLine(raw);
    if (line) parsedLines.push(line);
  }

  const records = buildRecords(parsedLines);

  const individuals: ParsedIndividual[] = [];
  const families: ParsedFamily[] = [];

  for (const record of records) {
    if (record.tag === 'INDI') {
      try {
        individuals.push(parseIndividual(record, warnings));
      } catch (e) {
        warnings.push(`Could not parse individual ${record.id}: ${String(e)}`);
      }
    } else if (record.tag === 'FAM') {
      try {
        families.push(parseFamily(record, warnings));
      } catch (e) {
        warnings.push(`Could not parse family ${record.id}: ${String(e)}`);
      }
    }
  }

  return { individuals, families, warnings };
}
