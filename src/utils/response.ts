import type { Response } from 'express';

interface SuccessPayload {
  success: true;
  message?: string;
  data?: unknown;
}

interface ErrorPayload {
  success: false;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

interface ErrorMessageObject {
  code: string;
  message: string;
}

const response = {
  success: (res: Response, data: unknown = null, code: number = 200, message: string | null = null): Response => {
    const payload: SuccessPayload = { success: true };
    if (message) payload.message = message;
    if (data !== null) payload.data = data;
    return res.status(code).json(payload);
  },

  created: (res: Response, data: unknown = null, message: string | null = null): Response => {
    const payload: SuccessPayload = { success: true };
    if (message) payload.message = message;
    if (data !== null) payload.data = data;
    return res.status(201).json(payload);
  },

  error: (res: Response, message: string | ErrorMessageObject, code: number = 400, extra: Record<string, unknown> = {}): Response => {
    const body: ErrorPayload = { success: false, ...extra };
    if (message && typeof message === 'object' && message.code) {
      body.code = message.code;
      body.message = message.message || '';
    } else {
      body.message = message as string;
    }
    return res.status(code).json(body);
  },

  notFound: (res: Response, message?: string | ErrorMessageObject): Response => {
    const body: ErrorPayload = { success: false };
    if (message && typeof message === 'object' && message.code) {
      body.code = message.code;
      body.message = message.message || '';
    } else {
      body.message = (message as string) || 'Resource not found';
    }
    return res.status(404).json(body);
  },
};

export default response;
