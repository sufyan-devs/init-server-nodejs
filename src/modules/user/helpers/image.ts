import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

const ALLOWED_MIMETYPES: string[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE: number = 2 * 1024 * 1024;
const QUALITY: number = 85;

interface UploadedFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const validateImage = (file: UploadedFile): void => {
  if (!file) throw new Error('No image file provided');
  if (!ALLOWED_MIMETYPES.includes(file.mimetype))
    throw new Error('Invalid file type. Only JPG, PNG and WEBP are allowed.');
  if (file.size > MAX_FILE_SIZE)
    throw new Error('Image size exceeds 2MB limit');
};

const saveImage = async (file: UploadedFile, folder: string = 'profiles'): Promise<string> => {
  validateImage(file);

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `${folder}-${timestamp}-${random}.webp`;
  const folderPath = path.join(process.cwd(), 'uploads', folder);
  const filePath = path.join(folderPath, fileName);

  await fs.mkdir(folderPath, { recursive: true });

  const webpBuffer = await sharp(file.buffer)
    .webp({ quality: QUALITY })
    .toBuffer();
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
  } catch (err: any) {
    if (err.code !== 'ENOENT')
      throw new Error(`Failed to delete image: ${err.message}`);
  }
};

const updateImage = async (file: UploadedFile, oldImagePath: string | null | undefined, folder: string = 'profiles'): Promise<string> => {
  validateImage(file);
  if (oldImagePath) await deleteImage(oldImagePath);
  return await saveImage(file, folder);
};

export { saveImage, updateImage, deleteImage };
