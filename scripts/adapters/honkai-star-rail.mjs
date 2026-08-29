// 붕괴: 스타레일 — Project Amber (원신과 같은 제공자)
//
// 원신은 avatar.bodyType(GIRL/LADY/LOLI)으로 여성 캐릭터를 걸러내지만, 스타레일은
// 어떤 공개 소스에도 성별 필드가 없다. Amber 목록·상세, StarRailRes 모두 확인했다.
// 오너 결정에 따라 필터 없이 전원을 담는다 (registry 의 genderFilter: 'none').
import { fetchJson, slug, wikiThumb, wikiPageUrl, normalizeTitle } from './shared.mjs';

const AMBER = 'https://sr.yatta.moe';

// 목록 그룹은 전투 속성으로 나눈다. 원신이 원소로 나누는 것과 같은 결이다.
const ELEMENT_KO = {
  Ice: '얼음',
  Wind: '바람',
  Fire: '불',
  Imaginary: '허수',
  Thunder: '번개',
  Quantum: '양자',
  Physical: '물리',
};

// 개척자는 5개 운명 × 남녀로 10건, 3월 7일은 2건이 같은 이름을 쓴다. 목록에서 구분이
// 안 되므로 이름이 겹칠 때만 운명을 덧붙이고, 그래도 겹치면 성별을 덧붙인다.
// (Amber 의 개척자 id 는 홀수가 남성, 짝수가 여성이다.)
const PATH_KO = {
  Warrior: '파멸',
  Knight: '보존',
  Shaman: '화합',
  Memory: '기억',
  Elation: '환락',
  Rogue: '공허',
  Mage: '지혜',
  Warlock: '허무',
  Priest: '풍요',
};

function disambiguate(characters) {
  const byLabel = new Map();
  for (const character of characters) {
    const label = character.names.ko || character.names.en;
    byLabel.set(label, (byLabel.get(label) || 0) + 1);
  }
  const stillColliding = new Map();
  for (const character of characters) {
    const label = character.names.ko || character.names.en;
    if (byLabel.get(label) < 2) continue;
    const path = PATH_KO[character.pathType] || character.pathType;
    const next = `${label} · ${path}`;
    stillColliding.set(next, (stillColliding.get(next) || 0) + 1);
  }
  for (const character of characters) {
    const label = character.names.ko || character.names.en;
    if (byLabel.get(label) < 2) continue;
    const path = PATH_KO[character.pathType] || character.pathType;
    let suffix = ` · ${path}`;
    if (stillColliding.get(`${label}${suffix}`) > 1) {
      suffix += Number(character.sourceId) % 2 === 0 ? '(여)' : '(남)';
    }
    if (character.names.ko) character.names.ko += suffix;
    else character.names.en += suffix;
  }
  return characters;
}

/** 일본어 이름에 붙는 루비 마크업을 걷어낸다. 예: {RUBY_B#みつき}三月{RUBY_E#}なのか */
function stripRuby(value) {
  return cleanName(String(value || '').replace(/\{RUBY_[BE]#[^}]*\}/g, ''));
}

/** 원본 이름에 마크업이 섞여 나온다. 예: Silver Wolf LV.<unbreak>999</unbreak> */
function cleanName(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || undefined;
}

function archiveUrl(id, route) {
  return `${AMBER}/en/archive/avatar/${id}/${route || ''}`;
}

const WIKI = 'honkai-star-rail.fandom.com';

/**
 * 위키에서 캐릭터 아트를 끌어온다.
 *
 * Amber 는 캐릭터당 그림이 large/medium/round 세 벌뿐이고 셋 다 같은 그림이라,
 * 스타레일만 캐릭터당 이미지가 1.0장으로 갤러리에서 제일 얇았다. 위키에는
 * 뽑기 일러(Splash Art)·인게임 모델(Game)·소개 일러(Introduction)가 따로 있다.
 *
 * 파일명 규칙: `Character <이름> <종류>.png`. 이름에 ` • `가 들어가면 두 가지가
 * 섞여 있다 — `단항 • 음월`처럼 별도 캐릭터인 경우와 `아벤츄린 • 웨이브플레어`처럼
 * 의상인 경우다. Amber 에 같은 이름의 캐릭터가 있으면 그쪽에 붙이고, 없으면
 * 앞부분을 기준 캐릭터로 보고 의상으로 붙인다.
 */
// 위키는 개척자·삼칠이를 운명(과 성별)까지 붙여 부른다.
//   Trailblazer (F) Destruction · March 7th (Preservation)
// Amber 는 둘 다 그냥 'Trailblazer' / 'March 7th' 라서 이름만으로는 못 찾는다.
const PATH_EN = {
  Warrior: 'Destruction', Knight: 'Preservation', Shaman: 'Harmony', Memory: 'Remembrance',
  Elation: 'Elation', Rogue: 'The Hunt', Mage: 'Erudition', Warlock: 'Nihility', Priest: 'Abundance',
};

/** 위키에서 찾아볼 이름 후보. 앞에서부터 먼저 걸리는 것을 쓴다. */
function wikiNameCandidates(character) {
  const en = character.names.en;
  const path = PATH_EN[character.pathType];
  if (!path) return [en];
  // Amber 의 개척자 id 는 홀수가 남성, 짝수가 여성이다.
  const gender = Number(character.sourceId) % 2 === 0 ? 'F' : 'M';
  return [
    en,
    `${en} (${gender}) ${path}`,
    `${en} (${gender}) (${path})`,
    `${en} (${path})`,
    `${en} ${path}`,
  ];
}

const ART_KINDS = [
  ['Splash Art', '일러스트', 'official_misc'],
  ['Game', '인게임 모델', 'official_misc'],
  ['Introduction', '소개 일러', 'official_misc'],
];

async function wikiCharacterArt() {
  const files = [];
  let cont;
  let guard = 0;
  do {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', list: 'allimages',
      aiprefix: 'Character ', ailimit: '500', aiprop: 'url|size|timestamp', origin: '*',
    });
    if (cont) params.set('aicontinue', cont);
    const data = await fetchJson(`https://${WIKI}/api.php?${params}`);
    files.push(...(data.query?.allimages || []));
    cont = data.continue?.aicontinue;
    guard += 1;
  } while (cont && guard < 12);

  // 이름 → { 종류 → 파일 }
  const byName = new Map();
  for (const file of files) {
    const name = String(file.name || '').replace(/_/g, ' ');
    const match = name.match(/^Character (.+?) (Splash Art|Game|Introduction)\.(?:png|jpg|jpeg|webp)$/i);
    if (!match || !file.url) continue;
    const key = normalizeTitle(match[1]);
    const kind = match[2];
    const slotted = byName.get(key) || {};
    // 같은 종류가 여러 번 올라온 경우 큰 쪽(원본)을 남긴다.
    if (!slotted[kind] || Number(file.size || 0) > Number(slotted[kind].size || 0)) {
      slotted[kind] = { url: file.url, size: file.size, title: match[1] };
    }
    byName.set(key, slotted);
  }
  return byName;
}

function artImages(entry, displayName, { costumeOf } = {}) {
  return ART_KINDS.flatMap(([kind, label, sourceType]) => {
    const file = entry?.[kind];
    if (!file) return [];
    const group = costumeOf ? `${costumeOf} · ${label}` : label;
    return [{
      url: file.url,
      thumbUrl: wikiThumb(file.url, 400),
      group,
      type: costumeOf ? '의상' : label,
      sourceType: costumeOf ? 'official_skin' : sourceType,
      sourceUrl: wikiPageUrl(WIKI, displayName),
    }];
  });
}

export default async function buildHonkaiStarRail() {
  const [enData, koData, jaData] = await Promise.all([
    fetchJson(`${AMBER}/api/v2/en/avatar`),
    fetchJson(`${AMBER}/api/v2/kr/avatar`),
    fetchJson(`${AMBER}/api/v2/jp/avatar`),
  ]);
  const en = enData.data?.items || {};
  const ko = koData.data?.items || {};
  const ja = jaData.data?.items || {};

  const characters = Object.entries(en).flatMap(([id, avatar]) => {
    if (!avatar?.icon) return [];
    const route = avatar.route;
    const sourceUrl = archiveUrl(id, route);
    // large 는 3MB 급 풀 일러라 라이트박스 전용으로 두고, 목록에는 medium 을 쓴다.
    const full = `${AMBER}/hsr/assets/UI/avatar/large/${id}.png`;
    const medium = `${AMBER}/hsr/assets/UI/avatar/medium/${id}.png`;
    return [{
      id: slug('hsr', id),
      sourceId: id,
      pathType: avatar.types?.pathType,
      names: { en: cleanName(avatar.name), ko: cleanName(ko[id]?.name), ja: stripRuby(ja[id]?.name) },
      group: ELEMENT_KO[avatar.types?.combatType] || avatar.types?.combatType || '기타',
      profileImage: `${AMBER}/hsr/assets/UI/avatar/round/${id}.png`,
      sourceUrl,
      // 초 단위 출시 시각을 그대로 정렬 키로 쓴다.
      releaseOrder: Number.isFinite(Number(avatar.release)) ? Number(avatar.release) : undefined,
      // 전체 일러 뷰가 "최신 추가순"을 만들 때 쓰는 날짜. releaseOrder 와 같은 값이다.
      releasedAt: Number(avatar.release) > 0
        ? new Date(Number(avatar.release) * 1000).toISOString().slice(0, 10)
        : undefined,
      images: [{
        url: full,
        thumbUrl: medium,
        group: '기본',
        type: '기본',
        sourceType: 'official_standing',
        sourceUrl,
        trimTransparent: true,
      }],
    }];
  });

  if (characters.length < 40) {
    throw new Error(`Honkai: Star Rail roster is unexpectedly small (${characters.length})`);
  }

  // 위키 아트를 얹는다. 위키가 죽어도 Amber 스탠딩은 남아야 하므로 실패해도 넘어간다.
  try {
    const art = await wikiCharacterArt();
    const amberNames = new Set(characters.flatMap((character) => wikiNameCandidates(character).map(normalizeTitle)));
    const used = new Set();
    let added = 0;
    for (const character of characters) {
      const candidates = wikiNameCandidates(character).map(normalizeTitle);
      const key = candidates.find((candidate) => art.has(candidate) && !used.has(candidate));
      if (!key) continue;
      used.add(key);
      const images = artImages(art.get(key), art.get(key)['Splash Art']?.title || character.names.en);
      character.images.push(...images);
      added += images.length;
    }
    // 이름에 ` • `가 붙은 항목 중 Amber 에 같은 이름이 없으면 의상이다. 앞부분 캐릭터에 붙인다.
    const byKey = new Map(characters.map((character) => [normalizeTitle(character.names.en), character]));
    let costumes = 0;
    for (const [key, entry] of art) {
      if (used.has(key) || amberNames.has(key) || !key.includes('•')) continue;
      const base = normalizeTitle(key.split('•')[0].trim());
      const owner = byKey.get(base);
      if (!owner) continue;
      const title = entry['Splash Art']?.title || entry.Game?.title || entry.Introduction?.title || '';
      const costume = title.split('•').slice(1).join('•').trim() || '의상';
      const images = artImages(entry, title, { costumeOf: costume });
      owner.images.push(...images);
      costumes += images.length;
      added += images.length;
    }
    const missing = characters.filter((character) => character.images.length <= 1);
    console.log(`Honkai: Star Rail wiki art: ${added} image(s) added (의상 ${costumes}), `
      + `${characters.length - missing.length}/${characters.length} characters enriched`);
    if (missing.length) {
      console.log(`  위키 아트를 못 찾은 캐릭터 ${missing.length}명: `
        + missing.slice(0, 12).map((character) => character.names.en).join(', '));
    }
  } catch (error) {
    console.log(`::warning title=스타레일 위키 아트 실패::${error.message} — Amber 스탠딩만 씁니다`);
  }

  disambiguate(characters);
  // 임시 필드는 결과 JSON 에 남기지 않는다.
  for (const character of characters) {
    delete character.sourceId;
    delete character.pathType;
  }

  const withOrder = characters.filter((character) => Number.isFinite(character.releaseOrder));
  characters.sort((a, b) => (
    (a.group || '').localeCompare(b.group || '', 'ko')
    || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko')
  ));

  return {
    characters,
    sortMetadata: {
      release: {
        available: withOrder.length > 0,
        source: 'project-amber',
        matched: withOrder.length,
      },
    },
  };
}
