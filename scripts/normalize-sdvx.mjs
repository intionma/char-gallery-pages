import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(root, process.argv[2] || 'dist/data/sound-voltex.json');
const SDVX_ROOT = 'https://sdvxindex.com/';

function toAbsoluteHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('SDVX image URL is missing');
  }
  const url = new URL(value, SDVX_ROOT);
  if (url.protocol !== 'https:') {
    throw new Error(`SDVX image URL must use HTTPS: ${value}`);
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  return url.href;
}

const data = JSON.parse(await fs.readFile(file, 'utf8'));
if (data.error) {
  throw new Error('SDVX data build failed before URL normalization');
}
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

// 자켓과 별개로 연결 캐릭터에도 같은 자켓 URL이 복사되어 있어서, 여기도 정규화하지 않으면
// `//img/...` 형태가 그대로 남는다.
let characterUrls = 0;
for (const character of data.characters || []) {
  for (const image of character.images || []) {
    image.url = toAbsoluteHttpsUrl(image.url);
    for (const variant of image.variants || []) variant.url = toAbsoluteHttpsUrl(variant.url);
    characterUrls += 1;
  }
  if (character.profileImage) character.profileImage = toAbsoluteHttpsUrl(character.profileImage);
}

await fs.writeFile(file, JSON.stringify(data), 'utf8');
console.log(`SDVX URLs verified: ${data.jackets.length} jackets, ${variants} variants, ${characterUrls} character images, ${normalized} normalized`);
