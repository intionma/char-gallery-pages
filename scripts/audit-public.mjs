import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['index.html', '404.html', 'styles.css', 'app.js', 'README.md', 'AGENTS.md', '.github', 'scripts'];
const blocked = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:token|secret|password|api[_-]?key)\b\s*[:=]\s*['"][A-Za-z0-9_./+=-]{16,}['"]/i,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
];
const SDVX_ROOT = 'https://sdvxindex.com/';

async function walk(target) {
  const full = path.join(root, target);
  const stat = await fs.stat(full);
  if (!stat.isDirectory()) return [target];
  const children = await fs.readdir(full);
  const nested = await Promise.all(children.map((name) => walk(path.join(target, name))));
  return nested.flat();
}

function toAbsoluteHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('SDVX image URL is missing');
  const url = new URL(value, SDVX_ROOT);
  if (url.protocol !== 'https:') throw new Error(`SDVX image URL must use HTTPS: ${value}`);
  return url.href;
}

async function normalizeSdvxUrls() {
  const file = path.join(root, 'dist/data/sound-voltex.json');
  try {
    await fs.access(file);
  } catch {
    return;
  }

  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  if (data.error) return;
  if (!Array.isArray(data.jackets) || data.jackets.length === 0) {
    throw new Error('SDVX data contains no jackets');
  }

  let normalized = 0;
  let variants = 0;
  for (const jacket of data.jackets) {
    if (!Array.isArray(jacket.variants) || jacket.variants.length === 0) {
      throw new Error(`SDVX jacket has no variants: ${jacket.id ?? jacket.title ?? 'unknown'}`);
    }
    for (const variant of jacket.variants) {
      const next = toAbsoluteHttpsUrl(variant.url);
      if (next !== variant.url) normalized += 1;
      variant.url = next;
      variants += 1;
    }
    jacket.url = jacket.variants[0].url;
  }

  await fs.writeFile(file, JSON.stringify(data), 'utf8');
  console.log(`SDVX URLs verified: ${data.jackets.length} jackets, ${variants} variants, ${normalized} normalized`);
}

const files = (await Promise.all(targets.map(walk))).flat();
const failures = [];
for (const file of files) {
  const content = await fs.readFile(path.join(root, file), 'utf8');
  for (const pattern of blocked) if (pattern.test(content)) failures.push(file);
}
if (failures.length) {
  console.error(`public audit failed: ${[...new Set(failures)].join(', ')}`);
  process.exit(1);
}

await normalizeSdvxUrls();
console.log(`public audit passed: ${files.length} files`);
