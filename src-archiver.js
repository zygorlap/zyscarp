import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

export async function createMirrorZip(outputDir, mirrorSubPath = 'mirror') {
  const mirrorPath = path.join(outputDir, mirrorSubPath);
  if (!fs.existsSync(mirrorPath)) return null;

  const zipPath = path.join(outputDir, 'mirror.zip');
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => {
      resolve({
        path: zipPath,
        size: archive.pointer(),
        files: archive.pointer()
      });
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(mirrorPath, 'mirror');
    archive.append(`Zygor Scarper Mirror Archive\ninstagram:@zygorlap\nEducational use only.\n`, { name: 'README.txt' });
    archive.finalize();
  });
}

export default { createMirrorZip };
