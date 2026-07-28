import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fileArg = args.find((arg) => !arg.startsWith('--')) || 'dist/data/genshin.json';
const metadataArg = args.find((arg) => arg.startsWith('--metadata='));
const file = path.resolve(root, fileArg);
const metadataFile = metadataArg ? path.resolve(root, metadataArg.slice('--metadata='.length)) : null;
const API = 'https://genshin-db-api.vercel.app/api/v5';
const ASSET = 'https://gi.yatta.moe/assets/UI';
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function asset(filename) {
  if (!filename) return undefined;
  return `${ASSET}/${filename}${/\.[a-z0-9]+$/i.test(filename) ? '' : '.png'}`;
}

function versionOrder(version, tie = 0) {
  const parts = String(version || '0').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rank = (parts[0] || 0) * 1_000_000 + (parts[1] || 0) * 1_000 + (parts[2] || 0);
  return rank * 1_000_000 + (Number(tie) || 0);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json,*/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function loadCategory(folder, language) {
  const params = new URLSearchParams({
    query: 'names',
    matchCategories: 'true',
    verboseCategories: 'true',
    resultLanguage: language,
  });
  const payload = await fetchJson(`${API}/${folder}?${params}`);
  return Array.isArray(payload) ? payload : (payload.result || []);
}

async function loadMetadata() {
  if (metadataFile) return JSON.parse(await fs.readFile(metadataFile, 'utf8'));
  const [outfitsEn, outfitsKo, charactersEn] = await Promise.all([
    loadCategory('outfits', 'English'),
    loadCategory('outfits', 'Korean'),
    loadCategory('characters', 'English'),
  ]);
  return { outfitsEn, outfitsKo, charactersEn };
}

function outfitIdentity(outfit) {
  return String(outfit.id ?? `${outfit.characterId}:${outfit.name}`);
}

function findExistingOutfitImage(character, outfit, localizedName) {
  const names = [outfit.name, localizedName].filter(Boolean).map(norm).filter(Boolean);
  return (character.images || []).find((image) => {
    const source = norm(decodeURIComponent(String(image.sourceUrl || '')).replace(/_/g, ' '));
    return names.includes(norm(image.group)) || names.some((name) => source.includes(name));
  });
}

const pageData = JSON.parse(await fs.readFile(file, 'utf8'));
if (pageData.error) throw new Error('Genshin data build failed before skin catalog generation');
if (!Array.isArray(pageData.characters) || pageData.characters.length === 0) {
  throw new Error('Genshin character data is empty');
}

const { outfitsEn = [], outfitsKo = [], charactersEn = [] } = await loadMetadata();
const characterMetaById = new Map(charactersEn.map((character) => [String(character.id), character]));
const characterMetaByName = new Map(charactersEn.map((character) => [norm(character.name), character]));
const outfitKoById = new Map(outfitsKo.map((outfit) => [outfitIdentity(outfit), outfit]));
const pageCharacterById = new Map(pageData.characters.map((character) => [character.id.replace(/^gi-/, ''), character]));
const skins = [];
const seen = new Set();
const missing = [];

for (const character of pageData.characters) {
  const numericId = character.id.replace(/^gi-/, '');
  const meta = characterMetaById.get(numericId) || characterMetaByName.get(norm(character.names?.en));
  const base = (character.images || []).find((image) => image.type === '기본') || character.images?.[0];
  if (!base?.url) continue;
  const id = `gi-skin-${numericId}-base`;
  seen.add(id);
  skins.push({
    id,
    characterId: character.id,
    character: { id: character.id, names: character.names },
    skinName: '기본',
    group: '기본',
    url: base.url,
    thumbUrl: character.profileImage,
    sourceUrl: base.sourceUrl || character.sourceUrl,
    sourceType: 'official_standing',
    releaseVersion: meta?.version,
    additionOrder: versionOrder(meta?.version, Number(numericId)),
  });
}

for (const outfit of outfitsEn) {
  if (outfit.isDefault ?? outfit.isdefault) continue;
  const character = pageCharacterById.get(String(outfit.characterId));
  if (!character) continue;
  const localized = outfitKoById.get(outfitIdentity(outfit));
  const skinName = localized?.name || outfit.name;
  const existing = findExistingOutfitImage(character, outfit, skinName);
  const url = asset(outfit.images?.filename_splash) || existing?.url;
  if (!url) {
    missing.push(`${outfit.characterName || outfit.characterId}: ${outfit.name}`);
    continue;
  }
  const id = `gi-skin-${outfit.id}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const sourceUrl = existing?.sourceUrl
    || `https://genshin-impact.fandom.com/wiki/${encodeURIComponent(String(outfit.name).replace(/ /g, '_'))}`;
  if (!existing) {
    character.images ||= [];
    character.images.push({
      url,
      thumbUrl: asset(outfit.images?.filename_icon),
      group: skinName,
      type: '의상',
      sourceUrl,
      skinId: id,
      skinNameEn: outfit.name,
      releaseVersion: outfit.version,
    });
  }
  skins.push({
    id,
    characterId: character.id,
    character: { id: character.id, names: character.names },
    skinName,
    group: skinName,
    url,
    thumbUrl: asset(outfit.images?.filename_icon) || existing?.thumbUrl,
    sourceUrl,
    sourceType: 'official_skin',
    releaseVersion: outfit.version,
    additionOrder: versionOrder(outfit.version, Number(outfit.id)),
  });
}

if (missing.length) {
  throw new Error(`Genshin outfits are missing usable images: ${missing.join(', ')}`);
}
skins.sort((a, b) => b.additionOrder - a.additionOrder || a.id.localeCompare(b.id));
if (!skins.length) throw new Error('Genshin skin catalog is empty');
if (skins.some((skin) => !Number.isFinite(Number(skin.additionOrder)))) {
  throw new Error('Genshin skin catalog contains an invalid order');
}
pageData.skins = skins;
await fs.writeFile(file, JSON.stringify(pageData), 'utf8');
console.log(`Genshin skins generated: ${skins.length}`);
