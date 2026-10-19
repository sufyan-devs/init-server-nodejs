import { sendEmail } from './sender';
import * as templates from './templates';

export { layout, securityNotice, BRAND_COLOR } from './templates';
export type { EmailResult } from './templates';
export { sendEmail, templates };
