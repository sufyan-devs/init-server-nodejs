import { execSync } from 'node:child_process';
import mongoose from 'mongoose';
import { envConfig } from '@config/env';
import { redisClient, initRedis } from '@utils/redisClient';

const reset = async (): Promise<void> => {
  if (envConfig.IN_PROD) {
    console.error('Refusing to run with NODE_ENV=production. This deletes everything.');
    process.exit(1);
  }

  await mongoose.connect(envConfig.MONGO_URI);
  const name = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  console.warn(`dropped mongo database: ${name}`);
  await mongoose.disconnect();

  // Sessions and lockout counters are keyed by user id: a stale Redis over a fresh
  // Mongo leaves sessions pointing at deleted users, which looks like an auth bug.
  await initRedis();
  await redisClient.flushDb();
  console.warn(`flushed redis db ${envConfig.REDIS.DB}`);
  await redisClient.quit();

  // execSync because npm is npm.cmd on Windows; the seed order lives in the npm script.
  execSync('npm run seed', { stdio: 'inherit' });

  console.warn('\nReset complete. Fresh database, empty Redis, roles and users seeded.');
};

reset().catch((error: unknown) => {
  console.error('Reset failed:', error);
  process.exit(1);
});
