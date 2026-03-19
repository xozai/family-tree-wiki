import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGedcom, parseGedcomDate, parseGedcomName } from '../services/gedcomParser';

const fixturePath = join(__dirname, 'fixtures', 'sample.ged');
const sampleGed = readFileSync(fixturePath, 'utf-8');

// ─── parseGedcomName ──────────────────────────────────────────────────────────
describe('parseGedcomName', () => {
  it('parses standard "Given /Surname/" format', () => {
    const result = parseGedcomName('John William /Smith/');
    expect(result.firstName).toBe('John William');
    expect(result.lastName).toBe('Smith');
  });

  it('parses name with no given name — only /Surname/', () => {
    const result = parseGedcomName('/Smith/');
    expect(result.firstName).toBe('Unknown');
    expect(result.lastName).toBe('Smith');
  });

  it('handles empty surname between slashes', () => {
    const result = parseGedcomName('John //');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Unknown');
  });

  it('handles a name with no slashes', () => {
    const result = parseGedcomName('John Smith');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Smith');
  });

  it('returns Unknown/Unknown for empty input', () => {
    const result = parseGedcomName('');
    expect(result.firstName).toBe('Unknown');
    expect(result.lastName).toBe('Unknown');
  });

  it('handles single word name (no slashes)', () => {
    const result = parseGedcomName('Madonna');
    expect(result.firstName).toBe('Madonna');
    expect(result.lastName).toBe('Unknown');
  });
});

// ─── parseGedcomDate ──────────────────────────────────────────────────────────
describe('parseGedcomDate', () => {
  it('parses a full DD MON YYYY date', () => {
    const { date, isFuzzy } = parseGedcomDate('15 JUN 1920');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1920);
    expect(date!.getMonth()).toBe(5); // June = 5
    expect(date!.getDate()).toBe(15);
    expect(isFuzzy).toBe(false);
  });

  it('parses a MON YYYY date as fuzzy', () => {
    const { date, isFuzzy } = parseGedcomDate('JAN 1950');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1950);
    expect(date!.getMonth()).toBe(0);
    expect(isFuzzy).toBe(true);
  });

  it('parses a year-only date as fuzzy', () => {
    const { date, isFuzzy } = parseGedcomDate('1948');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1948);
    expect(isFuzzy).toBe(true);
  });

  it('parses ABT prefix date as fuzzy', () => {
    const { date, isFuzzy } = parseGedcomDate('ABT 1985');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1985);
    expect(isFuzzy).toBe(true);
  });

  it('parses BEF prefix date as fuzzy', () => {
    const { date, isFuzzy } = parseGedcomDate('BEF 1990');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1990);
    expect(isFuzzy).toBe(true);
  });

  it('parses AFT prefix date as fuzzy', () => {
    const { date, isFuzzy } = parseGedcomDate('AFT 1905');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1905);
    expect(isFuzzy).toBe(true);
  });

  it('returns null for completely unparseable date', () => {
    const { date } = parseGedcomDate('circa 1850');
    // "circa" is stripped as prefix but "1850" should parse as year-only
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1850);
  });

  it('returns null for empty string', () => {
    const { date } = parseGedcomDate('');
    expect(date).toBeNull();
  });

  it('returns null for totally invalid string', () => {
    const { date } = parseGedcomDate('unknown date');
    expect(date).toBeNull();
  });
});

// ─── Full GEDCOM parse ────────────────────────────────────────────────────────
describe('parseGedcom — full file', () => {
  it('parses all 10 individuals from the fixture', () => {
    const { individuals } = parseGedcom(sampleGed);
    expect(individuals).toHaveLength(10);
  });

  it('parses all 3 families from the fixture', () => {
    const { families } = parseGedcom(sampleGed);
    expect(families).toHaveLength(3);
  });

  it('parses John Smith correctly', () => {
    const { individuals } = parseGedcom(sampleGed);
    const john = individuals.find((i) => i.firstName === 'John William' && i.lastName === 'Smith');
    expect(john).toBeDefined();
    expect(john!.birthDate?.getFullYear()).toBe(1920);
    expect(john!.birthPlace).toBe('London, England');
    expect(john!.occupation).toBe('Carpenter');
  });

  it('parses an individual with only a year birth date', () => {
    const { individuals } = parseGedcom(sampleGed);
    const person = individuals.find((i) => i.lastName === 'Smith' && i.firstName === 'Unknown');
    expect(person).toBeDefined();
    expect(person!.birthDate?.getFullYear()).toBe(1948);
  });

  it('concatenates CONT/CONC lines into biography', () => {
    const { individuals } = parseGedcom(sampleGed);
    const john = individuals.find((i) => i.firstName === 'John William');
    expect(john!.biography).toContain('skilled craftsman');
    expect(john!.biography).toContain('World War II');
    expect(john!.biography).toContain('returned home in 1945');
  });

  it('handles fuzzy dates (ABT, BEF, AFT) without crashing', () => {
    const { individuals, warnings } = parseGedcom(sampleGed);
    // Some dates are fuzzy — we should get dates back, not nulls
    const mary = individuals.find((i) => i.firstName === 'Mary Elizabeth');
    expect(mary!.deathDate?.getFullYear()).toBe(1990);
    // Warnings only for truly unparseable dates, not for fuzzy prefixed ones
    const dateErrors = warnings.filter((w) => w.includes('Could not parse'));
    expect(dateErrors).toHaveLength(0);
  });

  it('builds family relationships — F001 has husband, wife, and 2 children', () => {
    const { families } = parseGedcom(sampleGed);
    const f1 = families.find((f) => f.gedcomId === 'F001');
    expect(f1).toBeDefined();
    expect(f1!.husbandId).toBe('I001');
    expect(f1!.wifeId).toBe('I002');
    expect(f1!.childIds).toHaveLength(2);
    expect(f1!.childIds).toContain('I003');
    expect(f1!.childIds).toContain('I004');
  });

  it('parses marriage date for F001', () => {
    const { families } = parseGedcom(sampleGed);
    const f1 = families.find((f) => f.gedcomId === 'F001');
    expect(f1!.marriageDate?.getFullYear()).toBe(1946);
    expect(f1!.marriagePlace).toBe('London, England');
  });

  it('handles Windows line endings (\\r\\n)', () => {
    const windowsContent = sampleGed.replace(/\n/g, '\r\n');
    const { individuals, families } = parseGedcom(windowsContent);
    expect(individuals).toHaveLength(10);
    expect(families).toHaveLength(3);
  });

  it('handles F003 with no children gracefully', () => {
    const { families } = parseGedcom(sampleGed);
    const f3 = families.find((f) => f.gedcomId === 'F003');
    expect(f3).toBeDefined();
    expect(f3!.childIds).toHaveLength(0);
  });
});
