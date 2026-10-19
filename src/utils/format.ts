export const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

export const formatWaitTime = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return 'some time';
  if (seconds < 60) return `${seconds} second(s)`;
  return `${Math.ceil(seconds / 60)} minute(s)`;
};

export const formatFullName = (firstName: string, lastName: string): string =>
  `${firstName} ${lastName}`.trim();

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
