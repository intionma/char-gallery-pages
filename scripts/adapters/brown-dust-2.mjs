// 브라운더스트 2 — 커뮤니티가 공개한 두 저장소를 짝지어 만든다.
//
// 이 게임에는 다른 게임 같은 "공개 위키 API"가 없다. 최대 커뮤니티 위키인
// browndust2.miraheze.org 는 Cloudflare 봇 차단(403)에 막혀 있고, 공식 사이트는
// 언어별 경로가 S3 403 이라 캐릭터 목록을 주지 않는다. 그래서 raw.githubusercontent.com
// 에 있는 공개 저장소 두 개를 출처로 쓴다. 둘 다 MIT 이고 지금도 갱신된다.
//
//   메타데이터: bruhnn/BD2ModManager  — 코스튬 197건. 한국어 이름과 실제 출시일을 준다.
//   이미지:     Zormolo/Brown-Dust-2-Assets — 게임에서 추출한 UI 아트.
//
// == 왜 256px 인가 ==
// BD2 의 큰 전신 아트(`illust_charXXXXXX_NNN`)는 게임 CDN 의 Unity AssetBundle 안에
// 있어서 `<img src>` 로 걸 수 있는 주소가 아니다. 꺼내려면 카탈로그를 해독해 번들을 받고
// UnityPy 로 푼 다음 이미지를 저장해야 하는데, 이 저장소는 이미지를 저장하지 않는다.
// 공개 URL 로 바로 걸 수 있는 정지 아트는 게임이 UI 에 쓰는 256×256 이 전부다.
// 대형 아트가 공개 저장소에 올라오면 IMAGE_BASE 아래 경로만 바꾸면 된다.
import { slug, fetchJson, filterLiveImages } from './shared.mjs';

const META_URL = 'https://raw.githubusercontent.com/bruhnn/BD2ModManager/main/src-tauri/data/characters.json';
const META_SOURCE = 'https://github.com/bruhnn/BD2ModManager/blob/main/src-tauri/data/characters.json';
const ASSET_REPO = 'Zormolo/Brown-Dust-2-Assets';
const IMAGE_BASE = `https://raw.githubusercontent.com/${ASSET_REPO}/main/assets/ui`;
const ASSET_SOURCE = `https://github.com/${ASSET_REPO}/blob/main/assets/ui`;

// 메타데이터의 `costume_id` 는 26건에서 실제 애셋 번호와 다르다(모드 식별자 쪽을 가리킨다).
// 파일 이름 `illust_inven_char101103_150.png` 에 박힌 번호가 진짜 애셋 번호이고,
// 이미지 저장소는 뒤의 일련번호를 떼고 `illust_inven_char101103.png` 로 보관한다.
const ASSET_ID = /^illust_inven_char(\d+)_\d+\.png$/;

// 인기순은 enrich 가 Danbooru `*_(brown_dust)` 태그로 붙인다. 84명 중 41명만 잡히는데,
// 대부분은 실제로 게시물이 20건(BOORU_TAG_MIN_POSTS) 미만이라 정상이다. 콜라보 캐릭터는
// Danbooru 가 원작 판권으로 묶어서 BD2 태그가 아예 없다 — 원작 인기를 BD2 인기로 세면
// 안 되므로 그대로 둔다. 이름이 어긋나 놓치는 건 다리안 하나뿐이다
// (Danbooru 는 성까지 붙인 `darian_silverstein`, 게임 표기는 `Darian`).
const ELEMENT_KO = {
  fire: '불', water: '물', wind: '바람', light: '빛', dark: '어둠',
};
// skin_type 은 코스튬의 종류다. 전체 스킨 뷰의 "종류" 필터가 이 값으로 갈린다.
const SKIN_TYPE_KO = {
  normal: '코스튬', prestige: '프레스티지', special: '스페셜',
};

function costumeArt(assetId) {
  return {
    main: `${IMAGE_BASE}/costume_face/illust_inven_char${assetId}.png`,
    skill: `${IMAGE_BASE}/costume_skill_face/illust_skill_char${assetId}.png`,
    source: `${ASSET_SOURCE}/costume_face/illust_inven_char${assetId}.png`,
  };
}

/** 출시일(한국 시각 기준)을 정렬 키로 바꾼다. 전 항목이 실제 날짜를 갖는다. */
function releaseOrder(date) {
  return Date.parse(`${date}T00:00:00+09:00`);
}

export default async function buildBrownDust2() {
  const meta = await fetchJson(META_URL);
  const rows = (meta.characters || []).map((entry) => {
    const match = ASSET_ID.exec(String(entry.character_image || ''));
    if (!match) return null;
    const assetId = match[1];
    const art = costumeArt(assetId);
    return {
      assetId,
      characterKey: entry.character_id,
      characterNames: {
        ko: entry.character_name?.kr || undefined,
        en: entry.character_name?.en || entry.character || undefined,
        ja: entry.character_name?.jp || undefined,
      },
      costumeName: entry.costume_name?.kr || entry.costume_name?.en || entry.costume,
      element: entry.element,
      skinType: SKIN_TYPE_KO[entry.skin_type] || SKIN_TYPE_KO.normal,
      releasedAt: entry.release_date,
      ...art,
    };
  }).filter(Boolean);

  if (rows.length < 150) {
    throw new Error(`Brown Dust 2 costume list is unexpectedly small (${rows.length})`);
  }

  // 대표 아트가 없는 코스튬은 카드가 통째로 깨진다. 죽은 URL 판정은 shared 쪽이
  // 보수적으로 한다 — 확실한 404 만 빼고, 호스트 장애면 예외를 던진다.
  const withMain = await filterLiveImages(
    rows.map((row) => ({ url: row.main, row })),
    'brown-dust-2 costume art',
  );
  const live = withMain.map((entry) => entry.row);

  // 스킬 컷인은 같은 코스튬의 다른 구도다. 없는 코스튬은 대표 아트 한 장만 갖는다.
  const withSkill = new Set((await filterLiveImages(
    live.map((row) => ({ url: row.skill, row })),
    'brown-dust-2 skill art',
  )).map((entry) => entry.row.assetId));

  const characters = new Map();
  for (const row of live) {
    if (!characters.has(row.characterKey)) {
      characters.set(row.characterKey, {
        id: slug('bd2', row.characterNames.en),
        names: row.characterNames,
        group: ELEMENT_KO[row.element] || '기타',
        // 읽을 수 있는 캐릭터 문서가 없는 게임이라(위키가 Cloudflare 로 막혀 있다)
        // 이름·출시일이 실제로 적힌 데이터 파일을 캐릭터 출처로 남긴다.
        // 이미지 쪽 출처는 아래에서 파일 페이지를 따로 붙인다.
        sourceUrl: META_SOURCE,
        profileImage: row.main,
        releasedAt: row.releasedAt,
        releaseOrder: releaseOrder(row.releasedAt),
        images: [],
        costumes: [],
      });
    }
    characters.get(row.characterKey).costumes.push(row);
  }

  const skins = [];
  for (const character of characters.values()) {
    // 캐릭터가 처음 나온 코스튬이 그 캐릭터의 기본 복장이다. 같은 날 여러 벌이 나오면
    // 애셋 번호가 작은 쪽을 앞에 둔다.
    character.costumes.sort((a, b) => (
      a.releasedAt.localeCompare(b.releasedAt) || a.assetId.localeCompare(b.assetId)
    ));
    const base = character.costumes[0];
    character.profileImage = base.main;
    character.releasedAt = base.releasedAt;
    character.releaseOrder = releaseOrder(base.releasedAt);

    for (const row of character.costumes) {
      const isBase = row === base;
      const sourceType = isBase ? 'official_standing' : 'official_skin';
      const variants = withSkill.has(row.assetId)
        ? [{ difficulty: '일러스트', url: row.main }, { difficulty: '스킬 컷인', url: row.skill }]
        : undefined;

      character.images.push({
        url: row.main,
        width: 256,
        height: 256,
        group: row.costumeName,
        type: isBase ? '기본' : '의상',
        sourceType,
        sourceUrl: row.source,
        ...(variants ? { variants } : {}),
      });

      skins.push({
        id: slug('bd2-skin', row.assetId),
        characterId: character.id,
        character: { id: character.id, names: character.names },
        skinName: row.costumeName,
        group: row.costumeName,
        imageType: row.skinType,
        url: row.main,
        sourceUrl: row.source,
        sourceType,
        releasedAt: row.releasedAt,
        // 원본이 실제 출시일을 전부 준다. 최초 관측 시각으로 덮지 않도록 releasedAt 을
        // 함께 남긴다(enrich 의 applyFirstSeenSkinOrder 가 그걸 보고 비켜난다).
        additionOrder: releaseOrder(row.releasedAt),
        ...(variants ? { variants } : {}),
      });
    }
    delete character.costumes;
  }

  const roster = [...characters.values()].sort((a, b) => (
    a.releaseOrder - b.releaseOrder || a.names.en.localeCompare(b.names.en, 'en')
  ));

  if (roster.length < 60) {
    throw new Error(`Brown Dust 2 roster is unexpectedly small (${roster.length})`);
  }

  return {
    characters: roster,
    skins,
    sortMetadata: {
      release: { available: true, source: 'bd2modmanager', matched: roster.length, total: roster.length },
    },
  };
}
