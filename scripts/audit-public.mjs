import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['index.html', '404.html', 'styles.css', 'skins.css', 'app.js', 'skins.js', 'README.md', 'AGENTS.md', '.github', 'docs', 'scripts'];
const blocked = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:token|secret|password|api[_-]?key)\b\s*[:=]\s*['"][A-Za-z0-9_./+=-]{16,}['"]/i,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
];

async function walk(target) {
  const full = path.join(root, target);
  const stat = await fs.stat(full);
  if (!stat.isDirectory()) return [target];
  const children = await fs.readdir(full);
  const nested = await Promise.all(children.map((name) => walk(path.join(target, name))));
  return nested.flat();
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
console.log(`public audit passed: ${files.length} files`);
