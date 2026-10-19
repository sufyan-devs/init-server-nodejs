import type { Types } from 'mongoose';
import mongoose from 'mongoose';

export const DUPLICATE_KEY_ERROR_CODE = 11000;

export const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  mongoose.Types.ObjectId.createFromHexString(String(id));
