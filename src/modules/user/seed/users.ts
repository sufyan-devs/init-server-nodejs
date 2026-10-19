import { connectDatabase, disconnectDatabase } from '@config/database';
import { hashPassword, assertPasswordAllowed } from '@auth/index';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';
import User from '@user/models/User';
import { ROLE_CODE } from '@user/models/Role';
import type { RoleCode } from '@user/models/Role';
import UserRole from '@user/models/UserRole';

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleCode: RoleCode;
}

const ADMINS: SeedUser[] = [
  { email: 'admin@test.com', firstName: 'Admin', lastName: 'User', phone: '2025551234', roleCode: ROLE_CODE.ADMIN },
];

// One account per portal so the Postman collection can run against a fresh
// database. Never seeded in production - these are published credentials.
const TEST_USERS: SeedUser[] = [
  { email: 'vendor@test.com', firstName: 'Vendor', lastName: 'User', phone: '2025551235', roleCode: ROLE_CODE.VENDOR },
  { email: 'ba@test.com', firstName: 'Business', lastName: 'Associate', phone: '2025551236', roleCode: ROLE_CODE.BUSINESS_ASSOCIATE },
  { email: 'customer@test.com', firstName: 'Customer', lastName: 'User', phone: '2025551237', roleCode: ROLE_CODE.CUSTOMER },
];

const seedPassword = (): string => {
  if (envConfig.SEED_ADMIN_PASSWORD) return envConfig.SEED_ADMIN_PASSWORD;
  if (envConfig.IN_PROD) {
    throw new Error('SEED_ADMIN_PASSWORD is required in production - the development default is public.');
  }
  return 'Qa-Test-99';
};

const seedUser = async (entry: SeedUser, password: string): Promise<void> => {
  const { email, firstName, lastName, phone, roleCode } = entry;

  let user = await User.findByEmail(email);
  if (user) {
    logger.info(`exists  ${email}`);
  } else {
    user = await User.create({
      email,
      passwordHash: await hashPassword(password),
      firstName,
      lastName,
      phone,
      emailVerified: true,
    });
    logger.info(`created ${email}`);
  }

  const existing = await UserRole.findOne({ userId: user._id, roleCode });
  if (existing) return;

  await UserRole.assignRole(user._id, roleCode, { autoApprove: true });
  logger.info(`  role  ${roleCode}`);
};

const seedUsers = async (): Promise<void> => {
  try {
    const password = seedPassword();
    // Seeds bypass the registration controller, so the policy is not otherwise applied.
    await assertPasswordAllowed(password);

    await connectDatabase();

    const entries = envConfig.IN_PROD ? ADMINS : [...ADMINS, ...TEST_USERS];
    for (const entry of entries) await seedUser(entry, password);

    logger.info(`Seeded ${entries.length} user(s).`);
    if (!envConfig.IN_PROD) {
      logger.info(`Password for all of them: ${password}`);
      logger.info('Override with SEED_ADMIN_PASSWORD. Change it after first login.');
    }
  } catch (error: unknown) {
    logger.error(`Seed failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
    process.exit();
  }
};

void seedUsers();
