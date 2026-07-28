import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const VERIFIED_SKINS = [
  ['Haze', 'Royal Bunny', 'https://cdn.playeternalreturn.com/2026%2F01%2F21%2F1768966543937-Full_Haze_06.png', 'https://playeternalreturn.com/posts/news/3305?hl=en-US'],
  ['Justyna', 'Lucky Bunny', 'https://cdn.playeternalreturn.com/2026%2F01%2F28%2F1769569679441-Full_Justyna_02.png', 'https://playeternalreturn.com/posts/news/3327?hl=en-US'],
  ['Chiara', 'Gloomy Bunny', 'https://cdn.playeternalreturn.com/2026%2F01%2F28%2F1769588363985-image.webp', 'https://playeternalreturn.com/posts/news/3327?hl=en-US'],
  ['Mai', 'Fashionista Bunny', 'https://cdn.playeternalreturn.com/2026%2F01%2F28%2F1769569788200-Full_Mai_05.png', 'https://playeternalreturn.com/posts/news/3327?hl=en-US'],
  ['Abigail', 'Tropical Dimension', 'https://cdn.playeternalreturn.com/2025%2F08%2F06%2F1754459544423-Full_Abigail_03.png', 'https://playeternalreturn.com/posts/news/2915'],
  ['Leni', 'Daisybear Maid', 'https://cdn.playeternalreturn.com/2026%2F04%2F29%2F1777441917625-Full_Leni_003.png', 'https://playeternalreturn.com/posts/news/3530?hl=en-US'],
  ['Vanya', 'Birdie Maid', 'https://cdn.playeternalreturn.com/2026%2F04%2F29%2F1777441966716-Full_Vanya_04.png', 'https://playeternalreturn.com/posts/news/3530?hl=en-US'],
  ['Tia', 'Chipsneaky Maid', 'https://cdn.playeternalreturn.com/2026%2F04%2F29%2F1777441978717-Full_Tia_005.png', 'https://playeternalreturn.com/posts/news/3530?hl=en-US'],
  ['Hyejin', 'Pinkitty Maid', 'https://cdn.playeternalreturn.com/2026%2F04%2F29%2F1777441956597-Full_Hyejin_006.png', 'https://playeternalreturn.com/posts/news/3530?hl=en-US'],
  ['Jenny', 'Unemployed Icon', 'https://cdn.playeternalreturn.com/2026%2F05%2F13%2F1778650376598-Full_Jenny_04.png', 'https://playeternalreturn.com/posts/news/3572?hl=en-US'],
  ['Irem', 'Festive Neko', 'https://cdn.playeternalreturn.com/2026%2F05%2F27%2F1779859619042-Full_Irem_03.png', 'https://playeternalreturn.com/posts/news/3606?hl=en-US'],
  ['Celine', 'Berryblast Maid', 'https://cdn.playeternalreturn.com/2026%2F05%2F27%2F1779859660284-Full_Celine_05.png', 'https://playeternalreturn.com/posts/news/3606?hl=en-US'],
  ['Coraline', 'Lovely', 'https://cdn.playeternalreturn.com/2026%2F06%2F24%2F1782279219328-Full_Coraline_01.png', 'https://playeternalreturn.com/posts/news/3657?hl=en-US'],
  ['Rio', '3rd Anniversary', 'https://cdn.playeternalreturn.com/2026%2F07%2F08%2F1783487209177-Full_Rio_07.png', 'https://playeternalreturn.com/posts/news/3690?hl=en-US'],
  ['Hart', '3rd Anniversary', 'https://cdn.playeternalreturn.com/2026%2F07%2F08%2F1783487259465-Full_Hart_06.png', 'https://playeternalreturn.com/posts/news/3690?hl=en-US'],
  ['Bianca', 'Eternal Wraith', 'https://cdn.playeternalreturn.com/2026%2F06%2F29%2F1782717293079-Full_Bianca_05.png', 'https://playeternalreturn.com/posts/news/3671?hl=en-US'],
].map(([character, group, mainUrl, sourceUrl]) => ({ character, group, mainUrl, sourceUrl }));

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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
  VERIFIED_SKINS.map((skin) => [`${norm(skin.character)}:${norm(skin.group)}`, skin]),
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

pageData.characters.forEach((character, characterIndex) => {
  const en = character.names?.en || character.names?.ko || character.id;
  const images = Array.isArray(character.images) ? character.images : [];
  images.forEach((image, skinIndex) => {
    if (!image.url) return;
    const baseSkin = image.type === '기본';
    const skinName = baseSkin ? '기본' : image.group || '의상';
    const key = `${norm(en)}:${baseSkin ? '__base__' : norm(skinName)}`;
    const rawName = dakRawName.get(key) || (baseSkin ? en : `${skinName} ${en}`.trim());
    const verified = baseSkin ? undefined : verifiedByKey.get(`${norm(en)}:${norm(skinName)}`);
    const seededDate = releaseDate(en, skinName, baseSkin);
    const seededOrder = seededDate ? dateOrder(seededDate) : undefined;
    const verifiedOrder = verified ? dateFromUrl(verified.mainUrl) : undefined;
    const wikiOrder = uploadDates.get(norm(rawName));
    const fallbackOrder = dakOrder.get(key) ?? 1_000_000 + characterIndex * 100 + skinIndex;
    const id = `er-skin-${norm(character.id)}-${baseSkin ? 'base' : norm(skinName)}`;
    if (seen.has(id)) return;
    seen.add(id);
    skins.push({
      id,
      characterId: character.id,
      character: { id: character.id, names: character.names },
      skinName,
      group: skinName,
      url: verified?.mainUrl || image.url,
      sourceUrl: verified?.sourceUrl || image.sourceUrl || character.sourceUrl,
      sourceType: baseSkin ? 'official_standing' : 'official_skin',
      releasedAt: seededDate,
      additionOrder: seededOrder ?? verifiedOrder ?? wikiOrder ?? fallbackOrder,
    });
  });
});

for (const verified of VERIFIED_SKINS) {
  const character = pageData.characters.find((item) => norm(item.names?.en) === norm(verified.character));
  if (!character) continue;
  const id = `er-skin-${norm(character.id)}-${norm(verified.group)}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const seededDate = releaseDate(verified.character, verified.group, false);
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
