import type { Types } from 'mongoose';

interface SignupInput {
  roleCode: string;
  referralCode?: string | null;
}

interface SignupResult {
  userId: Types.ObjectId;
  autoApproved: boolean;
}

// Runs before the user is created, so a rejection leaves nothing behind; the
// returned function runs once the role is assigned.
type SignupHook = (input: SignupInput) => Promise<(result: SignupResult) => Promise<void>>;

let signupHook: SignupHook | null = null;

const setSignupHook = (hook: SignupHook): void => {
  signupHook = hook;
};

const runSignupHook = (input: SignupInput) => signupHook?.(input);

export type { SignupHook };
export { setSignupHook, runSignupHook };
