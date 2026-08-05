import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const fileArg = args.find((arg) => !arg.startsWith('--')) || 'dist/data/eternal-return.json';
const file = path.resolve(root, fileArg);
const skipWiki = args.includes('--skip-wiki');
const skipDak = args.includes('--skip-dak');
const WIKI_HOST = 'eternalreturn.fandom.com';
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';
const PUBLISHED_DATA = 'https://intionma.github.io/char-gallery-pages/data/eternal-return.json';

const RELEASE_DATES = new Map([
  ['sissela:cadet', '2026-05-07'],
  ['laura:panther', '2026-04-02'],
  ['silvia:queen', '2026-04-02'],
  ['blair:fearlessrace', '2026-02-20'],
  ['lenore:musicteacher', '2026-02-05'],
  ['mirka:wildmaid', '2026-04-16'],
  ['leni:daisybearmaid', '2026-04-30'],
  ['bihyung:__base__', '2026-05-14'],
  ['jenny:unemployedicon', '2026-05-14'],
  ['irem:festiveneko', '2026-05-28'],
  ['celine:berryblastmaid', '2026-06-02'],
  ['coraline:lovely', '2026-06-25'],
  ['rio:3rdanniversary', '2026-07-09'],
  ['hart:3rdanniversary', '2026-07-09'],
  ['bianca:eternalwraith', '2026-07-23'],
  ['hart:3rdanniversaryhartvivace', '2026-07-23'],
  ['rio:3rdanniversaryriodolce', '2026-07-23'],
  ['rozzi:lumiadrift', '2026-07-28'],
]);

// 공식 뉴스·티저에서 확인한 스킨. 위키/DAK 이 아직 못 따라온 최신 스킨과,
// 스킨 하나에 딸린 컨셉아트·삼면도를 함께 담는다.
// 데이터는 scripts/data/er-verified-skins.json 이 단일 기준이다.
const VERIFIED_SKINS = JSON.parse(
  await fs.readFile(path.join(here, 'data/er-verified-skins.json'), 'utf8'),
);
// 대표 이미지가 없으면 카드가 빈 채로 나간다. 데이터를 손댈 때 조용히 깨지지 않게 여기서 막는다.
const brokenSeeds = VERIFIED_SKINS.filter((skin) => !skin.character || !skin.group || !skin.mainUrl);
if (brokenSeeds.length) {
  throw new Error(`ER verified skins missing character/group/mainUrl: ${
    brokenSeeds.map((skin) => `${skin.character || '?'}/${skin.group || '?'}`).join(', ')}`);
}

// 공식 팬키트(구글 드라이브 공개 폴더)의 전신·반신·컨셉 아트.
// 드라이브 파일 ID 는 lh3 직링으로 열 수 있어 서버 없이도 <img> 에 걸린다.
const FANKIT_ART = JSON.parse(
  await fs.readFile(path.join(here, 'data/er-fankit-art.json'), 'utf8'),
);
const driveUrl = (id) => (id ? `https://lh3.googleusercontent.com/d/${id}` : undefined);
// 팬키트 폴더명에 오타가 있는 것들. 원본이 고쳐지면 이 줄을 지우면 된다.
const FANKIT_ALIASES = new Map([
  ['blair:fealessrace', 'blair:fearlessrace'],
]);
const fankitByKey = new Map(
  FANKIT_ART.map((art) => {
    const key = `${normKey(art.character)}:${normKey(art.group)}`;
    return [FANKIT_ALIASES.get(key) || key, art];
  }),
);

/**
 * 스킨 한 건이 가진 여러 장의 아트를 라이트박스 변형 목록으로 만든다.
 *
 * 로드맵·티저는 스킨마다 키아트와 함께 컨셉아트·삼면도를 공개하고, 공식 팬키트는
 * 같은 스킨의 전신·반신·컨셉을 따로 배포한다. 카드 한 장 안에서 넘겨볼 수 있게
 * SDVX 난이도 스위처와 같은 variants 를 쓴다.
 * 대표 이미지와 주소가 같은 뷰는 같은 그림이 두 번 나오므로 뺀다.
 */
function skinViews(verified, mainUrl, fankit) {
  if (!verified && !fankit) return undefined;
  const views = [
    ['일러스트', mainUrl],
    ['컨셉아트', verified?.conceptUrl],
    ['삼면도', verified?.sheetUrl],
    ['팬키트 전신', driveUrl(fankit?.fullId)],
    ['팬키트 반신', driveUrl(fankit?.halfId)],
    ['팬키트 컨셉', driveUrl(fankit?.conceptId)],
  ];
  const seenUrls = new Set();
  const variants = [];
  for (const [difficulty, url] of views) {
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    variants.push({ difficulty, url });
  }
  return variants.length > 1 ? variants : undefined;
}

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 이름을 짝지을 때 쓰는 키. norm 과 달리 한글을 남긴다.
 *
 * norm 은 ASCII 영숫자만 남기므로 한글 스킨명은 통째로 빈 문자열이 된다. 그러면
 * '비형 컨셉아트' 같은 검증 항목이 그 캐릭터의 '기본' 스킨과 같은 키가 되어,
 * forceMain 이 실제 스탠딩을 컨셉아트로 덮어썼다. 매칭에는 반드시 이쪽을 쓴다.
 * (id 를 만들 때는 URL 안전한 ASCII 가 필요하므로 skinIdSuffix 를 쓴다.)
 */
function normKey(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * 스킨 id 의 뒷부분을 만든다.
 *
 * norm 은 ASCII 영숫자만 남기므로 한글 스킨명은 통째로 빈 문자열이 된다.
 * 시즌 12 스킨은 이름이 전부 한글이라 그대로 두면 같은 캐릭터의 스킨끼리,
 * 심하면 기본 스킨과도 id 가 겹친다. 비면 짧은 해시로 대신한다.
 */
function skinIdSuffix(group, baseSkin = false) {
  if (baseSkin || group === '기본') return 'base';
  const normalized = norm(group);
  if (normalized) return normalized;
  let hash = 0;
  for (const ch of String(group)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return `k${hash.toString(36)}`;
}

function dateOrder(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function releaseDate(character, skinName, baseSkin) {
  return RELEASE_DATES.get(`${norm(character)}:${baseSkin ? '__base__' : norm(skinName)}`);
}

function stripCharacterSuffix(skinName, characterName) {
  const escaped = String(characterName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(skinName).replace(new RegExp(`\\s+${escaped}\\s*$`, 'i'), '').trim();
}

function dateFromUrl(url) {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

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
    console.warn(`ER previous skin order unavailable: ${error.message}`);
    return { available: false, orders: new Map() };
  }
}

async function wikiUploadDates(rawNames) {
  if (skipWiki) return new Map();
  const out = new Map();
  const unique = [...new Set(rawNames.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const titles = unique.slice(i, i + 50).map((name) => `File:${name}.png`).join('|');
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
      iiprop: 'timestamp', redirects: '1', titles,
    });
    try {
      const data = await fetchJson(`https://${WIKI_HOST}/api.php?${params}`);
      for (const page of data.query?.pages || []) {
        const timestamp = page.imageinfo?.[0]?.timestamp;
        if (!timestamp) continue;
        const key = norm(page.title.replace(/^File:/i, '').replace(/\.(png|jpe?g|webp)$/i, ''));
        const parsed = Date.parse(timestamp);
        if (Number.isFinite(parsed)) out.set(key, parsed);
      }
    } catch (error) {
      console.warn(`ER wiki upload dates skipped for one batch: ${error.message}`);
    }
  }
  return out;
}

const pageData = JSON.parse(await fs.readFile(file, 'utf8'));
if (pageData.error) throw new Error('Eternal Return data build failed before skin catalog generation');
if (!Array.isArray(pageData.characters) || pageData.characters.length === 0) {
  throw new Error('Eternal Return character data is empty');
}
if (pageData.stale && Array.isArray(pageData.skins) && pageData.skins.length > 0) {
  console.log(`Eternal Return skins retained from published snapshot: ${pageData.skins.length}`);
  process.exit(0);
}
const previous = await previousAdditionOrders();
const firstSeenAt = Date.parse(pageData.generatedAt) || Date.now();

const verifiedByKey = new Map(
  VERIFIED_SKINS.map((skin) => [`${normKey(skin.character)}:${normKey(skin.group)}`, skin]),
);
const dakOrder = new Map();
const dakRawName = new Map();
if (!skipDak) {
  try {
    const dak = await fetchJson('https://er.dakgg.io/api/v1/data/characters?hl=en');
    (dak.characters || []).forEach((character, characterIndex) => {
      (character.skins || []).forEach((skin, skinIndex) => {
        const baseSkin = norm(skin.name) === norm(character.name);
        const label = baseSkin ? '__base__' : stripCharacterSuffix(skin.name, character.name) || skin.name;
        const key = `${norm(character.name)}:${baseSkin ? '__base__' : norm(label)}`;
        dakOrder.set(key, 1_000_000 + characterIndex * 100 + skinIndex);
        dakRawName.set(key, skin.name);
      });
    });
  } catch (error) {
    console.warn(`ER DAK catalogue order unavailable: ${error.message}`);
  }
}
const rawNames = pageData.characters.flatMap((character) => {
  const en = character.names?.en || '';
  return (character.images || []).map((image) => {
    const baseSkin = image.type === '기본';
    const key = `${norm(en)}:${baseSkin ? '__base__' : norm(image.group)}`;
    return dakRawName.get(key) || (baseSkin ? en : `${image.group} ${en}`.trim());
  });
});
const uploadDates = await wikiUploadDates(rawNames);
const skins = [];
const seen = new Set();
const overwrittenBases = [];

pageData.characters.forEach((character, characterIndex) => {
  const en = character.names?.en || character.names?.ko || character.id;
  const images = Array.isArray(character.images) ? character.images : [];
  images.forEach((image, skinIndex) => {
    if (!image.url) return;
    const baseSkin = image.type === '기본';
    const skinName = baseSkin ? '기본' : image.group || '의상';
    const key = `${norm(en)}:${baseSkin ? '__base__' : norm(skinName)}`;
    const rawName = dakRawName.get(key) || (baseSkin ? en : `${skinName} ${en}`.trim());
    const verified = verifiedByKey.get(`${normKey(en)}:${normKey(skinName)}`);
    const seededDate = releaseDate(en, skinName, baseSkin);
    const seededOrder = seededDate ? dateOrder(seededDate) : undefined;
    const verifiedOrder = verified ? dateFromUrl(verified.mainUrl) : undefined;
    const wikiOrder = uploadDates.get(norm(rawName));
    const fallbackOrder = dakOrder.get(key) ?? 1_000_000 + characterIndex * 100 + skinIndex;
    const id = `er-skin-${norm(character.id)}-${skinIdSuffix(skinName, baseSkin)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const fankit = fankitByKey.get(`${normKey(en)}:${normKey(skinName)}`);
    const variants = skinViews(verified, verified?.mainUrl || image.url, fankit);
    // 캐릭터 상세도 같은 아트를 봐야 한다. 전체 스킨 뷰와 그림이 어긋나면 안 된다.
    // 기본 스탠딩을 덮는 건 원본에 아직 그 캐릭터가 없을 때뿐이라야 한다. 잘못 짝지어지면
    // 실제 스탠딩이 컨셉아트로 바뀌어 버리므로 몇 건을 덮었는지 남긴다.
    if (verified?.forceMain && verified.mainUrl !== image.url) {
      if (baseSkin) overwrittenBases.push(`${en} ← ${verified.group}`);
      image.url = verified.mainUrl;
    }
    if (variants) image.variants = variants;
    skins.push({
      id,
      characterId: character.id,
      character: { id: character.id, names: character.names },
      skinName,
      group: skinName,
      url: verified?.mainUrl || image.url,
      sourceUrl: verified?.sourceUrl || image.sourceUrl || character.sourceUrl,
      sourceType: baseSkin ? 'official_standing' : 'official_skin',
      releasedAt: seededDate || verified?.releasedAt,
      ...(variants ? { variants } : {}),
      additionOrder: seededOrder ?? verifiedOrder ?? wikiOrder ?? fallbackOrder,
    });
  });
});

for (const verified of VERIFIED_SKINS) {
  const character = pageData.characters.find((item) => norm(item.names?.en) === norm(verified.character));
  if (!character) continue;
  const id = `er-skin-${norm(character.id)}-${skinIdSuffix(verified.group)}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const seededDate = releaseDate(verified.character, verified.group, false) || verified.releasedAt;
  const variants = skinViews(verified, verified.mainUrl, fankitByKey.get(`${normKey(verified.character)}:${normKey(verified.group)}`));
  // 원본에 아직 없는 스킨이라 캐릭터 이미지 목록에도 없다. 여기서 넣지 않으면
  // 전체 스킨 뷰에는 뜨는데 캐릭터 상세에는 없는 상태가 된다.
  character.images.push({
    url: verified.mainUrl,
    group: verified.group,
    type: '의상',
    sourceType: 'official_skin',
    sourceUrl: verified.sourceUrl,
    ...(variants ? { variants } : {}),
  });
  skins.push({
    id,
    characterId: character.id,
    character: { id: character.id, names: character.names },
    skinName: verified.group,
    group: verified.group,
    url: verified.mainUrl,
    sourceUrl: verified.sourceUrl,
    sourceType: 'official_skin',
    releasedAt: seededDate,
    ...(variants ? { variants } : {}),
    additionOrder: seededDate ? dateOrder(seededDate) : dateFromUrl(verified.mainUrl) ?? 1_000_000,
  });
}

if (previous.available) {
  for (const skin of skins) {
    const seen = previous.orders.get(skin.id);
    skin.additionOrder = Math.max(skin.additionOrder, seen ?? firstSeenAt);
  }
}
skins.sort((a, b) => b.additionOrder - a.additionOrder || a.id.localeCompare(b.id));
if (!skins.length) throw new Error('Eternal Return skin catalog is empty');
if (skins.some((skin) => !Number.isFinite(Number(skin.additionOrder)))) {
  throw new Error('Eternal Return skin catalog contains an invalid order');
}
pageData.skins = skins;
await fs.writeFile(file, JSON.stringify(pageData), 'utf8');
console.log(`Eternal Return skins generated: ${skins.length}`);
if (overwrittenBases.length) {
  console.log(`  기본 스탠딩을 검증 아트로 덮음: ${overwrittenBases.join(', ')}`);
}
