import type { AuthError } from '@constants/authErrors';

interface ApiErrorOptions {
  code?: string;
}

class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string | null;

  constructor(statusCode: number, message: string, { code }: ApiErrorOptions = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || null;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string = 'Bad Request', code?: string): ApiError {
    return new ApiError(400, message, { code });
  }

  static forbidden(message: string = 'Forbidden', code?: string): ApiError {
    return new ApiError(403, message, { code });
  }

  static notFound(message: string = 'Not Found', code?: string): ApiError {
    return new ApiError(404, message, { code });
  }

  static conflict(message: string = 'Conflict', code?: string): ApiError {
    return new ApiError(409, message, { code });
  }

  static internal(message: string = 'Internal Server Error', code?: string): ApiError {
    return new ApiError(500, message, { code });
  }

  static fromAuthError(authError: AuthError): ApiError {
    return new ApiError(authError.status, authError.message, { code: authError.code });
  }
}

export default ApiError;
