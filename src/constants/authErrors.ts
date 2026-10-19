export interface AuthError {
  code: string;
  message: string;
  status: number;
}

const AUTH_ERRORS = {
  INVALID_CREDENTIALS: {
    code: "AUTH_INVALID_CREDENTIALS",
    message: "Invalid email or password.",
    status: 401,
  },
  USER_NOT_FOUND: {
    code: "AUTH_USER_NOT_FOUND",
    message: "No account found with this email.",
    status: 404,
  },
  ACCOUNT_INACTIVE: {
    code: "AUTH_ACCOUNT_INACTIVE",
    message: "Your account is currently inactive. Please contact support for assistance.",
    status: 403,
  },
  ACCOUNT_NOT_APPROVED: {
    code: "AUTH_ACCOUNT_NOT_APPROVED",
    message: "Your account is being reviewed. You'll receive an email once approved.",
    status: 403,
  },
  SESSION_EXPIRED: {
    code: "AUTH_SESSION_EXPIRED",
    message: "Your session has expired. Please log in again.",
    status: 401,
  },
  SESSION_NOT_FOUND: {
    code: "AUTH_SESSION_NOT_FOUND",
    message: "Your login could not be found. Please log in again.",
    status: 401,
  },
  SESSION_REQUIRED: {
    code: "AUTH_SESSION_REQUIRED",
    message: "Please log in to continue.",
    status: 401,
  },
  CSRF_MISSING: {
    code: "AUTH_CSRF_MISSING",
    message: "Your request could not be verified. Please refresh the page and try again.",
    status: 403,
  },
  CSRF_INVALID: {
    code: "AUTH_CSRF_INVALID",
    message: "Your request has expired. Please refresh the page and try again.",
    status: 403,
  },
  INSUFFICIENT_PERMISSIONS: {
    code: "AUTH_INSUFFICIENT_PERMISSIONS",
    message: "You don't have permission to access this. Please contact support if you think this is an error.",
    status: 403,
  },
  RATE_LIMIT_EXCEEDED: {
    code: "AUTH_RATE_LIMIT_EXCEEDED",
    message: "Too many attempts. Please wait a few minutes and try again.",
    status: 429,
  },
  INVALID_OTP: {
    code: "AUTH_INVALID_OTP",
    message: "The verification code is invalid or expired. Please request a new one.",
    status: 400,
  },
  OTP_MAX_ATTEMPTS: {
    code: "AUTH_OTP_MAX_ATTEMPTS",
    message: "Too many incorrect attempts. Please wait before trying again.",
    status: 429,
  },
  PASSWORD_TOO_WEAK: {
    code: "AUTH_PASSWORD_TOO_WEAK",
    message: "Password does not meet the requirements.",
    status: 400,
  },
  EMAIL_ALREADY_EXISTS: {
    code: "AUTH_EMAIL_ALREADY_EXISTS",
    message: "An account with this email already exists. Please log in or use a different email.",
    status: 409,
  },
  INVALID_RESET_SESSION: {
    code: "AUTH_INVALID_RESET_SESSION",
    message: "Your password reset link has expired. Please request a new one.",
    status: 401,
  },
  ACCOUNT_LOCKED: {
    code: "AUTH_ACCOUNT_LOCKED",
    message: "Account is temporarily locked. Try again later.",
    status: 403,
  },
  ROLE_NOT_AVAILABLE: {
    code: "AUTH_ROLE_NOT_AVAILABLE",
    message: "This registration type is not available.",
    status: 403,
  },
  INVALID_ROLE_REQUEST: {
    code: "AUTH_INVALID_ROLE_REQUEST",
    message: "Invalid registration type.",
    status: 400,
  },
  ROLE_ALREADY_EXISTS: {
    code: "AUTH_ROLE_ALREADY_EXISTS",
    message: "You already have or requested this access.",
    status: 409,
  },
  ROLE_SWITCH_DENIED: {
    code: "AUTH_ROLE_SWITCH_DENIED",
    message: "Unable to switch role.",
    status: 403,
  },
  PORTAL_ACCESS_DENIED: {
    code: "AUTH_PORTAL_ACCESS_DENIED",
    message: "Access denied. You do not have permission for this portal.",
    status: 403,
  },
} as const satisfies Record<string, AuthError>;

export default AUTH_ERRORS;
