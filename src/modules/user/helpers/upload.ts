import type { FileFilterCallback } from 'multer';
import multer from 'multer';
import type { Request } from 'express';
import ApiError from '@utils/apiError';

const ALLOWED_MIMETYPES: string[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_SIZE_BYTES: number = 2 * 1024 * 1024;

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    return cb(ApiError.badRequest('Invalid file type. Only JPG, PNG and WEBP are allowed.', 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter,
});

const uploadSingle = (fieldName: string) => upload.single(fieldName);

export { uploadSingle };
