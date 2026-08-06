// 공식 "Eternal Return Fankit" 구글 드라이브 공개 폴더를 훑어 매니페스트를 만든다.
//
// 드라이브 API 는 계정이 한 번이라도 연 파일만 인덱싱해서 공개 폴더 목록이 비어 나온다.
// 반면 공개 폴더 웹 페이지에는 모든 자식의 id 와 이름이 들어 있으므로 그쪽을 훑는다.
// 파일 바이트는 받지 않는다 — 이미지는 lh3.googleusercontent.com/d/<id> 로 바로 열린다.
//
// 폴더 구조:
//   CharactER/001. Jackie/
//     01. Concept Art/          00. Jackie.png · 01. Jackie_Skin_01.png · …
//     02. Default/              Jackie_Full_00.png · Jackie_Half_00.png · Jackie_Mini_00.png
//     06. ExecutionER Jackie/   Jackie_Full_01.png · Jackie_Half_01.png · …
//   슬롯 번호(00, 01 …)가 스킨 폴더와 컨셉아트를 잇는다.
//
// 실행:  node scripts/data/build-er-fankit.mjs [out.json]
// 팬키트가 갱신될 때만 손으로 돌린다. 매일 도는 빌드에 넣을 성질이 아니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = '1bgW32L09YPpRgQKtH4C_TAd3Kr0N9Y90';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(process.argv[2] || path.join(here, 'er-fankit-art.json'));

// 일반 폴더 페이지(/drive/folders/…)는 50개에서 잘린다. embeddedfolderview 는 지연 로딩
// 없이 전체를 한 번에 렌더하므로 이쪽을 쓴다. 항목 한 건이 아래 모양으로 들어 있다.
//   <div class="flip-entry" id="entry-<ID>"> … <a href="…/folders/<ID>"|"…/file/d/<ID>/view">
//   … <div class="flip-entry-title">이름</div>
const ID = /id="entry-([a-zA-Z0-9_-]{10,})"/;
const HREF = /href="https:\/\/drive\.google\.com\/(drive\/folders|file\/d)\//;
const TITLE = /<div class="flip-entry-title">([^<]*)<\/div>/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
      if (response.ok) return response.text();
      if (attempt === tries - 1) throw new Error(`${response.status} ${url}`);
    } catch (error) {
      if (attempt === tries - 1) throw error;
    }
    await sleep(2 ** attempt * 1000);
  }
  throw new Error('unreachable');
}

/** 공개 폴더 한 곳의 자식 목록. */
async function listFolder(folderId) {
  const page = await get(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`);
  const out = [];
  const seen = new Set();
  // 항목 경계로 잘라 읽는다. 중첩 태그를 정규식으로 세는 것보다 훨씬 덜 부서진다.
  for (const block of page.split('<div class="flip-entry"').slice(1)) {
    const id = block.match(ID)?.[1];
    const name = decodeEntities(block.match(TITLE)?.[1] || '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ name, id, isFolder: block.match(HREF)?.[1] === 'drive/folders' });
  }
  return out;
}

// 드라이브 페이지는 이름을 HTML 이스케이프해서 넣는다. 그대로 두면 'Debi &amp; Marlene' 같은
// 이름이 게임 쪽 'Debi & Marlene' 과 영영 매칭되지 않는다.
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

const stripIndex = (name) => name.replace(/^\d+\.\s*/, '').trim();

// 팬키트에는 파일명 규칙이 세 가지 섞여 있다. 하나만 보면 캐릭터가 통째로 빠지므로
// (실제로 그렇게 16명이 누락됐다) 전부 받는다.
//   Celine_Full_00.png   — 종류가 가운데
//   Full_Bihyung_00.png  — 종류가 앞 (최근 실험체)
//   Yuki_Cadet_Full.png  — 종류가 뒤, 슬롯 번호 없음 (랭크 보상)
const isKind = (fileName, kind) => new RegExp(`(?:^|_)${kind}(?:_|\\.)`, 'i').test(fileName);
const slotOf = (fileName) => fileName.match(/(?:^|_)(?:Full|Half|Mini)_(?:.*_)?(\d+)\./i)?.[1]
  ?? fileName.match(/^(\d+)\./)?.[1];

// 스킨이 아닌 자료 폴더. 이름에 'icon' 이 들어간 스킨('Unemployed Icon Jenny')까지
// 잘라내지 않도록 폴더명 전체로 판정한다.
const SECTION_DIR = /^(concept\s*art|skill\s*icon|skill|voice\s*line|icon)$/i;

// 실험체가 아니라 스킨 한 종류가 캐릭터 폴더처럼 들어가 있는 자리.
const RANKED_REWARD = /^Cadet\s*\(Ranked Reward\)$/i;

console.log('팬키트 CharactER 폴더를 훑는 중…');
const root = await listFolder(ROOT);
const charactER = root.find((entry) => entry.isFolder && /^charact/i.test(entry.name));
if (!charactER) throw new Error('CharactER 폴더를 찾지 못했습니다 (팬키트 구조가 바뀌었을 수 있습니다)');

const characters = (await listFolder(charactER.id)).filter((entry) => entry.isFolder);
console.log(`캐릭터 폴더 ${characters.length}개`);

const manifest = [];
const emptyCharacters = [];
for (const [index, characterDir] of characters.entries()) {
  const character = stripIndex(characterDir.name);
  await sleep(250);
  let sections;
  try {
    sections = await listFolder(characterDir.id);
  } catch (error) {
    console.warn(`  !! ${character}: ${error.message}`);
    continue;
  }

  // 랭크 보상 Cadet 은 캐릭터가 아니라 스킨 한 종류다. 하위가 '<시즌> - <캐릭터>' 라
  // 캐릭터를 폴더명에서 읽어 group='Cadet' 으로 편다. 컨셉아트도 폴더 안에 같이 있다.
  if (RANKED_REWARD.test(character)) {
    let got = 0;
    for (const seasonDir of sections.filter((s) => s.isFolder)) {
      const who = seasonDir.name.split(/\s+-\s+/).pop()?.trim();
      if (!who) continue;
      await sleep(250);
      let files;
      try {
        files = await listFolder(seasonDir.id);
      } catch (error) {
        console.warn(`  !! ${character}/${seasonDir.name}: ${error.message}`);
        continue;
      }
      const full = files.find((f) => !f.isFolder && isKind(f.name, 'Full'));
      const half = files.find((f) => !f.isFolder && isKind(f.name, 'Half'));
      const concept = files.find((f) => !f.isFolder && /concept/i.test(f.name));
      if (!full && !half) continue;
      manifest.push({
        character: who,
        skinName: 'Cadet',
        group: 'Cadet',
        slot: 'cadet',
        ...(full ? { fullId: full.id } : {}),
        ...(half ? { halfId: half.id } : {}),
        ...(concept ? { conceptId: concept.id } : {}),
      });
      got += 1;
    }
    console.log(`  [${index + 1}/${characters.length}] ${character}: 시즌 ${sections.filter((s) => s.isFolder).length}개 → ${got}건`);
    if (!got) emptyCharacters.push(character);
    continue;
  }

  // 컨셉아트는 한 폴더에 슬롯별로 모여 있다. 먼저 색인한다.
  const conceptDir = sections.find((s) => s.isFolder && /concept/i.test(s.name));
  const conceptBySlot = new Map();
  if (conceptDir) {
    await sleep(250);
    for (const file of await listFolder(conceptDir.id)) {
      const slot = slotOf(file.name);
      if (slot) conceptBySlot.set(slot, file.id);
    }
  }

  // 스킨 폴더: Default 와 '<스킨명> <캐릭터>' 형태. 아이콘·스킬·음성은 건너뛴다.
  const skinDirs = sections.filter((s) => s.isFolder
    && !SECTION_DIR.test(stripIndex(s.name)));
  for (const skinDir of skinDirs) {
    await sleep(250);
    let files;
    try {
      files = await listFolder(skinDir.id);
    } catch (error) {
      console.warn(`  !! ${character}/${skinDir.name}: ${error.message}`);
      continue;
    }
    const full = files.find((f) => isKind(f.name, 'Full'));
    const half = files.find((f) => isKind(f.name, 'Half'));
    if (!full && !half) continue;

    const slot = slotOf(full?.name || half.name) || '00';
    const label = stripIndex(skinDir.name);
    // 폴더명은 '<스킨명> <캐릭터>' 라 캐릭터 접미사를 떼면 우리 스킨 group 과 맞는다.
    const skinName = /^default$/i.test(label)
      ? '기본'
      : label.replace(new RegExp(`\\s*${character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim() || label;

    manifest.push({
      character,
      skinName: label,
      group: skinName,
      slot,
      ...(full ? { fullId: full.id } : {}),
      ...(half ? { halfId: half.id } : {}),
      ...(conceptBySlot.has(slot) ? { conceptId: conceptBySlot.get(slot) } : {}),
    });
  }
  // 폴더는 있는데 한 건도 못 건진 캐릭터는 파일명 규칙이 또 바뀐 것이다.
  // 예전에 이게 조용히 지나가서 최근 캐릭터 16명이 통째로 빠졌으므로 눈에 띄게 남긴다.
  const got = manifest.filter((row) => row.character === character).length;
  if (!got) emptyCharacters.push(character);
  console.log(`  [${index + 1}/${characters.length}] ${character}: 폴더 ${skinDirs.length}개 → ${got}건${got ? '' : '  ← 수집 0'}`);
}

if (emptyCharacters.length) {
  console.warn(`\n!! 수집 0건인 캐릭터 ${emptyCharacters.length}명: ${emptyCharacters.join(', ')}`);
  console.warn('   팬키트 파일명 규칙이 바뀌었을 수 있습니다. isKind/slotOf 를 확인하세요.');
}

manifest.sort((a, b) => a.character.localeCompare(b.character) || a.slot.localeCompare(b.slot));
await fs.writeFile(dest, `${JSON.stringify(manifest, null, 1)}\n`, 'utf8');
console.log(`\n캐릭터 ${new Set(manifest.map((row) => row.character)).size}명 / 스킨 ${manifest.length}건 → ${dest}`);
