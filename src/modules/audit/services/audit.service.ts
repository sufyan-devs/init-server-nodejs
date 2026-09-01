import AuditLog from '@audit/models/AuditLog';
import type { AuditEntry } from '@audit/models/AuditLog';
import { logger } from '@utils/logger';

// Must never throw: an audit write is evidence, not a precondition for the request.
const record = async (entry: AuditEntry): Promise<void> => {
  try {
    await AuditLog.create(entry);
  } catch (error: unknown) {
    logger.error('Audit write failed', {
      action: entry.action,
      outcome: entry.outcome,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export { record };
