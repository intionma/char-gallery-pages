// 사운드 볼텍스의 캐릭터 프로필 아트와 네메시스 크루 카드를 모아 매니페스트를 만든다.
//
// 자켓은 곡 그림이라 "이 캐릭터가 누구인지"를 보여주지 못한다. 공식 캐릭터 페이지의
// 일러스트가 사실상 프로필 사진이라 그것을 따로 모은다.
//
// 출처가 둘이다.
//   1) KONAMI 공식 (p.eagate.573.jp/game/sdvx/vi/chara/) — 캐릭터 대표 일러스트.
//      지연 로딩 속성에 원본 URL·이름·크기가 들어 있다.
//   2) Sound Voltex Wiki (Fandom) — 네메시스 크루 카드. 2017~18년 'PUR' 시절 것만
//      정리돼 있고 그 이후는 어디에도 공개돼 있지 않다. 확인한 범위는 아래와 같다.
//      공식 CDN·제너레이터 전 시리즈·공식 뉴스·보도자료·BEMANIwiki·Danbooru·아카이브
//      전부 뒤졌지만 뽑기 카드와 홍보 합성물뿐이었다. 새 출처가 생기면 EXTRA_CREW 에
//      한 줄씩 더하면 된다.
//
// 실행:  node scripts/data/build-sdvx-crew.mjs [out.json]
// 원본이 자주 바뀌지 않으므로 손으로 돌린다. 매일 도는 빌드에 넣을 성질이 아니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(process.argv[2] || path.join(here, 'sdvx-crew.json'));
// 버전마다 캐릭터 페이지가 따로 있고 실린 인원이 다르다. EXCEED GEAR 페이지에만
// 기대면 구버전에만 있는 캐릭터(원더풀 러브 짱 등)가 빠진다. 최신 버전을 먼저 두어
// 같은 캐릭터는 최신 그림이 대표가 되게 한다.
const CHARA_PAGES = [
  'https://p.eagate.573.jp/game/sdvx/vi/chara/index.html',
  'https://p.eagate.573.jp/game/sdvx/v/p/chara/index.html',
  'https://p.eagate.573.jp/game/sdvx/iv/p/chara/index.html',
  'https://p.eagate.573.jp/game/sdvx/iii/p/chara/index.html',
];
const WIKI = 'sdvx.fandom.com';
// 공식 사이트는 봇 UA 를 캡차로 돌려보낸다. 브라우저 UA 로 받는다.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const WIKI_UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (value) => String(value).replace(
  /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
  (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  },
);

async function get(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

/** 공식 캐릭터 페이지의 대표 일러스트. 버전별 페이지를 모두 훑는다. */
async function officialPortraits() {
  const rows = [];
  for (const page of CHARA_PAGES) {
    let html;
    try {
      html = await (await get(page, { 'User-Agent': BROWSER_UA, 'Accept-Language': 'ja' })).text();
    } catch (error) {
      console.warn(`  !! ${page}: ${error.message}`);
      continue;
    }
    const found = [...html.matchAll(/<img[^>]*class="chara_image"[^>]*>/g)].map((match) => {
      const tag = match[0];
      return {
        url: tag.match(/data-original="([^"]+)"/)?.[1] || tag.match(/src="(https[^"]+)"/)?.[1],
        name: decodeEntities(tag.match(/alt="([^"]*)"/)?.[1] || '').trim(),
        width: Number(tag.match(/width="(\d+)"/)?.[1]) || undefined,
        height: Number(tag.match(/height="(\d+)"/)?.[1]) || undefined,
      };
    }).filter((row) => row.url && row.name);
    console.log(`  ${page.replace('https://p.eagate.573.jp/game/sdvx/', '')} → ${found.length}건`);
    rows.push(...found);
  }
  if (rows.length < 40) throw new Error(`공식 캐릭터 일러스트가 너무 적습니다 (${rows.length}건) — 페이지 구조가 바뀌었을 수 있습니다`);
  // 같은 그림이 여러 페이지에 걸려 있다. 앞선(최신) 것을 남긴다.
  const seen = new Set();
  return rows.filter((row) => (seen.has(row.url) ? false : seen.add(row.url)));
}

/** 위키의 네메시스 크루 카드. 파일명 접미 'PUR' 이 크루 카드를 뜻한다. */
async function wikiCrew() {
  const all = [];
  let cont;
  do {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', list: 'allimages',
      ailimit: '500', aiprop: 'url|size|timestamp', origin: '*', ...(cont ? { aicontinue: cont } : {}),
    });
    const data = await (await get(`https://${WIKI}/api.php?${params}`, { 'User-Agent': WIKI_UA })).json();
    all.push(...(data.query?.allimages || []));
    cont = data.continue?.aicontinue;
  } while (cont);

  const isCard = (title) => /\bPUR\b/i.test(title);
  const isNavigator = (title) => /live\s*2d/i.test(title) && /navigator/i.test(title);
  return all
    .filter((file) => isCard(file.title) || isNavigator(file.title))
    // 크루 카드는 430x520 안팎이다. 규격을 크게 벗어나면 포스터·굿즈다.
    .filter((file) => isNavigator(file.title) || (file.width >= 400 && file.width <= 460))
    .map((file) => ({
      name: file.title.replace(/^File:/, '').replace(/\.\w+$/, '').replace(/\s*PUR.*$/i, '').trim(),
      url: file.url,
      width: file.width,
      height: file.height,
      addedAt: String(file.timestamp).slice(0, 10),
      kind: isNavigator(file.title) ? 'navigator' : 'card',
    }));
}

// 자동 매칭이 닿지 않는 이름. 공식 표기와 우리 캐릭터 이름이 아예 다른 경우만 적는다.
const PORTRAIT_ALIASES = new Map([
  ['シネマ', 'Chinema=Storia'],
  ['埴仁 虎子', 'Torako Hani'],
  ['広瀬川ミヤコ＆青葉城 晩翠', 'Miyako Hirosegawa'],
  ['フラウリン＆フラウリィ', 'Fluorine & Flowry'],
  ['天月エクサ＆ピコ軍曹', 'Exa Amatsuki & Sergeant Pico'],
  ['リリック・リシュナ', 'Lyric Rishuna'],
  ['冥道ユウキ', 'Yuuki Myodo'],
  ['井之上 千影', 'Chikage Inoue'],
  ['マキナ・苺ハートビート 製造型番 WAX-15HB-KG', 'Machina Mai Heartbeat'],
  ['ハルト=カプサイシン=スチプチサット', 'Halt=Capsaicin=Styptysat'],
  ['覚醒のジュワユース', 'Joyeuse Awakening'],
  ['氷雪ちゃん', 'Hiyuki-chan'],
  ['静かなる嵐のイノテンちゃん', 'Inoten-chan'],
  ['蒼＆雛＆桃', 'Hina, Ao, and Momo'],
]);

// 공식 파일명이 실제 캐릭터와 어긋나는 자리. 예를 들어 '샤토 로와르' 의 파일명이
// joyeuse.jpg 라 '각성 주와이외즈' 에 붙는다. 우리 캐릭터가 아닌 것만 여기 적는다.
const PORTRAIT_SKIP = new Set([
  'シャトー・ロワーレ',
]);

const ascii = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** 공식 표기에서 매칭에 쓸 후보를 뽑는다. 로마자 병기와 파일명이 실마리다. */
function portraitKeys(row) {
  const keys = new Set();
  const alias = PORTRAIT_ALIASES.get(row.name);
  if (alias) keys.add(ascii(alias));
  for (const chunk of row.name.match(/[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ0-9 ＆&'.\-]{2,}/g) || []) keys.add(ascii(chunk));
  keys.add(ascii(row.url.split('/').pop().replace(/\.\w+$/, '')));
  return [...keys].filter((key) => key.length >= 3);
}

const links = JSON.parse(await fs.readFile(path.join(here, 'sdvx-character-links.json'), 'utf8'));
const characters = links.characters || [];

console.log('공식 캐릭터 일러스트를 받는 중…');
const portraits = await officialPortraits();
console.log(`  ${portraits.length}건`);

console.log('위키 네메시스 크루를 받는 중…');
const crew = await wikiCrew();
console.log(`  ${crew.length}건 (카드 ${crew.filter((c) => c.kind === 'card').length} · 내비 ${crew.filter((c) => c.kind === 'navigator').length})`);

// 프로필 ↔ 캐릭터 연결
const words = (value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join('|');

/**
 * 부분 문자열만으로 붙이면 사고가 난다. 실제로 'わんだふるラヴちゃん' 의 파일명 love.jpg 가
 * 'Candy Lovesick Maltodextrin' 에 걸렸다. 겹치는 조각이 이름의 절반은 돼야 인정한다.
 */
function portraitMatches(key, name, nameWords, keyWords, nameTokens) {
  if (key === name) return true;
  if (keyWords && keyWords === nameWords) return true; // 'KINO ANZU' ↔ 'ANZU KINO'
  // 'kino' 는 'ANZU KINO' 의 한 단어라 인정하고, 'love' 는 'Lovesick' 의 조각일 뿐이라 뺀다.
  if (key.length >= 4 && nameTokens.includes(key)) return true;
  if (key.includes(name)) return name.length >= Math.max(5, key.length * 0.5);
  return false;
}

const unmatched = [];
for (const row of portraits) {
  if (PORTRAIT_SKIP.has(row.name)) { unmatched.push(row.name); continue; }
  const keys = portraitKeys(row);
  const rowWords = words(row.name.replace(/[^\x20-\x7e]/g, ' '));
  const match = characters.find((character) => {
    const name = ascii(character.name);
    if (name.length < 3) return false;
    const nameWords = words(character.name);
    const nameTokens = String(character.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return keys.some((key) => portraitMatches(key, name, nameWords, rowWords || undefined, nameTokens));
  });
  if (match) row.character = match.name;
  else unmatched.push(row.name);
}

// 크루 ↔ 캐릭터 연결. 카드 파일명이 '<스타일> <캐릭터>' 또는 '<캐릭터> <스타일>' 이라
// 어느 쪽이 길지 정해져 있지 않다. 양쪽으로 본다 — 우리 이름이 'Kanade Yamashina' 인데
// 카드가 'Kanade' 뿐인 경우가 많다.
for (const row of crew) {
  const key = ascii(row.name);
  // 'Hiyuki Swimsuit' 처럼 스타일이 붙으면 전체 비교로는 안 걸린다. 앞 단어도 본다.
  const head = ascii(row.name.split(/\s+/)[0]);
  const match = characters.find((character) => {
    const name = ascii(character.name);
    if (name.length < 4 || key.length < 4) return false;
    if (key.includes(name) || name.includes(key)) return true;
    return head.length >= 4 && (name.startsWith(head) || head.startsWith(name));
  });
  if (match) row.character = match.name;
}

const linked = portraits.filter((row) => row.character).length;
const crewLinked = crew.filter((row) => row.character).length;
console.log(`\n프로필 연결: ${linked}/${portraits.length}  (연결 안 된 이름 ${unmatched.length}개)`);
console.log(`크루 연결  : ${crewLinked}/${crew.length}`);
if (unmatched.length) {
  console.log('\n연결 안 된 공식 표기 — 우리 캐릭터면 PORTRAIT_ALIASES 에 추가하세요:');
  console.log(`  ${unmatched.join(' | ')}`);
}

const manifest = {
  source: {
    portraits: CHARA_PAGES[0],
    crew: `https://${WIKI}/wiki/Category:Characters`,
  },
  portraits: portraits.sort((a, b) => a.name.localeCompare(b.name)),
  crew: crew.sort((a, b) => a.name.localeCompare(b.name)),
};
await fs.writeFile(dest, `${JSON.stringify(manifest, null, 1)}\n`, 'utf8');
console.log(`\n프로필 ${portraits.length}건 / 크루 ${crew.length}건 → ${dest}`);
