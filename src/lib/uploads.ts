import { Storage } from "@google-cloud/storage";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const bucketName = process.env.GCS_BUCKET || "";
const storage = new Storage();

export function uploadsDirForUser(userId: string): string {
  return path.join(ROOT, "uploads", userId);
}

export async function ensureUserUploadDir(userId: string): Promise<string> {
  const dir = uploadsDirForUser(userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function safeStoredName(original: string, id: string): string {
  const base = path.basename(original).replace(/[^\w.\-()+ ]/g, "_");
  return `${id}-${base}`;
}

export async function saveFile(buf: Buffer, userId: string, originalName: string, id: string, mimeType: string): Promise<string> {
  const storedName = safeStoredName(originalName, id);
  if (bucketName) {
    const bucket = storage.bucket(bucketName);
    const destFileName = `uploads/${userId}/${storedName}`;
    const file = bucket.file(destFileName);
    await file.save(buf, { contentType: mimeType });
    return `gs://${bucketName}/${destFileName}`;
  } else {
    const dir = await ensureUserUploadDir(userId);
    const storedPath = path.join(dir, storedName);
    await fs.writeFile(storedPath, buf);
    return storedPath;
  }
}

export async function removeStoredFile(absPath: string): Promise<void> {
  try {
    if (absPath.startsWith("gs://")) {
      const match = absPath.match(/^gs:\/\/([^\/]+)\/(.+)$/);
      if (match) {
        const bucket = storage.bucket(match[1]);
        await bucket.file(match[2]).delete();
      }
    } else {
      await fs.unlink(absPath);
    }
  } catch {
    /* ignore missing */
  }
}
