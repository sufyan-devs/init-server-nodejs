import { connectDatabase, disconnectDatabase } from '@config/database';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';
import Role, { ROLE_CODE, ROLE_TYPE } from '@user/models/Role';

const IN_PROD: boolean = envConfig.IN_PROD;

const ROLES = [
  {
    code: ROLE_CODE.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full platform access',
    roleType: ROLE_TYPE.SYSTEM,
    canSelfRegister: false,
    autoApproveOnSignup: true,
    emailVerificationRequired: false,
    isActive: true,
  },
  {
    code: ROLE_CODE.ADMIN,
    name: 'Admin',
    description: 'Platform administration',
    roleType: ROLE_TYPE.SYSTEM,
    canSelfRegister: false,
    autoApproveOnSignup: true,
    emailVerificationRequired: false,
    isActive: true,
  },
  {
    code: ROLE_CODE.VENDOR,
    name: 'Vendor',
    description: 'Vendor',
    roleType: ROLE_TYPE.APPLICATION,
    canSelfRegister: true,
    autoApproveOnSignup: !IN_PROD,
    emailVerificationRequired: IN_PROD,
    isActive: true,
  },
  {
    code: ROLE_CODE.BUSINESS_ASSOCIATE,
    name: 'Business Associate',
    description: 'Referral partner',
    roleType: ROLE_TYPE.APPLICATION,
    canSelfRegister: true,
    autoApproveOnSignup: !IN_PROD,
    emailVerificationRequired: IN_PROD,
    isActive: true,
  },
  {
    code: ROLE_CODE.CUSTOMER,
    name: 'Customer',
    description: 'End user / buyer',
    roleType: ROLE_TYPE.APPLICATION,
    canSelfRegister: true,
    autoApproveOnSignup: true,
    emailVerificationRequired: IN_PROD,
    isActive: true,
  },
];

const seedRoles = async (): Promise<void> => {
  try {
    await connectDatabase();

    for (const roleData of ROLES) {
      const existing = await Role.findOne({ code: roleData.code });

      if (existing) {
        await Role.updateOne({ code: roleData.code }, { $set: roleData });
        logger.info(`Role updated: ${roleData.code}`);
      } else {
        await Role.create(roleData);
        logger.info(`Role created: ${roleData.code}`);
      }
    }

    logger.info(`All ${ROLES.length} roles seeded`);
  } catch (error: unknown) {
    logger.error(`Seed failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
    process.exit();
  }
};

void seedRoles();
