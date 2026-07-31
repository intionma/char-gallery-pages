// 붕괴: 스타레일 — Project Amber (원신과 같은 제공자)
//
// 원신은 avatar.bodyType(GIRL/LADY/LOLI)으로 여성 캐릭터를 걸러내지만, 스타레일은
// 어떤 공개 소스에도 성별 필드가 없다. Amber 목록·상세, StarRailRes 모두 확인했다.
// 오너 결정에 따라 필터 없이 전원을 담는다 (registry 의 genderFilter: 'none').
import { fetchJson, slug } from './shared.mjs';

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
  return String(value || '').replace(/\{RUBY_[BE]#[^}]*\}/g, '').trim() || undefined;
}

function archiveUrl(id, route) {
  return `${AMBER}/en/archive/avatar/${id}/${route || ''}`;
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
      names: { en: avatar.name, ko: ko[id]?.name, ja: stripRuby(ja[id]?.name) },
      group: ELEMENT_KO[avatar.types?.combatType] || avatar.types?.combatType || '기타',
      profileImage: `${AMBER}/hsr/assets/UI/avatar/round/${id}.png`,
      sourceUrl,
      // 초 단위 출시 시각을 그대로 정렬 키로 쓴다.
      releaseOrder: Number.isFinite(Number(avatar.release)) ? Number(avatar.release) : undefined,
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
