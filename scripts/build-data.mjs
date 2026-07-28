import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, process.argv[2] || 'dist/data');
const generatedAt = new Date().toISOString();
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';

await fs.mkdir(outDir, { recursive: true });

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

function released(value) {
  return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
}
function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function slug(prefix, value) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
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
  return {
    generatedAt,
    game: { id: 'blue-archive', name: '블루 아카이브', description: 'SchaleDB 기반 공식 스탠딩과 의상' },
    characters: rows,
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
      images: [{ url: defaultUrl, group: '기본', type: '기본', sourceUrl: `${AMBR}/en/archive/avatar/${id}/${avatar.route || ''}` }],
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
      });
    }
  } catch (error) {
    console.warn(`Genshin outfit enrichment skipped: ${error.message}`);
  }

  characters.sort((a, b) => a.group.localeCompare(b.group, 'ko') || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko'));
  return { generatedAt, game: { id: 'genshin', name: '원신', description: 'Project Amber 기반 공식 캐릭터 이미지와 의상' }, characters };
}

async function wikiCategory(host, category) {
  const rows = [];
  let cmcontinue;
  do {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', list: 'categorymembers', cmtitle: `Category:${category}`, cmlimit: '500', cmtype: 'page', origin: '*' });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);
    const data = await fetchJson(`https://${host}/api.php?${params}`);
    rows.push(...(data.query?.categorymembers || []));
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);
  return rows;
}

async function buildEternalReturn() {
  const host = 'eternalreturn.fandom.com';
  const category = await wikiCategory(host, 'Characters');
  const titles = category.map((row) => row.title);
  const female = new Set();
  for (let i = 0; i < titles.length; i += 50) {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.slice(i, i + 50).join('|'), origin: '*' });
    const data = await fetchJson(`https://${host}/api.php?${params}`);
    for (const page of data.query?.pages || []) {
      const content = page.revisions?.[0]?.slots?.main?.content || '';
      if (/\|\s*gender\s*=\s*female/i.test(content)) female.add(page.title);
    }
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
    return [{
      id: slug('er', dak.key || dak.name),
      names: { en: dak.name, ko: koMap.get(norm(dak.key || dak.name)) },
      group: '실험체',
      profileImage: images[0].url,
      sourceUrl: `https://${host}/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`,
      images,
    }];
  }).sort((a, b) => (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko'));
  return { generatedAt, game: { id: 'eternal-return', name: '이터널 리턴', description: 'DAK.GG 및 공식 위키 기반 스탠딩과 스킨' }, characters };
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
  return { generatedAt, game: { id: 'sound-voltex', name: 'SOUND VOLTEX', description: '전체 곡 자켓과 난이도별 변형' }, jackets };
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
  return { generatedAt, game: { id: 'djmax', name: 'DJMAX RESPECT V', description: '대표 캐릭터 이미지' }, characters };
}

const builders = [
  ['blue-archive.json', buildBlueArchive],
  ['eternal-return.json', buildEternalReturn],
  ['genshin.json', buildGenshin],
  ['sound-voltex.json', buildSoundVoltex],
  ['djmax.json', buildDjmax],
];

const results = [];
for (const [name, builder] of builders) {
  try {
    const data = await builder();
    await writeJson(name, data);
    results.push({ name, ok: true, count: data.characters?.length ?? data.jackets?.length ?? 0 });
    console.log(`${name}: ${results.at(-1).count}`);
  } catch (error) {
    console.error(`${name}: ${error.stack || error.message}`);
    const gameId = name.replace('.json', '');
    const gameNames = { 'blue-archive': '블루 아카이브', 'eternal-return': '이터널 리턴', genshin: '원신', 'sound-voltex': 'SOUND VOLTEX', djmax: 'DJMAX RESPECT V' };
    await writeJson(name, { generatedAt, game: { id: gameId, name: gameNames[gameId] || gameId }, characters: [], jackets: [], error: true });
    results.push({ name, ok: false, count: 0 });
  }
}

const manifest = {
  generatedAt,
  games: [
    { id: 'blue-archive', name: '블루 아카이브', description: '공식 스탠딩과 의상', coverImage: 'https://schaledb.com/images/student/portrait/10000.webp' },
    { id: 'eternal-return', name: '이터널 리턴', description: '실험체 스탠딩과 스킨', coverImage: 'https://cdn.dak.gg/assets/er/game-assets/1.40.0/ui/characterfullsize/CharFull_Jackie_001.png' },
    { id: 'genshin', name: '원신', description: '공식 캐릭터 이미지와 의상', coverImage: 'https://gi.yatta.moe/assets/UI/UI_Gacha_AvatarImg_Ayaka.png' },
    { id: 'sound-voltex', name: 'SOUND VOLTEX', description: '전체 곡 자켓과 난이도별 변형', coverImage: null },
    { id: 'djmax', name: 'DJMAX RESPECT V', description: '대표 캐릭터 이미지', coverImage: 'https://static.wikia.nocookie.net/djmax/images/d/da/El_Clear_Tic_Tac_Toe.webp/revision/latest' },
  ],
  results,
};
await writeJson('manifest.json', manifest);
