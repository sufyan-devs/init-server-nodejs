export interface AuthError {
  code: string;
  message: string;
}

const AuthErrors = {
  INVALID_CREDENTIALS: {
    code: "AUTH_INVALID_CREDENTIALS",
    message: "Invalid email or password.",
  },
  USER_NOT_FOUND: {
    code: "AUTH_USER_NOT_FOUND",
    message: "No account found with this email.",
  },
  EMAIL_NOT_VERIFIED: {
    code: "AUTH_EMAIL_NOT_VERIFIED",
    message: "Please verify your email before logging in. Check your inbox for the verification code.",
  },
  ACCOUNT_INACTIVE: {
    code: "AUTH_ACCOUNT_INACTIVE",
    message: "Your account is currently inactive. Please contact support for assistance.",
  },
  ACCOUNT_NOT_APPROVED: {
    code: "AUTH_ACCOUNT_NOT_APPROVED",
    message: "Your account is being reviewed. You'll receive an email once approved.",
  },
  SESSION_EXPIRED: {
    code: "AUTH_SESSION_EXPIRED",
    message: "Your session has expired. Please log in again.",
  },
  SESSION_REVOKED: {
    code: "AUTH_SESSION_REVOKED",
    message: "You have been logged out. Please log in again.",
  },
  SESSION_NOT_FOUND: {
    code: "AUTH_SESSION_NOT_FOUND",
    message: "Your login could not be found. Please log in again.",
  },
  SESSION_REQUIRED: {
    code: "AUTH_SESSION_REQUIRED",
    message: "Please log in to continue.",
  },
  SESSION_HIJACKED: {
    code: "AUTH_SESSION_HIJACKED",
    message: "For your security, please log in again.",
  },
  REFRESH_TOKEN_INVALID: {
    code: "AUTH_REFRESH_TOKEN_INVALID",
    message: "Your session could not be renewed. Please log in again.",
  },
  REFRESH_TOKEN_RETIRED: {
    code: "AUTH_REFRESH_TOKEN_RETIRED",
    message: "Your session could not be renewed. Please log in again.",
  },
  CSRF_MISSING: {
    code: "AUTH_CSRF_MISSING",
    message: "Your request could not be verified. Please refresh the page and try again.",
  },
  CSRF_INVALID: {
    code: "AUTH_CSRF_INVALID",
    message: "Your request has expired. Please refresh the page and try again.",
  },
  INSUFFICIENT_PERMISSIONS: {
    code: "AUTH_INSUFFICIENT_PERMISSIONS",
    message: "You don't have permission to access this. Please contact support if you think this is an error.",
  },
  RATE_LIMIT_EXCEEDED: {
    code: "AUTH_RATE_LIMIT_EXCEEDED",
    message: "Too many attempts. Please wait a few minutes and try again.",
  },
  INVALID_OTP: {
    code: "AUTH_INVALID_OTP",
    message: "The verification code is invalid or expired. Please request a new one.",
  },
  OTP_MAX_ATTEMPTS: {
    code: "AUTH_OTP_MAX_ATTEMPTS",
    message: "Too many incorrect attempts. Please wait before trying again.",
  },
  PASSWORD_TOO_WEAK: {
    code: "AUTH_PASSWORD_TOO_WEAK",
    message: "Password must be at least 12 characters.",
  },
  EMAIL_ALREADY_EXISTS: {
    code: "AUTH_EMAIL_ALREADY_EXISTS",
    message: "An account with this email already exists. Please log in or use a different email.",
  },
  INVALID_RESET_SESSION: {
    code: "AUTH_INVALID_RESET_SESSION",
    message: "Your password reset link has expired. Please request a new one.",
  },
  ACCOUNT_LOCKED: {
    code: "AUTH_ACCOUNT_LOCKED",
    message: "Account is temporarily locked. Try again later.",
  },
  ROLE_NOT_AVAILABLE: {
    code: "AUTH_ROLE_NOT_AVAILABLE",
    message: "This registration type is not available.",
  },
  INVALID_ROLE_REQUEST: {
    code: "AUTH_INVALID_ROLE_REQUEST",
    message: "Invalid registration type.",
  },
  INVALID_REFERRAL_CODE: {
    code: "AUTH_INVALID_REFERRAL_CODE",
    message: "Invalid referral code.",
  },
  ROLE_ALREADY_EXISTS: {
    code: "AUTH_ROLE_ALREADY_EXISTS",
    message: "You already have or requested this access.",
  },
  ROLE_SWITCH_DENIED: {
    code: "AUTH_ROLE_SWITCH_DENIED",
    message: "Unable to switch role.",
  },
  PORTAL_ACCESS_DENIED: {
    code: "AUTH_PORTAL_ACCESS_DENIED",
    message: "Access denied. You do not have permission for this portal.",
  },
} as const satisfies Record<string, AuthError>;

export default AuthErrors;
