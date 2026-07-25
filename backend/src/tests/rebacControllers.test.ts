import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMembers } from '../controllers/membersController';
import { getMemberTree } from '../controllers/treeController';
import { exportGedcom } from '../controllers/exportController';
import { AuthRequest } from '../middleware/authenticate';

const mocks = vi.hoisted(() => ({
  familyMember: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  userProfileLink: {
    findMany: vi.fn(),
  },
  editorGrant: {
    findMany: vi.fn(),
  },
  relationship: {
    findMany: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({
  prisma: mocks,
}));

const viewer = { userId: 'viewer-user', email: 'viewer@example.com', role: 'VIEWER' } as const;

function authReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    query: {},
    params: {},
    user: viewer,
    ...overrides,
  } as AuthRequest;
}

function jsonRes() {
  const res: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    status: any;
    json: any;
    send: any;
    setHeader: any;
  } = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    send: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      res.headers[key] = value;
      return res;
    }),
  };
  return res;
}

const publicLivingMember = {
  id: 'public-living',
  firstName: 'Public',
  lastName: 'Living',
  maidenName: null,
  birthDate: new Date('1990-01-01T00:00:00Z'),
  birthPlace: 'Private Birthplace',
  deathDate: null,
  deathPlace: null,
  biography: 'Sensitive biography',
  occupation: 'Sensitive occupation',
  education: 'Sensitive education',
  achievements: 'Sensitive achievement',
  privacyLevel: 'PUBLIC' as const,
  isLiving: true,
  isMinor: false,
  media: [{ id: 'media-1', fileUrl: '/uploads/public-living.jpg' }],
  tags: [],
};

const linkedSelfMember = {
  id: 'self',
  firstName: 'Self',
  lastName: 'Viewer',
  maidenName: null,
  birthDate: new Date('1985-01-01T00:00:00Z'),
  birthPlace: 'Visible Birthplace',
  deathDate: null,
  deathPlace: null,
  biography: 'Visible biography',
  occupation: 'Visible occupation',
  education: 'Visible education',
  achievements: 'Visible achievement',
  privacyLevel: 'PRIVATE' as const,
  isLiving: true,
  isMinor: false,
  media: [{ id: 'media-2', fileUrl: '/uploads/self.jpg' }],
  tags: [],
};

describe('relationship-aware member route controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userProfileLink.findMany.mockResolvedValue([{ familyMemberId: 'self' }]);
    mocks.editorGrant.findMany.mockResolvedValue([]);
    mocks.relationship.findMany.mockResolvedValue([]);
  });

  it('redacts sensitive fields from list results for public living people unrelated to the viewer', async () => {
    mocks.familyMember.findMany.mockResolvedValue([publicLivingMember, linkedSelfMember]);
    mocks.familyMember.count.mockResolvedValue(2);

    const res = jsonRes();
    await listMembers(authReq({ query: { limit: '20', page: '1' } }), res as never);

    expect(res.json).toHaveBeenCalledOnce();
    const body = res.body as { members: typeof publicLivingMember[] };
    expect(body.members[0]).toMatchObject({
      id: 'public-living',
      birthDate: null,
      birthPlace: null,
      biography: null,
      occupation: null,
      education: null,
      achievements: null,
      media: [],
    });
    expect(body.members[1]).toMatchObject({
      id: 'self',
      birthDate: linkedSelfMember.birthDate,
      birthPlace: 'Visible Birthplace',
      biography: 'Visible biography',
      media: linkedSelfMember.media,
    });
  });

  it('omits living/minor years from tree nodes when the viewer can see the profile but not sensitive fields', async () => {
    mocks.familyMember.findMany.mockResolvedValue([
      { ...publicLivingMember, media: [{ fileUrl: '/uploads/public-living.jpg' }] },
    ]);
    mocks.relationship.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = jsonRes();
    await getMemberTree(authReq({ params: { id: 'public-living' }, query: { mode: 'descendants', depth: '2' } }), res as never);

    expect(res.json).toHaveBeenCalledOnce();
    const body = res.body as { root: { id: string; birthYear: number | null; deathYear: number | null; photo: string | null } };
    expect(body.root).toMatchObject({
      id: 'public-living',
      birthYear: null,
      deathYear: null,
      photo: null,
    });
  });

  it('exports GEDCOM without unauthorized public living details for unrelated viewers', async () => {
    mocks.familyMember.findMany.mockResolvedValue([publicLivingMember]);
    mocks.relationship.findMany
      .mockResolvedValueOnce([]) // access context relationships
      .mockResolvedValueOnce([]) // parent relationships for FAM records
      .mockResolvedValueOnce([]); // spouse relationships

    const res = jsonRes();
    await exportGedcom(authReq(), res as never);

    const gedcom = res.body as string;
    expect(gedcom).toContain('0 @I1@ INDI');
    expect(gedcom).toContain('1 NAME Public /Living/');
    expect(gedcom).not.toContain('Private Birthplace');
    expect(gedcom).not.toContain('Sensitive biography');
    expect(gedcom).not.toContain('Sensitive occupation');
  });
});
