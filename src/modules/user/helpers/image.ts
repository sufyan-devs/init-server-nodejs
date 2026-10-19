import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { errorMessage } from '@utils/format';
import ApiError from '@utils/apiError';

const QUALITY: number = 85;

interface UploadedFile {
  buffer: Buffer;
}

// Type and size are enforced by the multer instance in helpers/upload.ts, which every caller's route applies.
const saveImage = async (file: UploadedFile, folder: string = 'profiles'): Promise<string> => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `${folder}-${timestamp}-${random}.webp`;
  const folderPath = path.join(process.cwd(), 'uploads', folder);
  const filePath = path.join(folderPath, fileName);

  await fs.mkdir(folderPath, { recursive: true });

  // The mimetype is client-declared; sharp is what actually proves the bytes are an image.
  const webpBuffer = await sharp(file.buffer)
    .webp({ quality: QUALITY })
    .toBuffer()
    .catch(() => {
      throw ApiError.badRequest('The uploaded file is not a valid image.', 'INVALID_IMAGE');
    });
  await fs.writeFile(filePath, webpBuffer);

  return `/uploads/${folder}/${fileName}`;
};

const deleteImage = async (imagePath: string | null | undefined): Promise<void> => {
  if (!imagePath) return;

  try {
    const cleanPath = imagePath.replace(/^\/uploads\//, '');
    const filePath = path.join(process.cwd(), 'uploads', cleanPath);
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch (err: unknown) {
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT'))
      throw new Error(`Failed to delete image: ${errorMessage(err)}`);
  }
};

const updateImage = async (file: UploadedFile, oldImagePath: string | null | undefined, folder: string = 'profiles'): Promise<string> => {
  const newImagePath = await saveImage(file, folder);
  if (oldImagePath) await deleteImage(oldImagePath);
  return newImagePath;
};

export { saveImage, updateImage, deleteImage };
