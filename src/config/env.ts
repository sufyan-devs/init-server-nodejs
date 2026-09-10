import 'dotenv/config';

const IN_PROD: boolean = process.env.NODE_ENV === "production";

const SESSION_LIFETIME_DEFAULT_MS = 604800000;

interface SessionCookieConfig {
  NAME: string;
  SECRET: string;
  DOMAIN: string | undefined;
  SECURE: boolean;
  SAME_SITE: 'lax';
  MAX_AGE_MS: number;
}

interface SessionConfig {
  EXPIRY_MS: number;
  ABSOLUTE_MAX_MS: number;
  MAX_PER_USER: number;
  COOKIE: SessionCookieConfig;
}

interface Argon2Config {
  MEMORY_KIB: number;
  TIME_COST: number;
  PARALLELISM: number;
}

interface PasswordPolicyConfig {
  MIN_LENGTH: number;
  HIBP_CHECK: boolean;
  ARGON2: Argon2Config;
}

interface CsrfConfig {
  ENABLED: boolean;
  COOKIE_NAME: string;
  HEADER_NAME: string;
}

interface EmailConfig {
  HOST: string;
  PORT: number;
  SECURE: boolean;
  USER: string | undefined;
  PASSWORD: string | undefined;
  FROM: string | undefined;
}

interface OTPSendConfig {
  MAX_REQUESTS: number;
  WINDOW_MINUTES: number;
}

interface OTPVerifyConfig {
  MAX_ATTEMPTS: number;
}

interface OTPConfig {
  LENGTH: number;
  EXPIRY_MINUTES: number;
  SEND: OTPSendConfig;
  VERIFY: OTPVerifyConfig;
}

interface PasswordResetConfig {
  SESSION_EXPIRY_MINUTES: number;
}

interface CouponRedeemConfig {
  OTP_EXPIRY_MINUTES: number;
  VERIFY_MAX_ATTEMPTS: number;
  SEND_MAX_REQUESTS: number;
  SEND_WINDOW_MINUTES: number;
}

interface RedisConfig {
  URL: string | undefined;
  HOST: string;
  PORT: number;
  PASSWORD: string | undefined;
  DB: number;
  MAX_RETRIES: number;
  RETRY_DELAY: number;
  CONNECTION_TIMEOUT: number;
}

interface RateLimitRule {
  MAX: number;
  WINDOW_SECONDS: number;
}

interface RateLimitConfig {
  ENABLED: boolean;
  GLOBAL: RateLimitRule;
  LOGIN: RateLimitRule;
  REGISTER: RateLimitRule;
  OTP: RateLimitRule;
}

interface LockoutConfig {
  MAX_ATTEMPTS: number;
  WINDOW_SECONDS: number;
  DURATION_SECONDS: number;
}

interface GoogleProviderConfig {
  ENABLED: boolean;
  CLIENT_IDS: string[];
}

interface AuthConfig {
  GOOGLE: GoogleProviderConfig;
}

export interface EnvConfig {
  APP_NAME: string;
  APP_LOGO_URL: string | undefined;
  NODE_ENV: string;
  IN_PROD: boolean;
  PORT: string | number;
  TRUSTED_PROXY_COUNT: number;
  MONGO_URI: string;
  JWT_SECRET: string;
  SEED_ADMIN_PASSWORD: string | undefined;
  ALLOWED_ORIGINS: string[];
  SESSION: SessionConfig;
  EMAIL: EmailConfig;
  OTP: OTPConfig;
  PASSWORD_RESET: PasswordResetConfig;
  COUPON_REDEEM: CouponRedeemConfig;
  REDIS: RedisConfig;
  RATE_LIMIT: RateLimitConfig;
  LOCKOUT: LockoutConfig;
  PASSWORD: PasswordPolicyConfig;
  CSRF: CsrfConfig;
  AUTH: AuthConfig;
}

const requireSecret = (name: string, value: string | undefined): string => {
  if (value && value.trim() !== "") return value;
  throw new Error(
    `[config] ${name} is required and has no default. Copy .env.example to .env and set it. ` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
  );
};

/**
 * `min` defaults to 1 because almost every value here is a count or a duration
 * where zero is meaningless. Pass 0 only where zero is a real setting.
 * A bad value throws at boot rather than silently becoming the default.
 */
const readInt = (name: string, fallback: number, min = 1): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`[config] ${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return parsed;
};

const splitList = (value: string | undefined): string[] =>
  (value || "")
    .split(",")
    .map((item: string) => item.trim())
    .filter(Boolean);

const sessionExpiryMs = readInt("SESSION_EXPIRY_MS", SESSION_LIFETIME_DEFAULT_MS);

export const envConfig: EnvConfig = {
  // Branding for outbound email. A cloned starter changes this, not the templates.
  APP_NAME: process.env.APP_NAME || 'Acme',
  APP_LOGO_URL: process.env.APP_LOGO_URL || undefined,
  NODE_ENV: process.env.NODE_ENV || "development",
  IN_PROD,
  PORT: process.env.PORT || 8000,
  // The rate limiter trusts req.ip, which is only correct if this matches the
  // number of proxies actually in front of the app.
  TRUSTED_PROXY_COUNT: readInt("TRUSTED_PROXY_COUNT", 1, 0),
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/app",
  JWT_SECRET: requireSecret("JWT_SECRET", process.env.JWT_SECRET),
  // Optional here, not requireSecret: the server must boot without it. The seed
  // script refuses to run in production when it is missing.
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,

  ALLOWED_ORIGINS: splitList(
    process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN,
  ),

  SESSION: {
    EXPIRY_MS: sessionExpiryMs,
    // Ceiling regardless of activity: a sliding TTL alone lets a stolen cookie
    // stay alive forever as long as it keeps being used.
    ABSOLUTE_MAX_MS: readInt("SESSION_ABSOLUTE_MAX_MS", 2592000000),
    MAX_PER_USER: readInt("SESSION_MAX_PER_USER", 10),
    COOKIE: {
      NAME: process.env.COOKIE_NAME || "session_token",
      SECRET: requireSecret(
        "COOKIE_SECRET",
        process.env.COOKIE_SECRET || process.env.JWT_SECRET,
      ),
      DOMAIN: process.env.COOKIE_DOMAIN || undefined,
      SECURE: IN_PROD,
      SAME_SITE: "lax" as const,
      // Falls back to the resolved session lifetime, not to a second copy of the
      // default: a cookie outliving its Redis session is a silent logout.
      MAX_AGE_MS: readInt("COOKIE_MAX_AGE_MS", sessionExpiryMs),
    },
  },

  EMAIL: {
    HOST: process.env.EMAIL_HOST || "smtp.gmail.com",
    PORT: readInt("EMAIL_PORT", 587),
    SECURE: process.env.EMAIL_SECURE === "true",
    USER: process.env.EMAIL_USER,
    PASSWORD: process.env.EMAIL_PASSWORD,
    FROM: process.env.EMAIL_FROM || process.env.EMAIL_USER,
  },

  OTP: {
    // 6, not 4: a 4-digit code has 10k possibilities, and the verify limiter
    // allows 5 attempts per window per account.
    LENGTH: readInt("OTP_LENGTH", 6),
    EXPIRY_MINUTES: readInt("OTP_EXPIRY_MINUTES", 60),
    SEND: {
      MAX_REQUESTS: readInt("OTP_SEND_MAX_REQUESTS", 5),
      WINDOW_MINUTES: readInt("OTP_SEND_WINDOW_MINUTES", 60),
    },
    VERIFY: {
      MAX_ATTEMPTS: readInt("OTP_VERIFY_MAX_ATTEMPTS", 5),
    },
  },

  PASSWORD_RESET: {
    SESSION_EXPIRY_MINUTES: readInt("RESET_TOKEN_EXPIRY_MINUTES", 5),
  },

  COUPON_REDEEM: {
    OTP_EXPIRY_MINUTES: readInt("COUPON_REDEEM_OTP_EXPIRY_MINUTES", 30),
    VERIFY_MAX_ATTEMPTS: readInt("COUPON_REDEEM_VERIFY_MAX_ATTEMPTS", 3),
    SEND_MAX_REQUESTS: readInt("COUPON_REDEEM_SEND_MAX_REQUESTS", 5),
    SEND_WINDOW_MINUTES: readInt("COUPON_REDEEM_SEND_WINDOW_MINUTES", 30),
  },

  REDIS: {
    URL: process.env.REDIS_URL,
    HOST: process.env.REDIS_HOST || "127.0.0.1",
    PORT: readInt("REDIS_PORT", 6379),
    PASSWORD: process.env.REDIS_PASSWORD,
    // 11, not 0: a dev machine running several projects would otherwise share one
    // keyspace, and db:reset flushes the whole database.
    DB: readInt("REDIS_DB", 11, 0),
    MAX_RETRIES: readInt("REDIS_MAX_RETRIES", 3),
    RETRY_DELAY: readInt("REDIS_RETRY_DELAY", 1000),
    CONNECTION_TIMEOUT: readInt("REDIS_CONNECTION_TIMEOUT", 5000),
  },

  /**
   * These are per-IP, and an IP is shared: an office, a school or a mobile
   * carrier's CGNAT can put hundreds of legitimate users behind one address.
   * So the IP limits are deliberately looser than the per-account controls —
   * brute force against one account is LOCKOUT's job, not this one's.
   */
  RATE_LIMIT: {
    ENABLED: process.env.RATE_LIMIT_ENABLED !== "false",
    GLOBAL: {
      MAX: readInt("RATE_LIMIT_GLOBAL_MAX", 300),
      WINDOW_SECONDS: readInt("RATE_LIMIT_GLOBAL_WINDOW_SECONDS", 60),
    },
    LOGIN: {
      MAX: readInt("RATE_LIMIT_LOGIN_MAX", 30),
      WINDOW_SECONDS: readInt("RATE_LIMIT_LOGIN_WINDOW_SECONDS", 900),
    },
    REGISTER: {
      MAX: readInt("RATE_LIMIT_REGISTER_MAX", 10),
      WINDOW_SECONDS: readInt("RATE_LIMIT_REGISTER_WINDOW_SECONDS", 3600),
    },
    OTP: {
      MAX: readInt("RATE_LIMIT_OTP_MAX", 10),
      WINDOW_SECONDS: readInt("RATE_LIMIT_OTP_WINDOW_SECONDS", 3600),
    },
  },

  // Owns the per-account axis of login abuse; the login limiter owns the per-IP
  // axis. Two account-scoped controls would make whichever trips first the only
  // one that ever fires.
  LOCKOUT: {
    MAX_ATTEMPTS: readInt("LOCKOUT_MAX_ATTEMPTS", 5),
    WINDOW_SECONDS: readInt("LOCKOUT_WINDOW_SECONDS", 900),
    DURATION_SECONDS: readInt("LOCKOUT_DURATION_SECONDS", 900),
  },

  PASSWORD: {
    // Length beats composition rules (current NIST/OWASP guidance): no forced
    // symbols, no forced rotation.
    MIN_LENGTH: readInt("PASSWORD_MIN_LENGTH", 8),
    // HIBP range API, k-anonymity — only the first 5 SHA-1 chars leave the box.
    HIBP_CHECK: process.env.PASSWORD_HIBP_CHECK !== "false",
    // OWASP's documented floor. The npm package's own defaults are higher
    // (m=65536, t=3, p=4) — raise these on a box with the headroom, and
    // benchmark to ~250-400 ms per verify on the real hardware.
    ARGON2: {
      MEMORY_KIB: readInt("ARGON2_MEMORY_KIB", 19456),
      TIME_COST: readInt("ARGON2_TIME_COST", 2),
      PARALLELISM: readInt("ARGON2_PARALLELISM", 1),
    },
  },

  CSRF: {
    ENABLED: process.env.CSRF_ENABLED !== "false",
    COOKIE_NAME: process.env.CSRF_COOKIE_NAME || "csrf_token",
    HEADER_NAME: process.env.CSRF_HEADER_NAME || "x-csrf-token",
  },

  AUTH: {
    GOOGLE: {
      ENABLED: process.env.GOOGLE_AUTH_ENABLED !== "false",
      CLIENT_IDS: splitList(
        process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID,
      ),
    },
  },
};
