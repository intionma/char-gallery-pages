import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(root, process.argv[2] || 'dist/data/blue-archive.json');
const BASE = 'https://schaledb.com';
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';
const BA_55_LIVE = 'https://www.youtube.com/watch?v=tQ4z_gAngHc';
const PUBLISHED_DATA = 'https://intionma.github.io/char-gallery-pages/data/blue-archive.json';

const ANNOUNCED_SKINS = [
  ['makoto', 'makoto_swimsuit', '수영복', '2026-07-26', '2026-07-29'],
  ['satsuki', 'satsuki_swimsuit', '수영복', '2026-07-26', '2026-07-29'],
  ['chiaki', 'chiaki_swimsuit', '수영복', '2026-07-26', '2026-07-29'],
  ['ibuki', 'ibuki_swimsuit', '수영복', '2026-07-26', '2026-08-05'],
  ['iroha', 'iroha_swimsuit', '수영복', '2026-07-26', '2026-08-05'],
].map(([basePathName, variantPathName, skinName, announcedDate, releaseDate]) => ({
  basePathName,
  variantPathName,
  skinName,
  announcedDate,
  releaseDate,
  sourceUrl: BA_55_LIVE,
}));

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json,*/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function previousAdditionOrders() {
  try {
    const data = await fetchJson(PUBLISHED_DATA);
    if (!Array.isArray(data.skins) || data.skins.length === 0) return { available: false, orders: new Map() };
    return {
      available: true,
      orders: new Map(
        data.skins
          .filter((skin) => Number.isFinite(Number(skin.additionOrder)))
          .map((skin) => [skin.id, Number(skin.additionOrder)]),
      ),
    };
  } catch (error) {
    console.warn(`Blue Archive previous skin order unavailable: ${error.message}`);
    return { available: false, orders: new Map() };
  }
}

function isReleased(student) {
  return Array.isArray(student.IsReleased)
    ? student.IsReleased.some(Boolean)
    : Boolean(student.IsReleased);
}

function isBase(student) {
  return !student.Name.includes('(');
}

function groupKey(student) {
  return `${student.FamilyName || ''}|${student.PersonalName || ''}`;
}

function fullEnName(student) {
  return [student.FamilyName, student.PersonalName].filter(Boolean).join(' ') || student.Name;
}

function costumeLabel(localized, fallback) {
  const name = localized || fallback;
  return name.match(/\(([^)]+)\)/)?.[1]?.trim() || name;
}

function findAnnouncedVariant(all, base, announced) {
  const exact = all.find(
    (student) => student.PathName.toLowerCase() === announced.variantPathName.toLowerCase(),
  );
  if (exact) return exact;
  const key = groupKey(base);
  return all.find(
    (student) => groupKey(student) === key && !isBase(student) && /\(swimsuit\)/i.test(student.Name),
  );
}

const pageData = JSON.parse(await fs.readFile(file, 'utf8'));
if (pageData.error) throw new Error('Blue Archive data build failed before skin catalog generation');
if (pageData.stale && Array.isArray(pageData.skins) && pageData.skins.length > 0) {
  console.log(`Blue Archive skins retained from published snapshot: ${pageData.skins.length}`);
  process.exit(0);
}
const previous = await previousAdditionOrders();
const firstSeenAt = Date.parse(pageData.generatedAt) || Date.now();
const persistedOrder = (id, fallback) => {
  if (!previous.available) return fallback;
  const seen = previous.orders.get(id);
  return seen == null ? firstSeenAt : Math.max(fallback, seen);
};

const [en, ko, ja] = await Promise.all([
  fetchJson(`${BASE}/data/en/students.min.json`),
  fetchJson(`${BASE}/data/kr/students.min.json`),
  fetchJson(`${BASE}/data/jp/students.min.json`),
]);
const all = Object.values(en);
const released = all.filter(isReleased);
const bases = new Map();
for (const student of released) {
  if (isBase(student)) bases.set(groupKey(student), student);
}

const announcedPaths = new Set(ANNOUNCED_SKINS.map((skin) => skin.variantPathName.toLowerCase()));
const skins = released
  .filter((student) => !announcedPaths.has(student.PathName.toLowerCase()))
  .map((student) => {
    const base = bases.get(groupKey(student)) || student;
    const baseId = String(base.Id);
    const baseSkin = isBase(student);
    const skinName = baseSkin ? '기본' : costumeLabel(ko[String(student.Id)]?.Name, student.Name);
    const id = `ba-skin-${student.Id}`;
    return {
      id,
      characterId: `ba-${base.Id}`,
      character: {
        id: `ba-${base.Id}`,
        names: {
          en: fullEnName(base),
          ko: ko[baseId]?.Name,
          ja: ja[baseId]?.Name,
        },
      },
      skinName,
      group: skinName,
      url: `${BASE}/images/student/portrait/${student.Id}.webp`,
      thumbUrl: `${BASE}/images/student/icon/${student.Id}.webp`,
      sourceUrl: `${BASE}/student/${student.PathName}`,
      sourceType: baseSkin ? 'official_standing' : 'official_skin',
      additionOrder: persistedOrder(id, Number(student.Id)),
    };
  });

const byPath = new Map(all.map((student) => [student.PathName.toLowerCase(), student]));
for (const announced of ANNOUNCED_SKINS) {
  const base = byPath.get(announced.basePathName.toLowerCase());
  if (!base) continue;
  const variant = findAnnouncedVariant(all, base, announced);
  const artStudent = variant || base;
  const baseId = String(base.Id);
  skins.push({
    id: `ba-announced-${announced.variantPathName}`,
    characterId: `ba-${base.Id}`,
    character: {
      id: `ba-${base.Id}`,
      names: {
        en: fullEnName(base),
        ko: ko[baseId]?.Name,
        ja: ja[baseId]?.Name,
      },
    },
    skinName: announced.skinName,
    group: announced.skinName,
    url: `${BASE}/images/student/portrait/${artStudent.Id}.webp`,
    thumbUrl: `${BASE}/images/student/icon/${artStudent.Id}.webp`,
    sourceUrl: variant ? `${BASE}/student/${variant.PathName}` : announced.sourceUrl,
    sourceType: 'official_skin',
    additionOrder: Date.parse(`${announced.announcedDate}T00:00:00+09:00`),
    announcedDate: announced.announcedDate,
    releaseDate: announced.releaseDate,
    upcoming: variant ? !isReleased(variant) : true,
    announcementOnly: !variant,
  });
}

skins.sort((a, b) => b.additionOrder - a.additionOrder || a.id.localeCompare(b.id));
if (!skins.length) throw new Error('Blue Archive skin catalog is empty');
pageData.skins = skins;
await fs.writeFile(file, JSON.stringify(pageData), 'utf8');
console.log(`Blue Archive skins generated: ${skins.length}`);
