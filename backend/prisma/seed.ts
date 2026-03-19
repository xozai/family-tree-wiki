import { PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin1234567!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@familytree.local' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@familytree.local',
      passwordHash,
      fullName: 'Site Administrator',
      relationshipToFamily: 'Administrator',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log('Seeded admin user:', admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
