// 벽람항로 — AzurAPI (공개 GitHub 데이터셋)
//
// 함선 인격이 전부 여성이라 별도 성별 필터가 필요 없다 (registry 의 genderFilter: 'not-needed').
// 스킨이 함선당 여러 개라 전체 스킨 뷰를 켠다.
import { fetchJson, slug } from './shared.mjs';

const SHIPS = 'https://raw.githubusercontent.com/AzurAPI/azurapi-js-setup/master/ships.json';

// 주요 진영만 한국어로 옮기고, 콜라보 진영은 원문을 그대로 둔다.
// 다른 게임은 기본 일러를 '기본'으로 표시한다. 스킨 이름도 같은 결로 맞춘다.
// 이벤트 스킨명은 공식 명칭이라 원문을 그대로 둔다.
const SKIN_KO = { Default: '기본', Retrofit: '개장' };
const skinLabel = (name) => SKIN_KO[name] || name;
const isBaseSkin = (name) => name === 'Default';

const NATION_KO = {
  'Sakura Empire': '사쿠라',
  'Eagle Union': '백응',
  'Royal Navy': '로열',
  'Iron Blood': '철혈',
  'Sardegna Empire': '사르데냐',
  'Northern Parliament': '북방연합',
  'Dragon Empery': '동방',
  'Vichya Dominion': '비시아',
  'Iris Libre': '자유 아이리스',
  Tempesta: '템페스타',
  Universal: '유니버설',
};

/**
 * AzurAPI 의 id 는 '082' 같은 숫자 문자열이지만 'Collab021', 'Plan018' 처럼 접두사가
 * 붙은 것도 49건 있다. 출시일 정보가 없으므로 이 id 를 정렬 키로 삼되, 숫자가 아닌
 * 것은 뒤로 보낸다.
 */
function orderKey(id, index) {
  const numeric = Number(id);
  return Number.isFinite(numeric) ? numeric * 100 + index : 900000 + index;
}

// 같은 한국어 이름을 쓰는 함선이 있다(콜라보판, 개장 전후, 연구함 등). 목록에서
// 구분되도록 겹칠 때만 꼬리표를 붙인다. 진영 → 영문명 → 원본 id 순으로 시도해
// 가장 알아보기 쉬운 것을 고른다.
function disambiguate(characters) {
  const groups = new Map();
  for (const character of characters) {
    const label = character.names.ko || character.names.en;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(character);
  }
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const candidates = [
      (character) => ` · ${character.group}`,
      (character) => ` (${character.names.en})`,
      (character) => ` · ${character.sourceId}`,
    ];
    const pick = candidates.find((suffixOf) => {
      const seen = new Set(list.map((character) => suffixOf(character)));
      return seen.size === list.length;
    }) || candidates.at(-1);
    for (const character of list) {
      const suffix = pick(character);
      if (character.names.ko) character.names.ko += suffix;
      else character.names.en += suffix;
    }
  }
  return characters;
}

export default async function buildAzurLane() {
  const data = await fetchJson(SHIPS, { timeout: 120000 });
  const ships = Object.values(data).filter((ship) => ship?.id && ship.names?.en);

  const characters = [];
  const skins = [];

  for (const ship of ships) {
    const id = slug('al', ship.id);
    const names = {
      en: ship.names.en,
      ko: ship.names.kr || undefined,
      ja: ship.names.jp || undefined,
    };
    const sourceUrl = ship.wikiUrl;
    const shipSkins = (ship.skins || []).filter((skin) => skin?.image);
    if (!shipSkins.length) continue;

    characters.push({
      id,
      sourceId: ship.id,
      names,
      group: NATION_KO[ship.nationality] || ship.nationality || '기타',
      profileImage: ship.thumbnail,
      sourceUrl,
      images: shipSkins.map((skin) => ({
        url: skin.image,
        group: skinLabel(skin.name),
        type: isBaseSkin(skin.name) ? '기본' : '의상',
        sourceType: isBaseSkin(skin.name) ? 'official_standing' : 'official_skin',
        sourceUrl,
      })),
    });

    shipSkins.forEach((skin, index) => {
      skins.push({
        id: slug('al-skin', `${ship.id}-${skin.name}`),
        characterId: id,
        character: { id, names },
        skinName: skinLabel(skin.name),
        group: skinLabel(skin.name),
        url: skin.image,
        sourceUrl,
        sourceType: isBaseSkin(skin.name) ? 'official_standing' : 'official_skin',
        additionOrder: orderKey(ship.id, index),
      });
    });
  }

  if (characters.length < 300) {
    throw new Error(`Azur Lane roster is unexpectedly small (${characters.length})`);
  }
  if (skins.length < 800) {
    throw new Error(`Azur Lane skin catalog is unexpectedly small (${skins.length})`);
  }

  disambiguate(characters);
  // 이름을 고친 뒤 스킨 쪽 사본에도 반영하고, 임시 필드는 지운다.
  const namesById = new Map(characters.map((character) => [character.id, character.names]));
  for (const skin of skins) skin.character = { id: skin.characterId, names: namesById.get(skin.characterId) };
  for (const character of characters) delete character.sourceId;

  characters.sort((a, b) => (
    (a.group || '').localeCompare(b.group || '', 'ko')
    || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko')
  ));

  return { characters, skins };
}
