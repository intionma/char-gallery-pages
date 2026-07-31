import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBooruPopularityScores, releaseTimestamp } from './sort-utils.mjs';
import { rateSdvxJacket } from './sdvx-jacket-ratings.mjs';
import { GAMES, gameById } from './games/registry.mjs';
import { wikiCategoryMembers } from './adapters/shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, process.argv[2] || 'dist/data');
const generatedAt = new Date().toISOString();
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';
const PUBLISHED_DATA_ROOT = 'https://intionma.github.io/char-gallery-pages/data/';
const publishedCache = new Map();

await fs.mkdir(outDir, { recursive: true });

// 게임 메타는 레지스트리가 단일 기준이다. 빌더마다 리터럴을 두면 이름·설명이 어긋난다.
function gameMeta(gameId) {
  const game = gameById.get(gameId);
  if (!game) throw new Error(`unknown game id: ${gameId}`);
  return { id: game.id, name: game.name, description: game.dataDescription };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json,*/*', 'User-Agent': UA, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/javascript,*/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function writeJson(name, value) {
  await fs.writeFile(path.join(outDir, name), JSON.stringify(value), 'utf8');
}

async function publishedData(name) {
  if (!publishedCache.has(name)) {
    publishedCache.set(
      name,
      fetchJson(new URL(name, PUBLISHED_DATA_ROOT), { timeout: 30000 }),
    );
  }
  return publishedCache.get(name);
}

function dataCount(data) {
  return data.jackets?.length ?? data.characters?.length ?? 0;
}

async function publishedFallback(name) {
  const data = await publishedData(name);
  const count = dataCount(data);
  if (!count) throw new Error(`published ${name} fallback is empty`);
  const reusable = name === 'sound-voltex.json' ? await enrichSoundVoltex(data) : data;
  const fallback = {
    ...reusable,
    stale: true,
    fallbackUsedAt: generatedAt,
  };
  if (name === 'blue-archive.json' && !fallback.sortMetadata?.popularity) {
    fallback.sortMetadata = {
      ...(fallback.sortMetadata || {}),
      popularity: { available: false, source: 'unavailable', matched: 0, updatedAt: generatedAt },
    };
  }
  if (name === 'eternal-return.json' && !fallback.sortMetadata?.release) {
    fallback.sortMetadata = {
      ...(fallback.sortMetadata || {}),
      release: { available: false, source: 'unavailable', matched: 0, updatedAt: generatedAt },
    };
  }
  delete fallback.error;
  return fallback;
}

function released(value) {
  return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
}
function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function slug(prefix, value) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function songKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

let sdvxCharacterLinks;

async function loadSdvxCharacterLinks() {
  if (!sdvxCharacterLinks) {
    sdvxCharacterLinks = JSON.parse(
      await fs.readFile(path.join(__dirname, 'data/sdvx-character-links.json'), 'utf8'),
    );
  }
  return sdvxCharacterLinks;
}

async function enrichSoundVoltex(data) {
  const links = await loadSdvxCharacterLinks();
  const jackets = Array.isArray(data.jackets) ? data.jackets : [];
  const jacketsBySong = new Map(
    jackets.map((jacket) => [songKey(jacket.title || jacket.group), jacket]),
  );
  const linkedCharacters = new Map();
  const characters = (links.characters || []).map((entry) => {
    const id = slug('sdvx', entry.name);
    const names = { en: entry.name, ko: entry.ko || undefined, ja: entry.ja || undefined };
    const images = (entry.songs || []).flatMap((key) => {
      const jacket = jacketsBySong.get(key);
      if (!jacket) return [];
      const known = linkedCharacters.get(key) || [];
      if (!known.some((character) => character.id === id)) {
        known.push({ id, names });
        linkedCharacters.set(key, known);
      }
      return [{
        url: jacket.url,
        group: jacket.title || jacket.group,
        type: '자켓',
        sourceUrl: jacket.sourceUrl,
        variants: jacket.variants,
        releasedAt: jacket.releasedAt,
      }];
    });
    return {
      id,
      names,
      group: '여성 캐릭터',
      profileImage: entry.profileImage,
      sourceUrl: entry.pageUrl,
      images,
    };
  });
  const enrichedJackets = jackets.map((jacket) => {
    const charactersForSong = linkedCharacters.get(songKey(jacket.title || jacket.group)) || [];
    const character = charactersForSong[0];
    return {
      ...jacket,
      characterId: character?.id,
      character,
      characters: charactersForSong,
      popularity: charactersForSong.length,
      category: rateSdvxJacket(jacket, charactersForSong.length),
    };
  });
  return {
    ...data,
    characters,
    jackets: enrichedJackets,
    linkMetadata: {
      source: links.source,
      characters: characters.length,
      linkedSongs: linkedCharacters.size,
      totalLinks: (links.characters || []).reduce(
        (sum, character) => sum + (character.songs?.length || 0),
        0,
      ),
    },
  };
}

async function fetchBlueArchivePopularity(characters) {
  const tags = [];
  for (let page = 1; page <= 3; page += 1) {
    const url = new URL('https://danbooru.donmai.us/tags.json');
    url.searchParams.set('search[category]', '4');
    url.searchParams.set('search[name_matches]', '*_(blue_archive)');
    url.searchParams.set('search[hide_empty]', 'yes');
    url.searchParams.set('search[is_deprecated]', 'no');
    url.searchParams.set('search[order]', 'count');
    url.searchParams.set('limit', '1000');
    url.searchParams.set('page', String(page));
    const batch = await fetchJson(url, { timeout: 45000 });
    if (!Array.isArray(batch)) throw new Error('Danbooru popularity response is not an array');
    tags.push(...batch);
    if (batch.length < 1000) break;
  }
  if (!tags.length) throw new Error('Danbooru returned no Blue Archive character tags');

  const scores = buildBooruPopularityScores(characters, tags, 'blue_archive');
  if (![...scores.values()].some((score) => score > 0)) {
    throw new Error('Danbooru popularity matched no Blue Archive characters');
  }
  return { scores, source: 'danbooru', updatedAt: generatedAt };
}

async function blueArchivePopularity(characters) {
  let snapshot;
  try {
    snapshot = await fetchBlueArchivePopularity(characters);
  } catch (error) {
    console.warn(`Blue Archive popularity refresh skipped: ${error.message}`);
    try {
      const previous = await publishedData('blue-archive.json');
      const scores = new Map(
        (previous.characters || [])
          .filter((character) => Number.isFinite(Number(character.popularityScore)))
          .map((character) => [character.id, Number(character.popularityScore)]),
      );
      if ([...scores.values()].some((score) => score > 0)) {
        snapshot = {
          scores,
          source: previous.sortMetadata?.popularity?.source || 'published-snapshot',
          updatedAt: previous.sortMetadata?.popularity?.updatedAt || previous.generatedAt,
        };
      }
    } catch (fallbackError) {
      console.warn(`Blue Archive popularity fallback unavailable: ${fallbackError.message}`);
    }
  }

  if (!snapshot) {
    return {
      characters,
      metadata: { available: false, source: 'unavailable', matched: 0, updatedAt: generatedAt },
    };
  }
  const enriched = characters.map((character) => ({
    ...character,
    popularityScore: snapshot.scores.get(character.id) || 0,
  }));
  return {
    characters: enriched,
    metadata: {
      available: true,
      source: snapshot.source,
      matched: enriched.filter((character) => character.popularityScore > 0).length,
      updatedAt: snapshot.updatedAt,
    },
  };
}

async function buildBlueArchive() {
  const BASE = 'https://schaledb.com';
  const [en, ko, ja] = await Promise.all([
    fetchJson(`${BASE}/data/en/students.min.json`),
    fetchJson(`${BASE}/data/kr/students.min.json`),
    fetchJson(`${BASE}/data/jp/students.min.json`),
  ]);
  const schoolKo = {
    Abydos: '아비도스', Gehenna: '게헤나', Millennium: '밀레니엄', Trinity: '트리니티',
    Hyakkiyako: '백귀야행', Shanhaijing: '산해경', RedWinter: '붉은겨울', Valkyrie: '발키리',
    SRT: 'SRT', Arius: '아리우스', WildHunt: '와일드헌트', Highlander: '하이랜더',
    Tokiwadai: '토키와다이', Sakugawa: '사쿠가와', ETC: '기타',
  };
  const schoolOrder = Object.keys(schoolKo);
  const rows = Object.entries(en)
    .filter(([, student]) => released(student.IsReleased) && !student.Name.includes('('))
    .map(([id, base]) => {
      const groupKey = `${base.FamilyName || ''}|${base.PersonalName || ''}`;
      const members = Object.values(en)
        .filter((student) => released(student.IsReleased) && `${student.FamilyName || ''}|${student.PersonalName || ''}` === groupKey)
        .sort((a, b) => Number(a.Name.includes('(')) - Number(b.Name.includes('(')) || (a.DefaultOrder || 0) - (b.DefaultOrder || 0));
      const costumeLabel = (name, fallback) => (name || fallback).match(/\(([^)]+)\)/)?.[1]?.trim() || '기본';
      return {
        id: `ba-${base.Id}`,
        names: {
          en: [base.FamilyName, base.PersonalName].filter(Boolean).join(' ') || base.Name,
          ko: ko[id]?.Name,
          ja: ja[id]?.Name,
        },
        group: schoolKo[base.School] || base.School || '기타',
        order: [schoolOrder.indexOf(base.School), base.DefaultOrder || 0],
        profileImage: `${BASE}/images/student/icon/${base.Id}.webp`,
        sourceUrl: `${BASE}/student/${base.PathName}`,
        images: members.map((student) => ({
          url: `${BASE}/images/student/portrait/${student.Id}.webp`,
          thumbUrl: `${BASE}/images/student/icon/${student.Id}.webp`,
          group: costumeLabel(ko[String(student.Id)]?.Name, student.Name),
          type: student.Name.includes('(') ? '의상' : '기본',
          sourceUrl: `${BASE}/student/${student.PathName}`,
        })),
      };
    })
    .sort((a, b) => (a.order[0] < 0 ? 999 : a.order[0]) - (b.order[0] < 0 ? 999 : b.order[0]) || a.order[1] - b.order[1])
    .map(({ order, ...character }) => character);
  const popularity = await blueArchivePopularity(rows);
  return {
    generatedAt,
    game: gameMeta('blue-archive'),
    characters: popularity.characters,
    sortMetadata: { popularity: popularity.metadata },
  };
}

async function buildGenshin() {
  const AMBR = 'https://gi.yatta.moe';
  const asset = (name) => `${AMBR}/assets/UI/${name}.png`;
  const [enData, koData, jaData] = await Promise.all([
    fetchJson(`${AMBR}/api/v2/en/avatar`),
    fetchJson(`${AMBR}/api/v2/kr/avatar`),
    fetchJson(`${AMBR}/api/v2/jp/avatar`),
  ]);
  const en = enData.data?.items || {};
  const ko = koData.data?.items || {};
  const ja = jaData.data?.items || {};
  const female = new Set(['GIRL', 'LADY', 'LOLI']);
  const elementKo = { Fire: '불', Water: '물', Wind: '바람', Electric: '번개', Grass: '풀', Ice: '얼음', Rock: '바위' };
  const characters = Object.entries(en).flatMap(([id, avatar]) => {
    if (!female.has(avatar.bodyType) || !avatar.icon) return [];
    const defaultUrl = asset(avatar.icon.replace('UI_AvatarIcon_', 'UI_Gacha_AvatarImg_'));
    return [{
      id: `gi-${id}`,
      names: { en: avatar.name, ko: ko[id]?.name, ja: ja[id]?.name },
      group: elementKo[avatar.element] || avatar.element || '기타',
      profileImage: asset(avatar.icon),
      sourceUrl: `${AMBR}/en/archive/avatar/${id}/${avatar.route || ''}`,
      images: [{
        url: defaultUrl,
        group: '기본',
        type: '기본',
        sourceUrl: `${AMBR}/en/archive/avatar/${id}/${avatar.route || ''}`,
        trimTransparent: true,
      }],
    }];
  });

  try {
    const outfitEndpoint = 'https://genshin-db-api.vercel.app/api/v5/outfits';
    const loadOutfits = async (language) => {
      const params = new URLSearchParams({ query: 'names', matchCategories: 'true', verboseCategories: 'true', resultLanguage: language });
      const payload = await fetchJson(`${outfitEndpoint}?${params}`);
      return Array.isArray(payload) ? payload : (payload.result || []);
    };
    const [outfitsEn, outfitsKo] = await Promise.all([loadOutfits('English'), loadOutfits('Korean')]);
    const identity = (outfit) => String(outfit.id ?? `${outfit.characterId ?? outfit.characterName ?? outfit.character}:${outfit.name}`);
    const koById = new Map(outfitsKo.map((outfit) => [identity(outfit), outfit]));
    const nonDefault = outfitsEn.filter((outfit) => !(outfit.isDefault ?? outfit.isdefault) && outfit.name && (outfit.characterId != null || outfit.characterName || outfit.character));
    const candidates = [];
    const candidateMap = new Map();
    for (const outfit of nonDefault) {
      const names = [outfit.name, String(outfit.name).replace(/%/g, '').replace(/\s+/g, ' ').trim()];
      const titles = [...new Set(names.flatMap((name) => [
        `File:Character ${outfit.characterName || outfit.character} ${name} Full Wish.png`,
        `File:Outfit ${name} Game.png`,
        `File:${name} Icon.png`,
      ]))];
      candidateMap.set(identity(outfit), titles);
      candidates.push(...titles);
    }
    const byTitle = new Map();
    for (let i = 0; i < candidates.length; i += 40) {
      const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size', titles: candidates.slice(i, i + 40).join('|'), origin: '*' });
      const data = await fetchJson(`https://genshin-impact.fandom.com/api.php?${params}`);
      for (const page of data.query?.pages || []) {
        const info = page.imageinfo?.[0];
        if (!page.missing && info?.url) byTitle.set(page.title.replace(/_/g, ' ').toLowerCase(), info);
      }
    }
    const byCharacter = new Map(characters.map((character) => [character.id.replace('gi-', ''), character]));
    for (const outfit of nonDefault) {
      const character = byCharacter.get(String(outfit.characterId));
      if (!character) continue;
      const info = (candidateMap.get(identity(outfit)) || []).map((title) => byTitle.get(title.replace(/_/g, ' ').toLowerCase())).find(Boolean);
      if (!info?.url) continue;
      character.images.push({
        url: info.url,
        group: koById.get(identity(outfit))?.name || outfit.name,
        type: '의상',
        sourceUrl: `https://genshin-impact.fandom.com/wiki/${encodeURIComponent(String(outfit.name).replace(/ /g, '_'))}`,
        trimTransparent: true,
      });
    }
  } catch (error) {
    console.warn(`Genshin outfit enrichment skipped: ${error.message}`);
  }

  characters.sort((a, b) => a.group.localeCompare(b.group, 'ko') || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko'));
  return { generatedAt, game: gameMeta('genshin'), characters };
}

// 구현은 어댑터 공용 모듈에 한 벌만 둔다. 신규 위키 기반 게임도 같은 것을 쓴다.
const wikiCategory = wikiCategoryMembers;

async function buildEternalReturn() {
  const host = 'eternalreturn.fandom.com';
  let female = new Set();
  const releaseByName = new Map();
  let releaseSource = 'eternal-return-wiki';
  try {
    const category = await wikiCategory(host, 'Characters');
    const titles = category.map((row) => row.title);
    for (let i = 0; i < titles.length; i += 50) {
      const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.slice(i, i + 50).join('|'), origin: '*' });
      const data = await fetchJson(`https://${host}/api.php?${params}`);
      for (const page of data.query?.pages || []) {
        const content = page.revisions?.[0]?.slots?.main?.content || '';
        if (/\|\s*gender\s*=\s*female/i.test(content)) female.add(page.title);
        const timestamp = releaseTimestamp(content);
        if (timestamp > 0) releaseByName.set(norm(page.title), timestamp);
      }
    }
  } catch (error) {
    const previous = await publishedData('eternal-return.json');
    female = new Set(
      (previous.characters || [])
        .map((character) => character.names?.en)
        .filter(Boolean),
    );
    if (!female.size) throw error;
    releaseSource = 'dak-character-id-fallback';
    console.warn(`ER wiki metadata unavailable; reused ${female.size} verified female names (${error.message})`);
  }
  const [enData, koData] = await Promise.all([
    fetchJson('https://er.dakgg.io/api/v1/data/characters?hl=en'),
    fetchJson('https://er.dakgg.io/api/v1/data/characters?hl=ko'),
  ]);
  const koMap = new Map((koData.characters || []).map((character) => [norm(character.key || character.name), character.name]));
  const dakMap = new Map();
  for (const character of enData.characters || []) {
    dakMap.set(norm(character.name), character);
    dakMap.set(norm(character.key), character);
  }
  const fullSize = (skin) => {
    if (!skin.imageUrl || !skin.imageName || !/^[a-z0-9_]+$/i.test(skin.imageName)) return undefined;
    const absolute = skin.imageUrl.startsWith('//') ? `https:${skin.imageUrl}` : skin.imageUrl;
    const prefix = absolute.match(/^(https:\/\/cdn\.dak\.gg\/assets\/er\/game-assets\/[^/]+)\//i)?.[1];
    return prefix ? `${prefix}/ui/characterfullsize/CharFull_${skin.imageName}.png` : undefined;
  };
  const characters = [...female].flatMap((name) => {
    const dak = dakMap.get(norm(name));
    if (!dak) return [];
    const images = (dak.skins || []).flatMap((skin) => {
      const url = fullSize(skin);
      if (!url) return [];
      const isBase = norm(skin.name) === norm(dak.name);
      const escapedName = dak.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const label = isBase ? '기본' : String(skin.name).replace(new RegExp(`\\s+${escapedName}\\s*$`, 'i'), '').trim() || skin.name;
      return [{ url, group: label, type: isBase ? '기본' : '의상', sourceUrl: `https://${host}/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}` }];
    });
    if (!images.length) return [];
    const released = releaseByName.get(norm(name)) || 0;
    return [{
      id: slug('er', dak.key || dak.name),
      names: { en: dak.name, ko: koMap.get(norm(dak.key || dak.name)) },
      group: '실험체',
      profileImage: images[0].url,
      sourceUrl: `https://${host}/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`,
      images,
      releasedAt: released ? new Date(released).toISOString().slice(0, 10) : undefined,
      releaseSequence: Number(dak.id) || 0,
    }];
  }).sort((a, b) => {
    const aTime = Date.parse(a.releasedAt || '') || 0;
    const bTime = Date.parse(b.releasedAt || '') || 0;
    return bTime - aTime
      || b.releaseSequence - a.releaseSequence
      || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko', { numeric: true });
  }).map(({ releaseSequence, ...character }, releaseOrder) => ({ ...character, releaseOrder }));
  const wikiMatched = characters.filter((character) => character.releasedAt).length;
  const matched = releaseSource === 'eternal-return-wiki' ? wikiMatched : characters.length;
  return {
    generatedAt,
    game: gameMeta('eternal-return'),
    characters,
    sortMetadata: {
      release: {
        available: matched > 0,
        matched,
        source: releaseSource,
        updatedAt: generatedAt,
      },
    },
  };
}

async function buildSoundVoltex() {
  const ROOT = 'https://sdvxindex.com';
  const page = await fetchText(`${ROOT}/`);
  const script = page.match(/<script[^>]+src="([^"]*main\.[^"]+\.js)"/i)?.[1];
  if (!script) throw new Error('SDVX frontend bundle not found');
  const bundleUrl = new URL(script.replace(/&amp;/g, '&'), ROOT).href;
  const bundle = await fetchText(bundleUrl);
  const manifestPath = bundle.match(/["'](\/songsv[\d.]+\.json)["']/)?.[1];
  if (!manifestPath) throw new Error('SDVX song manifest not found');
  const source = await fetchJson(new URL(manifestPath, ROOT).href);
  const diff = { novice: 'NOV', advanced: 'ADV', exhaust: 'EXH', maximum: 'MXM', infinite: 'INF', gravity: 'GRV', heavenly: 'HVN', vivid: 'VVD', exceed: 'XCD' };
  const rank = { NOV: 1, ADV: 2, EXH: 3, MXM: 10, INF: 10, GRV: 10, HVN: 10, VVD: 10, XCD: 10 };
  const jackets = source.flatMap((song) => {
    const seen = new Set();
    const variants = (song.difficulties || []).flatMap((chart) => {
      const difficulty = diff[String(chart.type || '').toLowerCase()];
      if (!difficulty || !chart.jacketArtPath || seen.has(difficulty)) return [];
      seen.add(difficulty);
      return [{ difficulty, level: chart.level, url: chart.jacketArtPath }];
    }).sort((a, b) => rank[b.difficulty] - rank[a.difficulty]);
    if (!variants.length) return [];
    return [{
      id: String(song.songid), title: song.title, artist: song.artist, releasedAt: song.date,
      url: variants[0].url, sourceUrl: `${ROOT}/s/${song.songid}/1`, variants,
    }];
  });
  return enrichSoundVoltex({
    generatedAt,
    game: gameMeta('sound-voltex'),
    jackets,
  });
}

async function buildDjmax() {
  const characters = [
    ['EL CLEAR', '엘 클리어', 'https://static.wikia.nocookie.net/djmax/images/d/da/El_Clear_Tic_Tac_Toe.webp/revision/latest', 'https://djmax.fandom.com/wiki/El_Clear'],
    ['EL FAIL', '엘 페일', 'https://static.wikia.nocookie.net/djmax/images/e/e6/El_Fail_Tic_Tac_Toe.webp/revision/latest', 'https://djmax.fandom.com/wiki/El_Fail'],
    ['LENA', '레나', 'https://static.wikia.nocookie.net/djmax/images/b/b9/Lena.png/revision/latest', 'https://djmax.fandom.com/wiki/Lena'],
    ['PLAY', '플레이', 'https://cdn.donmai.us/original/9c/db/9cdbf7784a7ad9e2676faa2b84c1e239.png', 'https://djmax.fandom.com/wiki/Play'],
    ['DIEIN', '다인', 'https://cdn.donmai.us/original/2d/77/2d77fcaf4845817d7327f882af8fd4a5.jpg', 'https://djmax.fandom.com/wiki/Diein'],
  ].map(([en, ko, image, sourceUrl]) => ({
    id: slug('djmax', en), names: { en, ko }, group: 'DJMAX', profileImage: image, sourceUrl,
    images: [{ url: image, group: '대표 이미지', type: '이미지', sourceUrl }],
  }));
  return { generatedAt, game: gameMeta('djmax'), characters };
}

// 게임 추가 시 여기에 id → 빌더 한 줄만 잇는다. 순서와 파일명은 레지스트리가 정한다.
const BUILDERS = {
  'blue-archive': buildBlueArchive,
  'eternal-return': buildEternalReturn,
  genshin: buildGenshin,
  'sound-voltex': buildSoundVoltex,
  djmax: buildDjmax,
};
const builders = GAMES.map((game) => {
  const builder = BUILDERS[game.id];
  if (!builder) throw new Error(`registry game "${game.id}" has no builder`);
  return [game.dataFile, builder];
});

const results = [];
for (const [name, builder] of builders) {
  try {
    const data = await builder();
    await writeJson(name, data);
    results.push({ name, ok: true, count: data.jackets?.length ?? data.characters?.length ?? 0 });
    console.log(`${name}: ${results.at(-1).count}`);
  } catch (error) {
    try {
      const fallback = await publishedFallback(name);
      if (fallback) {
        await writeJson(name, fallback);
        const count = fallback.jackets?.length ?? fallback.characters?.length ?? 0;
        results.push({ name, ok: true, stale: true, count });
        console.warn(`${name}: upstream refresh failed; retained ${count} published items (${error.message})`);
        continue;
      }
    } catch (fallbackError) {
      console.error(`${name}: published fallback failed: ${fallbackError.stack || fallbackError.message}`);
    }
    console.error(`${name}: ${error.stack || error.message}`);
    const gameId = name.replace('.json', '');
    await writeJson(name, { generatedAt, game: { id: gameId, name: gameById.get(gameId)?.name || gameId }, characters: [], jackets: [], error: true });
    results.push({ name, ok: false, count: 0 });
  }
}

const manifest = {
  generatedAt,
  games: GAMES.map((game) => ({
    id: game.id,
    name: game.name,
    description: game.description,
    coverImage: game.coverImage,
  })),
  results,
};
await writeJson('manifest.json', manifest);
