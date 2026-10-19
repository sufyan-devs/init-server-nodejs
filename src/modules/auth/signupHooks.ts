import type { Types } from 'mongoose';

interface SignupInput {
  roleCode: string;
  referralCode?: string | null;
}

interface SignupResult {
  userId: Types.ObjectId;
}

interface RoleApproval {
  userId: Types.ObjectId;
  roleCode: string;
}

// Runs before the user is created, so a rejection leaves nothing behind; the
// returned function runs once the role is assigned.
type SignupHook = (input: SignupInput) => Promise<(result: SignupResult) => Promise<void>>;

// Runs on every path that leaves a role APPROVED: auto-approval at signup or on
// request, an admin approving a request, and an admin creating a user.
type RoleApprovedHook = (approval: RoleApproval) => Promise<void>;

let signupHook: SignupHook | null = null;
let roleApprovedHook: RoleApprovedHook | null = null;

const setSignupHook = (hook: SignupHook): void => {
  signupHook = hook;
};

const setRoleApprovedHook = (hook: RoleApprovedHook): void => {
  roleApprovedHook = hook;
};

const runSignupHook = (input: SignupInput) => signupHook?.(input);

const runRoleApprovedHook = async (approval: RoleApproval): Promise<void> => {
  await roleApprovedHook?.(approval);
};

export type { SignupHook, RoleApprovedHook };
export { setSignupHook, setRoleApprovedHook, runSignupHook, runRoleApprovedHook };
