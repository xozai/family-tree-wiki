import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { parseGedcom } from '../services/gedcomParser';

export interface ImportSummary {
  imported: { members: number; relationships: number };
  skipped: { duplicates: number; unparseable: number };
  warnings: string[];
}

// ─── Preview — parse only, no DB writes ──────────────────────────────────────
export async function previewGedcomImport(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const content = req.file.buffer.toString('utf-8');
  const { individuals, families, warnings } = parseGedcom(content);

  // Determine date range from individuals with birth dates
  const birthYears = individuals
    .filter((i) => i.birthDate)
    .map((i) => i.birthDate!.getFullYear())
    .sort((a, b) => a - b);

  res.json({
    preview: {
      individualsCount: individuals.length,
      familiesCount: families.length,
      dateRange:
        birthYears.length >= 2
          ? { earliest: birthYears[0], latest: birthYears[birthYears.length - 1] }
          : birthYears.length === 1
          ? { earliest: birthYears[0], latest: birthYears[0] }
          : null,
      sampleNames: individuals.slice(0, 5).map((i) => `${i.firstName} ${i.lastName}`),
    },
    warnings: warnings.slice(0, 10),
  });
}

// ─── Confirm import — write to DB ─────────────────────────────────────────────
export async function confirmGedcomImport(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const userId = req.user!.userId;
  const content = req.file.buffer.toString('utf-8');
  const { individuals, families, warnings } = parseGedcom(content);

  const summary: ImportSummary = {
    imported: { members: 0, relationships: 0 },
    skipped: { duplicates: 0, unparseable: 0 },
    warnings: [...warnings],
  };

  // Map: gedcomId → DB uuid (built during import)
  const gedcomIdToDbId = new Map<string, string>();

  // ── Phase 1: Import individuals ─────────────────────────────────────────────
  for (const individual of individuals) {
    // Basic validation
    if (!individual.firstName && !individual.lastName) {
      summary.skipped.unparseable++;
      continue;
    }

    // Duplicate check: same full name + birth year
    const birthYear = individual.birthDate?.getFullYear() ?? null;
    const existingWhere: Record<string, unknown> = {
      firstName: individual.firstName,
      lastName: individual.lastName,
    };
    if (birthYear) {
      existingWhere.birthDate = {
        gte: new Date(birthYear, 0, 1),
        lt: new Date(birthYear + 1, 0, 1),
      };
    }

    const existing = await prisma.familyMember.findFirst({ where: existingWhere });
    if (existing) {
      summary.skipped.duplicates++;
      summary.warnings.push(
        `Skipped duplicate: ${individual.firstName} ${individual.lastName}${birthYear ? ` (b. ${birthYear})` : ''}`,
      );
      // Still map the gedcomId so relationships can reference them
      gedcomIdToDbId.set(individual.gedcomId, existing.id);
      continue;
    }

    try {
      const member = await prisma.$transaction(async (tx) => {
        const m = await tx.familyMember.create({
          data: {
            firstName: individual.firstName,
            lastName: individual.lastName,
            maidenName: individual.maidenName ?? null,
            birthDate: individual.birthDate ?? null,
            birthPlace: individual.birthPlace ?? null,
            deathDate: individual.deathDate ?? null,
            deathPlace: individual.deathPlace ?? null,
            occupation: individual.occupation ?? null,
            biography: individual.biography
              ? `<p>${individual.biography.replace(/\n/g, '</p><p>')}</p>`
              : null,
            privacyLevel: 'PUBLIC',
            createdById: userId,
            lastEditedById: userId,
          },
        });

        await tx.profileRevision.create({
          data: {
            familyMemberId: m.id,
            contentSnapshot: {
              firstName: m.firstName,
              lastName: m.lastName,
              birthDate: m.birthDate,
              birthPlace: m.birthPlace,
              source: 'GEDCOM import',
            },
            editSummary: 'Imported via GEDCOM file',
            editedById: userId,
          },
        });

        return m;
      });

      gedcomIdToDbId.set(individual.gedcomId, member.id);
      summary.imported.members++;
    } catch (e) {
      summary.skipped.unparseable++;
      summary.warnings.push(
        `Failed to save ${individual.firstName} ${individual.lastName}: ${String(e)}`,
      );
    }
  }

  // ── Phase 2: Import relationships from FAM records ──────────────────────────
  type RelationshipInput = {
    personAId: string;
    personBId: string;
    relationshipType: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
    confidence: number;
  };

  const relationshipPairs: RelationshipInput[] = [];
  const seen = new Set<string>();

  const addPair = (
    aGedId: string,
    bGedId: string,
    type: RelationshipInput['relationshipType'],
  ) => {
    const aId = gedcomIdToDbId.get(aGedId);
    const bId = gedcomIdToDbId.get(bGedId);
    if (!aId || !bId || aId === bId) return;
    const key = `${aId}:${bId}:${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    relationshipPairs.push({ personAId: aId, personBId: bId, relationshipType: type, confidence: 100 });
  };

  for (const family of families) {
    // Spouse relationship
    if (family.husbandId && family.wifeId) {
      addPair(family.husbandId, family.wifeId, 'SPOUSE');
      addPair(family.wifeId, family.husbandId, 'SPOUSE');
    }

    // Parent → child / child → parent relationships
    const parents = [family.husbandId, family.wifeId].filter(Boolean) as string[];
    for (const parentGedId of parents) {
      for (const childGedId of family.childIds) {
        addPair(parentGedId, childGedId, 'PARENT');
        addPair(childGedId, parentGedId, 'CHILD');
      }
    }

    // Sibling relationships (children within same family)
    for (let i = 0; i < family.childIds.length; i++) {
      for (let j = i + 1; j < family.childIds.length; j++) {
        addPair(family.childIds[i], family.childIds[j], 'SIBLING');
        addPair(family.childIds[j], family.childIds[i], 'SIBLING');
      }
    }
  }

  // Batch-insert relationships (skip duplicates)
  if (relationshipPairs.length > 0) {
    try {
      const result = await prisma.relationship.createMany({
        data: relationshipPairs,
        skipDuplicates: true,
      });
      summary.imported.relationships = result.count;
    } catch (e) {
      summary.warnings.push(`Some relationships could not be saved: ${String(e)}`);
    }
  }

  res.status(201).json(summary);
}
