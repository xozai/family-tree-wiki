-- Add verified user-to-family-member links and conservative profile flags.
CREATE TYPE "UserProfileLinkStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

ALTER TABLE "FamilyMember"
  ADD COLUMN "isLiving" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isMinor" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UserProfileLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyMemberId" TEXT NOT NULL,
  "status" "UserProfileLinkStatus" NOT NULL DEFAULT 'PENDING',
  "relationshipLabel" TEXT,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProfileLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfileLink_userId_familyMemberId_key"
  ON "UserProfileLink"("userId", "familyMemberId");

CREATE INDEX "UserProfileLink_userId_status_idx"
  ON "UserProfileLink"("userId", "status");

CREATE INDEX "UserProfileLink_familyMemberId_status_idx"
  ON "UserProfileLink"("familyMemberId", "status");

ALTER TABLE "UserProfileLink"
  ADD CONSTRAINT "UserProfileLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProfileLink"
  ADD CONSTRAINT "UserProfileLink_familyMemberId_fkey"
  FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
