import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function gedDate(d: Date | null): string {
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function gedTag(level: number, tag: string, value?: string): string {
  if (!value) return '';
  return `${level} ${tag} ${value}\n`;
}

// Wrap long text in CONT lines (max 255 chars per line per GEDCOM spec)
function wrapNote(level: number, text: string): string {
  const stripped = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return '';
  const lines = stripped.split('\n');
  let out = `${level} NOTE ${lines[0]}\n`;
  for (let i = 1; i < lines.length; i++) {
    out += `${level + 1} CONT ${lines[i]}\n`;
  }
  return out;
}

// GET /api/export/gedcom
export async function exportGedcom(req: AuthRequest, res: Response): Promise<void> {
  const isAdmin = req.user?.role === 'ADMIN';

  const [members, relationships] = await Promise.all([
    prisma.familyMember.findMany({
      where: isAdmin ? {} : { privacyLevel: 'PUBLIC' },
      orderBy: { lastName: 'asc' },
    }),
    prisma.relationship.findMany({
      where: { relationshipType: 'PARENT' }, // use PARENT only to build FAM records
    }),
  ]);

  // Build a lookup: memberId → short GEDCOM ID like @I1@
  const idMap = new Map<string, string>();
  members.forEach((m, i) => idMap.set(m.id, `I${i + 1}`));

  let out = '';

  // ── HEAD ────────────────────────────────────────────────────────────────────
  out += `0 HEAD\n`;
  out += `1 SOUR FamilyTreeWiki\n`;
  out += `2 NAME Family Tree Wiki\n`;
  out += `1 GEDC\n`;
  out += `2 VERS 5.5.1\n`;
  out += `1 CHAR UTF-8\n`;
  out += `1 DATE ${gedDate(new Date())}\n`;

  // ── INDI records ────────────────────────────────────────────────────────────
  for (const m of members) {
    const gid = idMap.get(m.id)!;
    out += `0 @${gid}@ INDI\n`;

    // Name: "FirstName /LastName/"
    const nameParts = [m.firstName, m.maidenName ? `/${m.maidenName}/` : null, `/${m.lastName}/`]
      .filter(Boolean)
      .join(' ');
    out += gedTag(1, 'NAME', nameParts);

    if (m.birthDate || m.birthPlace) {
      out += `1 BIRT\n`;
      if (m.birthDate) out += gedTag(2, 'DATE', gedDate(m.birthDate));
      if (m.birthPlace) out += gedTag(2, 'PLAC', m.birthPlace);
    }

    if (m.deathDate || m.deathPlace) {
      out += `1 DEAT\n`;
      if (m.deathDate) out += gedTag(2, 'DATE', gedDate(m.deathDate));
      if (m.deathPlace) out += gedTag(2, 'PLAC', m.deathPlace);
    }

    if (m.occupation) out += gedTag(1, 'OCCU', m.occupation);
    if (m.biography) out += wrapNote(1, m.biography);

    // Family links will be added via FAM records
  }

  // ── FAM records — group by parent pairs ─────────────────────────────────────
  // Build a map: "parentAId:parentBId" → [childId, ...]
  // First, find spouse pairs
  const spouseRels = await prisma.relationship.findMany({
    where: { relationshipType: 'SPOUSE' },
  });

  // Build family groupings: key = sorted pair of parent IDs
  type FamRecord = { husbandId: string | null; wifeId: string | null; childIds: string[] };
  const famMap = new Map<string, FamRecord>();

  // Index spouse relationships
  for (const rel of spouseRels) {
    const key = [rel.personAId, rel.personBId].sort().join(':');
    if (!famMap.has(key)) {
      famMap.set(key, { husbandId: rel.personAId, wifeId: rel.personBId, childIds: [] });
    }
  }

  // Group children by their parents
  // For each child, find their parent pair
  type ParentRelWithB = { personAId: string; personBId: string };
  const parentsByChild = new Map<string, string[]>();
  for (const rel of relationships as ParentRelWithB[]) {
    const list = parentsByChild.get(rel.personBId) ?? [];
    list.push(rel.personAId);
    parentsByChild.set(rel.personBId, list);
  }

  for (const [childId, parentIds] of parentsByChild) {
    if (parentIds.length >= 2) {
      const key = [...parentIds].sort().join(':');
      if (famMap.has(key)) {
        famMap.get(key)!.childIds.push(childId);
      } else {
        famMap.set(key, { husbandId: parentIds[0], wifeId: parentIds[1], childIds: [childId] });
      }
    } else if (parentIds.length === 1) {
      // Single parent — create a family with just one parent
      const key = `solo:${parentIds[0]}`;
      if (!famMap.has(key)) {
        famMap.set(key, { husbandId: parentIds[0], wifeId: null, childIds: [] });
      }
      famMap.get(key)!.childIds.push(childId);
    }
  }

  let famIndex = 1;
  for (const fam of famMap.values()) {
    const hGid = fam.husbandId ? idMap.get(fam.husbandId) : null;
    const wGid = fam.wifeId ? idMap.get(fam.wifeId) : null;

    // Only emit FAM record if at least one member is in our export
    if (!hGid && !wGid) continue;

    out += `0 @F${famIndex}@ FAM\n`;
    if (hGid) out += gedTag(1, 'HUSB', `@${hGid}@`);
    if (wGid) out += gedTag(1, 'WIFE', `@${wGid}@`);
    for (const childId of fam.childIds) {
      const cGid = idMap.get(childId);
      if (cGid) out += gedTag(1, 'CHIL', `@${cGid}@`);
    }
    famIndex++;
  }

  // ── TRLR ────────────────────────────────────────────────────────────────────
  out += `0 TRLR\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="family-tree-${Date.now()}.ged"`);
  res.send(out);
}
