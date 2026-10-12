import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const SOURCE_ROOT = resolve(PROJECT_ROOT, 'src');
const INCLUDED_EXTENSIONS = new Set(['.js', '.jsx', '.css']);
const GENERATED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || GENERATED_DIRECTORIES.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    if (entry.isFile() && INCLUDED_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function classify(path) {
  const local = relative(SOURCE_ROOT, path);
  const segments = local.split(sep);
  if (path.endsWith('.test.js') || path.endsWith('.test.jsx')) return 'tests';
  if (segments[0] === 'components') return 'interface';
  if (segments[0] === 'operations') return `operations/${segments[1] ?? 'shared'}`;
  return segments[0] ?? 'root';
}

function lineStatistics(text) {
  const lines = text.length ? text.split(/\r?\n/) : [];
  let blank = 0;
  let comment = 0;
  let inBlockComment = false;
  for (const line of lines) {
    const value = line.trim();
    if (!value) {
      blank += 1;
      continue;
    }
    if (inBlockComment) {
      comment += 1;
      if (value.includes('*/')) inBlockComment = false;
      continue;
    }
    if (value.startsWith('/*')) {
      comment += 1;
      if (!value.includes('*/')) inBlockComment = true;
      continue;
    }
    if (value.startsWith('//') || value.startsWith('*')) comment += 1;
  }
  return {
    total: lines.length,
    blank,
    comment,
    substantive: lines.length - blank - comment,
  };
}

function addStatistics(target, statistics) {
  target.files += 1;
  target.total += statistics.total;
  target.blank += statistics.blank;
  target.comment += statistics.comment;
  target.substantive += statistics.substantive;
}

const files = (await sourceFiles(SOURCE_ROOT)).sort();
const totals = { files: 0, total: 0, blank: 0, comment: 0, substantive: 0 };
const groups = new Map();

for (const path of files) {
  const group = classify(path);
  const statistics = lineStatistics(await readFile(path, 'utf8'));
  if (!groups.has(group)) groups.set(group, { files: 0, total: 0, blank: 0, comment: 0, substantive: 0 });
  addStatistics(groups.get(group), statistics);
  addStatistics(totals, statistics);
}

const rows = [...groups.entries()]
  .sort(([first], [second]) => first.localeCompare(second))
  .map(([group, values]) => ({ group, ...values }));

console.log('First-party source inventory');
console.log(`Root: ${relative(PROJECT_ROOT, SOURCE_ROOT)}`);
console.table(rows);
console.log(`Files: ${totals.files}`);
console.log(`Physical lines: ${totals.total}`);
console.log(`Substantive lines: ${totals.substantive}`);
console.log(`Blank lines: ${totals.blank}`);
console.log(`Comment-only lines: ${totals.comment}`);
