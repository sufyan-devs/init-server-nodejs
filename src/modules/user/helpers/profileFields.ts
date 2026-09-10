import type { IUser } from '@user/models/User';

interface ProfileFields {
  fullName?: string;
  phoneNumber?: string;
  dateOfBirth?: Date | null;
}

// The schema stores first and last separately; every client sends one field.
export const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || parts[0] };
};

export const applyProfileFields = (user: IUser, fields: ProfileFields): void => {
  const { fullName, phoneNumber, dateOfBirth } = fields;

  if (fullName) {
    const { firstName, lastName } = splitFullName(fullName);
    user.firstName = firstName;
    user.lastName = lastName;
  }

  // A new number un-verifies it: the old verification proved the old number.
  if (phoneNumber !== undefined && phoneNumber !== user.phone) {
    user.phone = phoneNumber === '' ? undefined : phoneNumber;
    user.phoneVerified = false;
  }

  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
};
