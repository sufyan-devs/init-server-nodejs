import mongoose from 'mongoose';
import { envConfig } from '@config/env';
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
    description: 'Coupon vendor',
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
    await mongoose.connect(envConfig.MONGO_URI);
    console.warn('MongoDB connected');

    for (const roleData of ROLES) {
      const existing = await Role.findOne({ code: roleData.code });

      if (existing) {
        await Role.updateOne({ code: roleData.code }, { $set: roleData });
        console.warn(`Role updated: ${roleData.code}`);
      } else {
        await Role.create(roleData);
        console.warn(`Role created: ${roleData.code}`);
      }
    }

    console.warn(`\nAll ${ROLES.length} roles seeded`);
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

void seedRoles();
