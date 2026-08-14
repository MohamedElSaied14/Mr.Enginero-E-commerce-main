/**
 * Rewrites every tracked text file to LF, matching `.gitattributes`.
 *
 * Needed once because the repository was checked out on Windows with
 * `* text=auto`, which stores LF but hands back CRLF — so the working tree
 * disagreed with the repository and editors warned on every file.
 *
 * Binaries are skipped twice over: by extension, and by sniffing for a NUL
 * byte. Nothing outside the file's line endings is touched.
 *
 * Run:  npm run fix:eol
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.gz', '.br',
]);

const listTracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);

const main = () => {
  const files = listTracked();
  const converted = [];
  const skippedBinary = [];
  let alreadyLf = 0;

  for (const relative of files) {
    if (BINARY_EXT.has(extname(relative).toLowerCase())) {
      skippedBinary.push(relative);
      continue;
    }

    const path = join(ROOT, relative);
    let buffer;
    try {
      buffer = readFileSync(path);
    } catch {
      continue; // listed but not on disk
    }

    // A NUL byte means binary, whatever the extension claims.
    if (buffer.includes(0)) {
      skippedBinary.push(relative);
      continue;
    }

    const text = buffer.toString('utf8');
    if (!text.includes('\r')) {
      alreadyLf++;
      continue;
    }

    // Collapse CRLF and any stray lone CR to LF.
    const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    writeFileSync(path, normalised, 'utf8');
    converted.push(relative);
  }

  console.log(`scanned ${files.length} tracked files`);
  console.log(`  ${converted.length} converted to LF`);
  console.log(`  ${alreadyLf} already LF`);
  console.log(`  ${skippedBinary.length} binary, left alone`);

  if (converted.length) {
    console.log('\nconverted:');
    for (const f of converted.slice(0, 15)) console.log(`  ${f}`);
    if (converted.length > 15) console.log(`  … and ${converted.length - 15} more`);
  }
};

main();
