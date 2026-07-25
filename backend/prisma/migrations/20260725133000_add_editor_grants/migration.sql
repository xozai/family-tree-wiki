-- CreateEnum
CREATE TYPE "EditorGrantScope" AS ENUM ('PROFILE', 'SUBTREE', 'MEDIA');

-- CreateTable
CREATE TABLE "EditorGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "scope" "EditorGrantScope" NOT NULL DEFAULT 'PROFILE',
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditorGrant_userId_familyMemberId_scope_key" ON "EditorGrant"("userId", "familyMemberId", "scope");

-- CreateIndex
CREATE INDEX "EditorGrant_userId_scope_idx" ON "EditorGrant"("userId", "scope");

-- CreateIndex
CREATE INDEX "EditorGrant_familyMemberId_scope_idx" ON "EditorGrant"("familyMemberId", "scope");

-- AddForeignKey
ALTER TABLE "EditorGrant" ADD CONSTRAINT "EditorGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorGrant" ADD CONSTRAINT "EditorGrant_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
