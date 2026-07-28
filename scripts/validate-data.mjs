import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDVX_JACKET_CATEGORIES } from './sdvx-jacket-ratings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.argv[2] || 'dist/data');
const expectations = {
  'blue-archive': { collection: 'characters', skins: true },
  'eternal-return': { collection: 'characters', skins: true },
  genshin: { collection: 'characters', skins: true },
  'sound-voltex': { collection: 'jackets', skins: false },
  djmax: { collection: 'characters', skins: false },
};
const failures = [];
const summary = [];

function fail(gameId, message) {
  failures.push(`${gameId}: ${message}`);
}

function httpsUrl(gameId, label, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') fail(gameId, `${label} must use HTTPS`);
    if (url.pathname.includes('//')) fail(gameId, `${label} contains a duplicate path slash`);
  } catch {
    fail(gameId, `${label} is not a valid URL`);
  }
}

function uniqueIds(gameId, label, items) {
  const ids = new Set();
  for (const item of items) {
    if (!item?.id) {
      fail(gameId, `${label} item is missing an id`);
      continue;
    }
    if (ids.has(item.id)) fail(gameId, `${label} contains duplicate id ${item.id}`);
    ids.add(item.id);
  }
}

const manifest = JSON.parse(await fs.readFile(path.join(dataDir, 'manifest.json'), 'utf8'));
const manifestResults = new Map((manifest.results || []).map((result) => [result.name, result]));

for (const [gameId, expectation] of Object.entries(expectations)) {
  const filename = `${gameId}.json`;
  const data = JSON.parse(await fs.readFile(path.join(dataDir, filename), 'utf8'));
  const items = Array.isArray(data[expectation.collection]) ? data[expectation.collection] : [];
  if (data.error) fail(gameId, 'snapshot is marked as failed');
  if (!items.length) fail(gameId, `${expectation.collection} is empty`);
  uniqueIds(gameId, expectation.collection, items);

  if (expectation.collection === 'characters') {
    for (const character of items) {
      if (!character.names || !Object.values(character.names).some(Boolean)) {
        fail(gameId, `character ${character.id} has no display name`);
      }
      httpsUrl(gameId, `character ${character.id} profileImage`, character.profileImage);
      if (!Array.isArray(character.images) || !character.images.length) {
        fail(gameId, `character ${character.id} has no images`);
      }
      for (const [index, image] of (character.images || []).entries()) {
        httpsUrl(gameId, `character ${character.id} image ${index}`, image.url);
      }
    }
  }

  if (expectation.collection === 'jackets') {
    for (const jacket of items) {
      if (!Array.isArray(jacket.variants) || !jacket.variants.length) {
        fail(gameId, `jacket ${jacket.id} has no variants`);
        continue;
      }
      const difficulties = new Set();
      for (const variant of jacket.variants) {
        if (!variant.difficulty) fail(gameId, `jacket ${jacket.id} has an unlabeled variant`);
        if (difficulties.has(variant.difficulty)) {
          fail(gameId, `jacket ${jacket.id} repeats ${variant.difficulty}`);
        }
        difficulties.add(variant.difficulty);
        httpsUrl(gameId, `jacket ${jacket.id} ${variant.difficulty}`, variant.url);
      }
      httpsUrl(gameId, `jacket ${jacket.id} url`, jacket.url);
      if (jacket.url !== jacket.variants[0].url) {
        fail(gameId, `jacket ${jacket.id} does not use its first variant as the cover`);
      }
      if (!SDVX_JACKET_CATEGORIES.includes(jacket.category)) {
        fail(gameId, `jacket ${jacket.id} has an invalid public category`);
      }
      if (!Number.isInteger(jacket.popularity) || jacket.popularity < 0) {
        fail(gameId, `jacket ${jacket.id} has an invalid popularity count`);
      }
    }

    // 자켓만 검사하면 연결 캐릭터에 복사된 URL이 검증을 통째로 비껴간다.
    for (const character of data.characters || []) {
      httpsUrl(gameId, `character ${character.id} profileImage`, character.profileImage);
      for (const [index, image] of (character.images || []).entries()) {
        httpsUrl(gameId, `character ${character.id} image ${index}`, image.url);
      }
    }
  }

  const skins = Array.isArray(data.skins) ? data.skins : [];
  if (expectation.skins && !skins.length) fail(gameId, 'skins is empty');
  uniqueIds(gameId, 'skins', skins);
  for (const skin of skins) {
    if (!Number.isFinite(Number(skin.additionOrder))) {
      fail(gameId, `skin ${skin.id} has an invalid additionOrder`);
    }
    if (!skin.characterId) fail(gameId, `skin ${skin.id} has no characterId`);
    httpsUrl(gameId, `skin ${skin.id} url`, skin.url);
  }

  if (gameId === 'blue-archive') {
    const popularity = data.sortMetadata?.popularity;
    if (!popularity || typeof popularity.available !== 'boolean') {
      fail(gameId, 'popularity availability metadata is missing');
    } else if (popularity.available) {
      if (!items.every((character) => Number.isFinite(Number(character.popularityScore)))) {
        fail(gameId, 'an available popularity snapshot has missing scores');
      }
      if (!(Number(popularity.matched) > 0)) fail(gameId, 'popularity metadata matched no characters');
    }
  }

  if (gameId === 'eternal-return') {
    const release = data.sortMetadata?.release;
    if (!release || typeof release.available !== 'boolean') {
      fail(gameId, 'release-order availability metadata is missing');
    } else if (release.available) {
      if (!items.every((character) => Number.isInteger(character.releaseOrder))) {
        fail(gameId, 'an available release snapshot has invalid releaseOrder values');
      }
      if (!(Number(release.matched) > 0)) fail(gameId, 'release metadata matched no characters');
    }
  }

  if (gameId === 'genshin') {
    const trimTargets = [
      ...items.flatMap((character) => character.images || []),
      ...skins,
    ].filter((image) => image.sourceType !== 'official_standing' || image.url.includes('Gacha_AvatarImg'));
    if (!trimTargets.some((image) => image.trimTransparent === true)) {
      fail(gameId, 'transparent-margin trim metadata is missing');
    }
  }

  if (gameId === 'sound-voltex') {
    const characters = Array.isArray(data.characters) ? data.characters : [];
    if (characters.length < 60) fail(gameId, `character roster is unexpectedly small (${characters.length})`);
    const linked = items.filter((jacket) => jacket.character?.id);
    if (linked.length < 300) fail(gameId, `too few jackets are linked to characters (${linked.length})`);
    for (const character of characters) {
      if (!character.names || !Object.values(character.names).some(Boolean)) {
        fail(gameId, `character ${character.id} has no display name`);
      }
      httpsUrl(gameId, `character ${character.id} profileImage`, character.profileImage);
    }
  }

  const result = manifestResults.get(filename);
  if (!result?.ok) fail(gameId, 'manifest result is not successful');
  if (Number(result?.count) !== items.length) {
    fail(gameId, `manifest count ${result?.count} does not match ${items.length}`);
  }
  summary.push(`${gameId}: ${items.length} ${expectation.collection}, ${skins.length} skins${data.stale ? ' (stale)' : ''}`);
}

if (failures.length) {
  console.error(`data validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`data validation passed:\n- ${summary.join('\n- ')}`);
