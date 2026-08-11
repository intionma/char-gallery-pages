import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBooruPopularityScores, releaseTimestamp } from './sort-utils.mjs';
import { rateSdvxJacket } from './sdvx-jacket-ratings.mjs';
import { GAMES, gameById } from './games/registry.mjs';
import { wikiCategoryMembers } from './adapters/shared.mjs';
import buildHonkaiStarRail from './adapters/honkai-star-rail.mjs';
import buildAzurLane from './adapters/azur-lane.mjs';
import buildArknights from './adapters/arknights.mjs';
import buildLastOrigin from './adapters/last-origin.mjs';
import buildNikke from './adapters/nikke.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, process.argv[2] || 'dist/data');
const generatedAt = new Date().toISOString();
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';
const PUBLISHED_DATA_ROOT = 'https://intionma.github.io/char-gallery-pages/data/';
const publishedCache = new Map();
// 원본에서 받은 원자료를 그대로 남겨 두는 자리. 결과가 아니라 원자료를 남겨야
// 원본이 막힌 날에도 지금 코드로 다시 만들 수 있다. 워크플로가 실행 간에 넘겨 준다.
const SDVX_SOURCE_CACHE = path.resolve(root, '.cache/sdvx-songs.json');

await fs.mkdir(outDir, { recursive: true });

// 게임 메타는 레지스트리가 단일 기준이다. 빌더마다 리터럴을 두면 이름·설명이 어긋난다.
/**
 * 표시 이름이 겹치는 캐릭터에 그룹(원소·속성)을 덧붙여 목록에서 구분되게 한다.
 * 그래도 겹치면 영문명을 덧붙인다.
 */
function disambiguateByGroup(characters) {
  const counts = new Map();
  const labelOf = (character) => character.names.ko || character.names.en;
  for (const character of characters) {
    counts.set(labelOf(character), (counts.get(labelOf(character)) || 0) + 1);
  }
  for (const character of characters) {
    const label = labelOf(character);
    if ((counts.get(label) || 0) < 2) continue;
    const suffix = ` · ${character.group}`;
    const collides = characters.filter((other) => labelOf(other) === label
      && `${label} · ${other.group}` === `${label}${suffix}`).length > 1;
    const tail = collides ? ` (${character.names.en})` : suffix;
    if (character.names.ko) character.names.ko += tail;
    else character.names.en += tail;
  }
  return characters;
}

function gameMeta(gameId) {
  const game = gameById.get(gameId);
  if (!game) throw new Error(`unknown game id: ${gameId}`);
  return { id: game.id, name: game.name, description: game.dataDescription };
}

// 원본이 순간적으로 끊기면 그 게임 전체가 스냅샷 폴백으로 떨어진다. 화면에는 옛 데이터가
// 그대로 나가므로 눈에 잘 띄지 않는다. 사볼이 이 한 번의 실패 때문에 이틀 동안 08-06 자켓을
// 내보냈다. 끊김·타임아웃·5xx·429 는 잠깐 뒤 다시 시도한다. 404 처럼 재시도가 무의미한
// 응답은 그대로 던져 폴백으로 보낸다.
function isRetryable(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return true;
  if (error instanceof TypeError) return true; // 'fetch failed' — DNS·연결 끊김
  return [408, 425, 429, 500, 502, 503, 504].includes(error?.status);
}

async function fetchRetry(url, init, { tries = 3, delay = 3000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, init());
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}: ${url}`);
        error.status = response.status;
        // 본문을 붙잡고 있으면 연결이 반납되지 않는다.
        await response.body?.cancel().catch(() => {});
        throw error;
      }
      return response;
    } catch (error) {
      if (attempt >= tries || !isRetryable(error)) throw error;
      console.log(`재시도 ${attempt}/${tries - 1}: ${error.message}`);
      await new Promise((resolve) => { setTimeout(resolve, delay * attempt); });
    }
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchRetry(url, () => ({
    ...options,
    headers: { Accept: 'application/json,*/*', 'User-Agent': UA, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 60000),
  }));
  return response.json();
}

async function fetchText(url) {
  const response = await fetchRetry(url, () => ({
    headers: { Accept: 'text/html,application/javascript,*/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(60000),
  }));
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

let sdvxCrew = null;
async function loadSdvxCrew() {
  if (!sdvxCrew) {
    sdvxCrew = JSON.parse(await fs.readFile(path.join(__dirname, 'data/sdvx-crew.json'), 'utf8'));
  }
  return sdvxCrew;
}

async function enrichSoundVoltex(data) {
  const links = await loadSdvxCharacterLinks();
  const crewData = await loadSdvxCrew();
  const portraitsByCharacter = new Map();
  for (const portrait of crewData.portraits || []) {
    if (!portrait.character || !portrait.url) continue;
    const list = portraitsByCharacter.get(portrait.character) || [];
    list.push(portrait);
    portraitsByCharacter.set(portrait.character, list);
  }
  const jackets = Array.isArray(data.jackets) ? data.jackets : [];
  const jacketsBySong = new Map(
    jackets.map((jacket) => [songKey(jacket.title || jacket.group), jacket]),
  );
  const linkedCharacters = new Map();
  const koCounts = new Map();
  for (const entry of links.characters || []) {
    const label = entry.ko || entry.name;
    koCounts.set(label, (koCounts.get(label) || 0) + 1);
  }
  const characters = (links.characters || []).map((entry) => {
    const id = slug('sdvx', entry.name);
    // 자매 캐릭터가 하나의 한국어 표기를 공유하는 경우가 있어 영문명으로 구분한다.
    const label = entry.ko || entry.name;
    const ko = entry.ko && koCounts.get(label) > 1 ? `${entry.ko} (${entry.name})` : entry.ko || undefined;
    const names = { en: entry.name, ko, ja: entry.ja || undefined };
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
        // 라이트박스의 "이 자켓으로 이동"이 자켓 뷰의 어느 곡인지 찾을 때 쓴다.
        jacketId: jacket.id,
      }];
    });
    // 공식 캐릭터 일러스트는 사실상 프로필 사진이다. 자켓(곡 그림)보다 앞에 둔다.
    const portraits = (portraitsByCharacter.get(entry.name) || []).map((portrait) => ({
      url: portrait.url,
      group: portrait.name,
      type: '프로필',
      sourceType: 'official_portrait',
      sourceUrl: crewData.source?.portraits || entry.pageUrl,
      width: portrait.width,
      height: portrait.height,
    }));
    return {
      id,
      names,
      group: '여성 캐릭터',
      profileImage: portraits[0]?.url || entry.profileImage,
      sourceUrl: entry.pageUrl,
      images: [...portraits, ...images],
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
  // 네메시스 크루는 곡과 무관한 별도 계통이라 전용 목록으로 낸다.
  const charactersByName = new Map((links.characters || []).map((entry) => [entry.name, entry]));
  const crew = (crewData.crew || []).filter((row) => row.url).map((row) => {
    const owner = row.character ? charactersByName.get(row.character) : undefined;
    return {
      id: slug('sdvx-crew', row.name),
      name: row.name,
      url: row.url,
      width: row.width,
      height: row.height,
      kind: row.kind,
      addedAt: row.addedAt,
      sourceUrl: crewData.source?.crew,
      ...(owner ? {
        characterId: slug('sdvx', owner.name),
        characterName: owner.ko || owner.name,
      } : {}),
    };
  });

  return {
    ...data,
    characters,
    jackets: enrichedJackets,
    crew,
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

  // 여행자는 원소별로 6명이 같은 이름을 쓴다. 목록에서 구분되도록 원소를 덧붙인다.
  disambiguateByGroup(characters);
  characters.sort((a, b) => a.group.localeCompare(b.group, 'ko') || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko'));
  return { generatedAt, game: gameMeta('genshin'), characters };
}

// 구현은 어댑터 공용 모듈에 한 벌만 둔다. 신규 위키 기반 게임도 같은 것을 쓴다.
const wikiCategory = wikiCategoryMembers;

/**
 * 아직 출시되지 않아 DAK 에도 위키에도 없는 실험체.
 *
 * 시즌 로드맵·티저에만 공개돼 있어 이 목록이 유일한 출처다. 출시되면 DAK 에서
 * 같은 id 로 잡히므로, 그때 이 파일에서 지우면 자동으로 정식 데이터가 이긴다.
 */
async function upcomingEternalReturn() {
  const file = path.resolve(__dirname, 'data/er-upcoming-characters.json');
  const seeds = JSON.parse(await fs.readFile(file, 'utf8'));
  return seeds.map((seed) => ({
    id: slug('er', seed.name),
    names: { en: seed.name, ko: seed.ko },
    group: '실험체',
    profileImage: seed.profileImage,
    sourceUrl: seed.sourceUrl,
    images: [{
      url: seed.profileImage,
      group: '기본',
      type: '기본',
      sourceUrl: seed.sourceUrl,
    }],
    releasedAt: seed.releasedAt,
    upcoming: true,
    releaseSequence: Number.MAX_SAFE_INTEGER,
  }));
}

/**
 * 시즌 배경화면. 공식 팬키트(구글 드라이브 공개 폴더)가 출처다.
 *
 * 드라이브 이미지 CDN 은 `=w<px>` 로 축소본, `=s0` 로 원본을 준다. 4K 원본을
 * 목록에 그대로 걸면 한 화면에 수십 MB 라 카드에는 축소본을 쓴다.
 */
async function eternalReturnWallpapers() {
  const file = path.resolve(__dirname, 'data/er-wallpapers.json');
  const seeds = JSON.parse(await fs.readFile(file, 'utf8'));
  return seeds
    .filter((seed) => seed.driveId)
    .map((seed) => ({
      id: slug('er-wallpaper', seed.season || seed.title),
      title: seed.title,
      season: seed.season,
      width: seed.width,
      height: seed.height,
      url: `https://lh3.googleusercontent.com/d/${seed.driveId}=s0`,
      thumbUrl: `https://lh3.googleusercontent.com/d/${seed.driveId}=w640`,
      sourceUrl: seed.sourceUrl,
    }));
}

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
  }).concat(await upcomingEternalReturn()).sort((a, b) => {
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
    wallpapers: await eternalReturnWallpapers(),
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

/**
 * 원본이 봇 차단 인터스티셜을 내보낼 때가 있다. 그때는 HTTP 202 에 캡차 HTML 이라
 * 응답 자체는 정상으로 보이고, 번들 주소만 없다. fetchRetry 는 상태 코드만 보므로
 * 이 경우를 잡지 못한다. 번들을 찾을 때까지 몇 번 더 두드린다.
 */
async function sdvxBundle(ROOT, tries = 3, delay = 5000) {
  for (let attempt = 1; ; attempt += 1) {
    const page = await fetchText(`${ROOT}/`);
    const script = page.match(/<script[^>]+src="([^"]*main\.[^"]+\.js)"/i)?.[1];
    if (script) return new URL(script.replace(/&amp;/g, '&'), ROOT).href;
    const blocked = /sgcaptcha|captcha|http-equiv="refresh"/i.test(page);
    if (attempt >= tries) {
      throw new Error(`SDVX frontend bundle not found${blocked ? ' (봇 차단 인터스티셜)' : ''}`);
    }
    console.log(`재시도 ${attempt}/${tries - 1}: SDVX 첫 페이지에 번들이 없습니다${blocked ? ' — 봇 차단 인터스티셜' : ''}`);
    await new Promise((resolve) => { setTimeout(resolve, delay * attempt); });
  }
}

/**
 * 원본 곡 목록을 받아 원자료 그대로 캐시에 남긴다.
 *
 * 원본이 막히면 예전에는 발행된 결과(dist 에 나갔던 JSON)를 그대로 다시 내보냈다.
 * 그 결과는 그때 살아 있던 코드가 만든 것이라, 그 사이 수집 코드를 고쳐 놔도 폴백이
 * 한 번 걸리는 순간 통째로 되돌아갔다. 실제로 같은 커밋에서 원본 수집이 된 실행은
 * 자켓 변형 8,593개(ULT·NBL 포함), 폴백이 걸린 실행은 8,584개(ULT·NBL 없음)가 나왔다.
 * 게다가 폴백은 발행된 결과를 다시 읽으므로 한 번 되돌아가면 다음 폴백의 입력이 되어
 * 그대로 굳는다.
 *
 * 그래서 결과가 아니라 **원자료**를 캐시에 남기고, 원본이 막히면 지금 코드로 다시
 * 만든다. 곡 목록은 그때 것이라 stale 로 표시하지만 수집 코드 수정은 살아남는다.
 */
async function sdvxSource(ROOT) {
  try {
    const bundleUrl = await sdvxBundle(ROOT);
    const bundle = await fetchText(bundleUrl);
    // 매니페스트 이름은 버전이 올라갈 때마다 바뀐다. 예전 정규식이 버전을 숫자와 점으로만
    // 받는 바람에 'songsv1.4.2c.json' 처럼 끝에 글자가 붙자 매칭에 실패했고, 스냅샷
    // 폴백이 조용히 받아 주면서 2주 넘게 옛 데이터가 배포됐다. 파일명 전체를 받는다.
    const manifestPath = bundle.match(/["'](\/songsv[^"']*\.json)["']/)?.[1];
    if (!manifestPath) throw new Error('SDVX song manifest not found');
    const songs = await fetchJson(new URL(manifestPath, ROOT).href);
    if (!Array.isArray(songs) || songs.length < 2000) {
      throw new Error(`SDVX song manifest looks wrong: ${Array.isArray(songs) ? `${songs.length} songs` : typeof songs}`);
    }
    await fs.mkdir(path.dirname(SDVX_SOURCE_CACHE), { recursive: true });
    await fs.writeFile(SDVX_SOURCE_CACHE, JSON.stringify({ manifestPath, fetchedAt: generatedAt, songs }), 'utf8');
    return { songs, manifestPath, cachedFrom: null };
  } catch (error) {
    const raw = await fs.readFile(SDVX_SOURCE_CACHE, 'utf8').catch(() => null);
    if (!raw) throw error;
    let cache;
    try {
      cache = JSON.parse(raw);
    } catch {
      throw error;
    }
    if (!Array.isArray(cache.songs) || cache.songs.length < 2000) throw error;
    console.warn(`::warning title=SDVX 원본 수집 실패::${error.message} — ${cache.fetchedAt} 에 받아 둔 원자료로 지금 코드에서 다시 만듭니다`);
    return { songs: cache.songs, manifestPath: cache.manifestPath, cachedFrom: cache.fetchedAt };
  }
}

async function buildSoundVoltex() {
  const ROOT = 'https://sdvxindex.com';
  const { songs: source, manifestPath, cachedFrom } = await sdvxSource(ROOT);
  // ULT·NBL 은 4번째 난이도(MXM·INF·GRV·HVN·VVD·XCD)보다 위에 붙는 별도 난이도라
  // 순위를 더 높게 준다. 대표 자켓은 variants[0] 이므로 이 곡들은 표지가 ULT·NBL 자켓이 된다.
  const diff = { novice: 'NOV', advanced: 'ADV', exhaust: 'EXH', maximum: 'MXM', infinite: 'INF', gravity: 'GRV', heavenly: 'HVN', vivid: 'VVD', exceed: 'XCD', ultimate: 'ULT', nabla: 'NBL' };
  const rank = { NOV: 1, ADV: 2, EXH: 3, MXM: 10, INF: 10, GRV: 10, HVN: 10, VVD: 10, XCD: 10, ULT: 20, NBL: 20 };
  // 자켓이 안 붙은 곡은 목록에서 뺀다. 다만 조용히 빼면 신곡이 안 뜨는 것과 구별되지
  // 않는다. 새 난이도 이름이 생겨 diff 표에 없거나 자켓이 아직 안 올라온 경우가 여기 걸린다.
  const dropped = [];
  const unknownTypes = new Set();
  const jackets = source.flatMap((song) => {
    const seen = new Set();
    const variants = (song.difficulties || []).flatMap((chart) => {
      const difficulty = diff[String(chart.type || '').toLowerCase()];
      if (!difficulty) unknownTypes.add(String(chart.type || '(빈 값)'));
      if (!difficulty || !chart.jacketArtPath || seen.has(difficulty)) return [];
      seen.add(difficulty);
      return [{ difficulty, level: chart.level, url: chart.jacketArtPath }];
    }).sort((a, b) => rank[b.difficulty] - rank[a.difficulty]);
    if (!variants.length) {
      dropped.push({ songid: Number(song.songid) || 0, title: song.title, date: song.date });
      return [];
    }
    return [{
      id: String(song.songid), title: song.title, artist: song.artist, releasedAt: song.date,
      url: variants[0].url, sourceUrl: `${ROOT}/s/${song.songid}/1`, variants,
    }];
  });
  // 최신곡 날짜를 남긴다. 원본이 멈췄는지 로그만 보고 알 수 있어야 한다.
  const newest = jackets.map((j) => j.releasedAt).filter(Boolean).sort().at(-1);
  console.log(`SDVX manifest ${manifestPath}: ${source.length} songs → ${jackets.length} jackets, newest ${newest || '(날짜 없음)'}`);
  if (dropped.length) {
    const latest = [...dropped].sort((a, b) => b.songid - a.songid).slice(0, 5);
    console.log(`SDVX: 자켓이 없어 제외한 곡 ${dropped.length}건 — 최근 ${latest.map((song) => `${song.songid} ${song.title}`).join(' · ')}`);
  }
  // 난이도별 자켓 수. 난이도를 새로 이어 붙였을 때 실제로 걸렸는지 여기서 확인한다.
  const byDifficulty = {};
  for (const jacket of jackets) for (const variant of jacket.variants) byDifficulty[variant.difficulty] = (byDifficulty[variant.difficulty] || 0) + 1;
  const covers = {};
  for (const jacket of jackets) covers[jacket.variants[0].difficulty] = (covers[jacket.variants[0].difficulty] || 0) + 1;
  console.log(`SDVX 난이도별 자켓: ${Object.entries(byDifficulty).sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} ${n}`).join(' · ')}`);
  console.log(`SDVX 대표 자켓 난이도: ${Object.entries(covers).sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} ${n}`).join(' · ')}`);
  // 모르는 난이도 이름이 나오면 그 곡이 통째로 빠질 수 있다. 새 난이도 추가를 놓치지 않는다.
  if (unknownTypes.size) {
    console.log(`::warning title=SDVX 미등록 난이도::${[...unknownTypes].join(', ')} — diff 표에 없어 무시했습니다`);
  }
  return enrichSoundVoltex({
    generatedAt,
    game: gameMeta('sound-voltex'),
    jackets,
    // 캐시로 만든 곡 목록은 그때 것이다. 화면에 갱신 지연 안내를 띄우기 위해 표시한다.
    ...(cachedFrom ? { stale: true, sourceFetchedAt: cachedFrom } : {}),
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
  // 신규 어댑터는 scripts/adapters/ 규약을 따르므로 game·generatedAt 을 여기서 붙인다.
  'honkai-star-rail': async () => ({ generatedAt, game: gameMeta('honkai-star-rail'), ...(await buildHonkaiStarRail()) }),
  'azur-lane': async () => ({ generatedAt, game: gameMeta('azur-lane'), ...(await buildAzurLane()) }),
  arknights: async () => ({ generatedAt, game: gameMeta('arknights'), ...(await buildArknights()) }),
  'last-origin': async () => ({ generatedAt, game: gameMeta('last-origin'), ...(await buildLastOrigin()) }),
  nikke: async () => ({ generatedAt, game: gameMeta('nikke'), ...(await buildNikke()) }),
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
        // 폴백은 화면에 옛 데이터를 그대로 내보내므로 로그 한 줄로는 아무도 눈치채지 못한다.
        // Actions 주석으로 올려 실행 목록에서 바로 보이게 한다.
        const since = fallback.generatedAt ? ` (마지막 정상 수집 ${fallback.generatedAt})` : '';
        console.warn(`::warning title=${name} 원본 갱신 실패::${count}건의 옛 데이터를 그대로 내보냅니다${since} — ${error.message}`);
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
