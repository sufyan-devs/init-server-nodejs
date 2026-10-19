import mongoose from 'mongoose';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';

export const connectDatabase = async (): Promise<void> => {
  logger.info("MongoDB connecting...");
  try {
    await mongoose.connect(envConfig.MONGO_URI);
    logger.info(`MongoDB connected [${envConfig.NODE_ENV}]`);
  } catch (err: unknown) {
    const message = errorMessage(err);
    logger.error(`MongoDB connection failed: ${message}`);
    throw err;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
};
