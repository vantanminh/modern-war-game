import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const workspaceRoot = process.cwd();
const imagesRoot = path.join(workspaceRoot, 'public', 'images');
const webpQuality = 84;

async function collectPngFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const pngFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      pngFiles.push(...(await collectPngFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      pngFiles.push(entryPath);
    }
  }

  return pngFiles;
}

function toRelativePath(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}

function toWebpPath(pngPath) {
  return pngPath.replace(/\.png$/i, '.webp');
}

async function convertPngToWebp(pngPath) {
  const webpPath = toWebpPath(pngPath);
  await mkdir(path.dirname(webpPath), { recursive: true });

  const pngStats = await stat(pngPath);
  let shouldConvert = true;

  try {
    const webpStats = await stat(webpPath);
    shouldConvert = pngStats.mtimeMs > webpStats.mtimeMs;
  } catch {
    shouldConvert = true;
  }

  if (!shouldConvert) {
    console.log(`skip  ${toRelativePath(webpPath)} (up to date)`);
    return;
  }

  await sharp(pngPath).webp({ quality: webpQuality }).toFile(webpPath);
  console.log(`write ${toRelativePath(webpPath)}`);
}

async function main() {
  const pngFiles = await collectPngFiles(imagesRoot);

  if (pngFiles.length === 0) {
    console.log('No PNG files found under public/images.');
    return;
  }

  console.log(`Found ${pngFiles.length} PNG file(s) under public/images.`);

  for (const pngPath of pngFiles) {
    await convertPngToWebp(pngPath);
  }
}

main().catch((error) => {
  console.error('Failed to convert PNG files to WebP.');
  console.error(error);
  process.exitCode = 1;
});