import { access, readFile } from 'node:fs/promises';

await access('dist/index.html');
const index = await readFile('dist/index.html', 'utf8');
if (!index.includes('/Classroom-Source/assets/')) {
  throw new Error('Build verification failed: GitHub Pages base path is missing.');
}
console.log('Build verification passed.');
