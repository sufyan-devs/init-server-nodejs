import { Router } from 'express';

import * as authModule from '@auth/index';
import * as userModule from '@user/index';
import * as referralModule from '@referral/index';
import * as dashboardModule from '@dashboard/index';
import { verifyCsrf } from '@auth/index';

const router = Router();

authModule.register(router);

// Auth routers are mounted above and carry CSRF per-route, because several of
// their endpoints are pre-session. Everything below requires a session already.
router.use(verifyCsrf);

userModule.register(router);
referralModule.register(router);
dashboardModule.register(router);

export default router;
