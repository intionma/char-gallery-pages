// 명일방주 — ArknightsGameData(YoStar) + Aceship 이미지
//
// 공식 데이터에 성별 필드는 없지만 핸드북 프로필 본문에 `[Gender] Female` 이 들어 있어
// 자동 판별이 된다 (registry 의 genderFilter: 'handbook').
import { fetchJson, slug, mapLimited, isMissingUrl } from './shared.mjs';

const GAME_DATA = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main';
// 전신 일러는 Aceship 이 화질이 가장 좋지만 최신 오퍼레이터가 빠져 있다(표본 14% 누락).
// 아이콘은 커버리지가 완전한 ArknightsGameResource 를 쓰고, 전신은 Aceship 을 쓰되
// 실제로 없는 것은 빌드에서 걸러낸다.
const IMAGES = 'https://raw.githubusercontent.com/Aceship/Arknight-Images/main';
const RESOURCE = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main';

// 'Lady' 는 여성으로 본다. 'Conviction'·'Unknown' 같은 장난·미상 값은 제외한다.
const FEMALE_VALUES = new Set(['female', 'lady']);

const PROFESSION_KO = {
  PIONEER: '선봉',
  WARRIOR: '전위',
  TANK: '중장',
  SNIPER: '저격',
  CASTER: '술사',
  MEDIC: '의료',
  SUPPORT: '보조',
  SPECIAL: '특수',
};

// 기본 의상은 skinName 이 비어 있어 전부 같은 이름이 된다. E0/정예화1/정예화2 아트가
// 따로 있으므로 portraitId 접미사로 구분한다. (_1 = 기본, _1+ = 정예화 1, _2 = 정예화 2)
const ELITE_SUFFIX_KO = { 1: '기본', '1+': '정예화 1', 2: '정예화 2' };

function defaultSkinLabel(portraitId) {
  const suffix = String(portraitId).split('_').pop();
  return ELITE_SUFFIX_KO[suffix] || '기본';
}

/** 핸드북 프로필 본문에서 [Gender] 값을 뽑는다. */
function genderOf(entry) {
  const story = (entry?.storyTextAudio || [])
    .flatMap((section) => (section.stories || []).map((item) => item.storyText || ''))
    .join('\n');
  return story.match(/\[Gender\]\s*([^\s\n\r]+)/i)?.[1]?.toLowerCase() || '';
}

// slug 는 영숫자가 아닌 문자를 지우기 때문에 '_1' 과 '_1+' 가 같은 id 로 뭉개진다.
// 구분되는 글자로 먼저 바꿔 둔다.
function skinIdOf(portraitId) {
  return slug('ak-skin', String(portraitId).replace(/\+/g, '-plus').replace(/#/g, '-s'));
}

/** portraitId 에는 '#' 과 '+' 가 들어간다. 경로에 그대로 못 쓰므로 인코딩한다. */
function acePortrait(portraitId) {
  return `${IMAGES}/characters/${encodeURIComponent(portraitId)}.png`;
}

/**
 * 대체 저장소의 소형 일러(90KB 급). 커버리지가 완전해서 두 가지로 쓴다.
 *  1) Aceship 에 아직 없는 최신 오퍼레이터의 대체본
 *  2) 목록·상세 카드 썸네일 (Aceship 원본은 1~5MB 라 카드에 직접 쓰기 어렵다)
 */
function resourcePortrait(portraitId) {
  return `${RESOURCE}/portrait/${encodeURIComponent(portraitId)}.png`;
}

export default async function buildArknights() {
  const [en, ko, handbook, skinTable] = await Promise.all([
    fetchJson(`${GAME_DATA}/en_US/gamedata/excel/character_table.json`, { timeout: 180000 }),
    fetchJson(`${GAME_DATA}/ko_KR/gamedata/excel/character_table.json`, { timeout: 180000 }),
    fetchJson(`${GAME_DATA}/en_US/gamedata/excel/handbook_info_table.json`, { timeout: 180000 }),
    fetchJson(`${GAME_DATA}/en_US/gamedata/excel/skin_table.json`, { timeout: 180000 }),
  ]);

  const handbookDict = handbook.handbookDict || {};
  const charSkins = skinTable.charSkins || {};

  // 스킨을 캐릭터별로 모아 둔다. 기본 의상은 skinName 이 비어 있어 그룹명을 쓴다.
  const skinsByChar = new Map();
  for (const skin of Object.values(charSkins)) {
    const charId = skin?.charId;
    const portraitId = skin?.portraitId;
    if (!charId || !portraitId) continue;
    if (!skinsByChar.has(charId)) skinsByChar.set(charId, []);
    const isDefault = !skin.displaySkin?.skinName;
    skinsByChar.get(charId).push({
      portraitId,
      name: isDefault ? defaultSkinLabel(portraitId) : skin.displaySkin.skinName,
      isDefault,
      sortOrder: Number(skin.displaySkin?.sortId ?? 0),
    });
  }

  const characters = [];
  const skins = [];

  for (const [charId, entry] of Object.entries(en)) {
    if (!charId.startsWith('char_')) continue;          // 토큰·함정 제외
    if (entry?.isNotObtainable) continue;               // 미획득 더미 제외
    if (!FEMALE_VALUES.has(genderOf(handbookDict[charId]))) continue;

    const list = (skinsByChar.get(charId) || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    if (!list.length) continue;

    const id = slug('ak', charId);
    const names = { en: entry.appellation || entry.name, ko: ko[charId]?.name || undefined };
    const sourceUrl = `https://arknights.wiki.gg/wiki/${encodeURIComponent(String(entry.appellation || entry.name).replace(/ /g, '_'))}`;

    characters.push({
      id,
      names,
      group: PROFESSION_KO[entry.profession] || entry.profession || '기타',
      profileImage: `${RESOURCE}/avatar/${encodeURIComponent(charId)}.png`,
      sourceUrl,
      images: list.map((skin) => ({
        url: acePortrait(skin.portraitId),
        thumbUrl: resourcePortrait(skin.portraitId),
        portraitId: skin.portraitId,
        group: skin.name,
        type: skin.isDefault ? '기본' : '의상',
        sourceType: skin.isDefault ? 'official_standing' : 'official_skin',
        sourceUrl,
      })),
    });

    list.forEach((skin, index) => {
      skins.push({
        id: skinIdOf(skin.portraitId),
        characterId: id,
        character: { id, names },
        skinName: skin.name,
        group: skin.name,
        url: acePortrait(skin.portraitId),
        thumbUrl: resourcePortrait(skin.portraitId),
        portraitId: skin.portraitId,
        sourceUrl,
        sourceType: skin.isDefault ? 'official_standing' : 'official_skin',
        additionOrder: skin.sortOrder * 1000 + index,
      });
    });
  }

  // Aceship 은 화질이 좋지만 최신 오퍼레이터가 빠져 있다. 없는 것만 대체본으로 바꾸고,
  // 양쪽 모두 없으면 그 이미지를 뺀다. 이미지가 하나도 남지 않은 오퍼레이터만 제외한다.
  const allImages = [...characters.flatMap((character) => character.images), ...skins];
  const aceUrls = [...new Set(allImages.map((image) => image.url))];
  const aceMissing = await mapLimited(aceUrls, 6, (url) => isMissingUrl(url));
  const missingAce = new Set(aceUrls.filter((_, index) => aceMissing[index]));

  const replacements = [...new Set(allImages
    .filter((image) => missingAce.has(image.url))
    .map((image) => resourcePortrait(image.portraitId)))];
  const replacementMissing = await mapLimited(replacements, 6, (url) => isMissingUrl(url));
  const usableReplacement = new Set(replacements.filter((_, index) => !replacementMissing[index]));

  let swapped = 0;
  let removed = 0;
  const resolve = (image) => {
    if (!missingAce.has(image.url)) return true;
    const alternative = resourcePortrait(image.portraitId);
    if (!usableReplacement.has(alternative)) return false;
    image.url = alternative;
    swapped += 1;
    return true;
  };

  for (const character of characters) {
    const before = character.images.length;
    character.images = character.images.filter(resolve);
    removed += before - character.images.length;
  }
  const keptSkins = skins.filter(resolve);
  skins.length = 0;
  skins.push(...keptSkins);
  for (const image of [...characters.flatMap((c) => c.images), ...skins]) delete image.portraitId;

  const kept = characters.filter((character) => character.images.length);
  const droppedCharacters = characters.length - kept.length;
  console.log(`Arknights art: ${swapped} swapped to the fallback source, ${removed} removed, ${droppedCharacters} operator(s) dropped`);
  characters.length = 0;
  characters.push(...kept);

  if (characters.length < 150) {
    throw new Error(`Arknights roster is unexpectedly small (${characters.length})`);
  }

  characters.sort((a, b) => (
    (a.group || '').localeCompare(b.group || '', 'ko')
    || (a.names.ko || a.names.en).localeCompare(b.names.ko || b.names.en, 'ko')
  ));

  return { characters, skins };
}
