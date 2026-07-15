import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);
const forbiddenFilePatterns = [
  /full-backup.*\.json$/i,
  /system-health.*\.json$/i,
  /school-calendar.*\.pdf$/i,
  /\.(xlsx?|docx|heic)$/i,
];
const forbiddenContentPatterns = [
  /"storageEncoding"\s*:\s*"raw-localStorage-strings"/,
  /"cos-students"\s*:/,
  /"cos-toolkit"\s*:/,
  /"cos-standards"\s*:/,
  /packages\.applied-caas-gateway/i,
  /openai\.org\/artifactory/i,
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else files.push(absolutePath);
  }
  return files;
}

const violations = [];
for (const filePath of await walk(root)) {
  const relativePath = path.relative(root, filePath);
  if (forbiddenFilePatterns.some((pattern) => pattern.test(relativePath))) {
    violations.push(`${relativePath}: private-data filename is not allowed`);
    continue;
  }

  const extension = path.extname(filePath).toLowerCase();
  if (
    !['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.html'].includes(extension)
  ) {
    continue;
  }

  const content = await fs.readFile(filePath, 'utf8');
  for (const pattern of forbiddenContentPatterns) {
    if (pattern.test(content)) {
      violations.push(`${relativePath}: contains a legacy private-data signature (${pattern})`);
    }
  }
}

if (violations.length > 0) {
  console.error('Privacy check failed:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('Privacy check passed: no known private Classroom backup data found.');
