import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import ApiError from '@utils/apiError';

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
}

const VALIDATION_CODE = 'VALIDATION_ERROR';

const describe = (issues: readonly { path: PropertyKey[]; message: string }[]): string =>
  issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');

const parse = (schema: ZodType, value: unknown): unknown => {
  const result = schema.safeParse(value);
  if (!result.success) throw ApiError.badRequest(describe(result.error.issues), VALIDATION_CODE);
  return result.data;
};

// The parsed value replaces the raw one, so an OTP sent as a JSON number cannot reach a `===`
// against the stored string.
const replaceInPlace = (target: Record<string, unknown>, parsed: unknown): void => {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, parsed);
};

const validate = ({ body, params }: RequestSchemas) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (body) req.body = parse(body, req.body);
      if (params) replaceInPlace(req.params as Record<string, unknown>, parse(params, req.params));
    } catch (error: unknown) {
      return next(error);
    }
    next();
  };
};

export { validate };
