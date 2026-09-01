export const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

export const formatWaitTime = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return 'some time';
  if (seconds < 60) return `${seconds} second(s)`;
  return `${Math.ceil(seconds / 60)} minute(s)`;
};
