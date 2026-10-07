import fs from 'node:fs/promises';
import { filterLiveImages as filterLive, mapLimited, additionOrderOf } from './adapters/shared.mjs';
import { buildBooruPopularityScores } from './sort-utils.mjs';

// 이 값을 넘으면 epoch ms(실제 시각), 아니면 순번이다.
const REAL_TIME_FLOOR = 1e12;
import { GAMES, gameById } from './games/registry.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.argv[2] || 'dist/data');
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';
// test. 서브도메인은 2026-08 기준 DNS가 사라졌다. 같은 경로를 apex 가 그대로 서빙한다.
const BLUE_UTILS = 'https://blue-utils.me';
const DANBOORU = 'https://danbooru.donmai.us';
const FXTWITTER = 'https://api.fxtwitter.com';
const BA_SWIMSUIT_TWEET_ID = '2081344804974403832';
const BA_SWIMSUIT_TWEET = `https://x.com/Blue_ArchiveJP/status/${BA_SWIMSUIT_TWEET_ID}`;
const SKIP_REMOTE = process.env.CG_SKIP_REMOTE === '1';

// 로고는 레지스트리가 관리한다. 게임을 추가할 때 이 파일을 고칠 일이 없어야 한다.

const ANNOUNCED_ART = new Map([
  ['ba-announced-makoto_swimsuit', {
    url: 'https://img.game8.jp/12807219/2124ff62677c3b63dcce7991da067e9b.webp/original',
    sourceUrl: 'https://game8.jp/blue-archive/801832',
  }],
  ['ba-announced-satsuki_swimsuit', {
    url: 'https://img.game8.jp/12807459/e9f98cb31cea866885324f19f2612b39.webp/original',
    sourceUrl: 'https://game8.jp/blue-archive/801835',
  }],
  ['ba-announced-chiaki_swimsuit', {
    url: 'https://img.game8.jp/12811183/ce0c08c98431e64478470878ed1e8b11.webp/original',
    sourceUrl: 'https://game8.jp/blue-archive/801830',
  }],
  ['ba-announced-ibuki_swimsuit', {
    url: 'https://appmedia.jp/wp-content/uploads/2026/07/210318_6q5jz.webp',
    sourceUrl: BA_SWIMSUIT_TWEET,
    tweetPhotoIndex: 0,
  }],
  ['ba-announced-iroha_swimsuit', {
    url: 'https://appmedia.jp/wp-content/uploads/2026/07/210317_u8d7r.webp',
    sourceUrl: BA_SWIMSUIT_TWEET,
    tweetPhotoIndex: 1,
  }],
]);

const DJMAX_CHARACTERS = [
  {
    en: 'EL CLEAR', ko: '엘 클리어', tag: 'clear_(djmax)', pageUrl: 'https://djmax.fandom.com/wiki/El_Clear',
    profileImage: 'https://static.wikia.nocookie.net/djmax/images/d/da/El_Clear_Tic_Tac_Toe.webp/revision/latest',
    official: [{
      url: 'https://static.wikia.nocookie.net/djmax/images/d/da/El_Clear_Tic_Tac_Toe.webp/revision/latest',
      width: 1000, height: 1033, group: '공식 일러', sourceUrl: 'https://djmax.fandom.com/wiki/El_Clear',
    }],
  },
  {
    en: 'EL FAIL', ko: '엘 페일', tag: 'fail_(djmax)', pageUrl: 'https://djmax.fandom.com/wiki/El_Fail',
    profileImage: 'https://static.wikia.nocookie.net/djmax/images/e/e6/El_Fail_Tic_Tac_Toe.webp/revision/latest',
    official: [{
      url: 'https://static.wikia.nocookie.net/djmax/images/e/e6/El_Fail_Tic_Tac_Toe.webp/revision/latest',
      width: 1000, height: 1027, group: '공식 일러', sourceUrl: 'https://djmax.fandom.com/wiki/El_Fail',
    }],
  },
  {
    en: 'LENA', ko: '레나', tag: 'lena_(djmax)', pageUrl: 'https://djmax.fandom.com/wiki/Lena',
    profileImage: 'https://static.wikia.nocookie.net/djmax/images/b/b9/Lena.png/revision/latest',
    official: [{
      url: 'https://static.wikia.nocookie.net/djmax/images/b/b9/Lena.png/revision/latest',
      width: 1000, height: 611, group: '공식 일러', sourceUrl: 'https://djmax.fandom.com/wiki/Lena',
    }],
  },
  {
    en: 'PLAY', ko: '플레이', tag: 'play_(djmax)', pageUrl: 'https://djmax.fandom.com/wiki/Play',
    profileImage: 'https://cdn.donmai.us/original/9c/db/9cdbf7784a7ad9e2676faa2b84c1e239.png', official: [],
  },
  {
    en: 'DIEIN', ko: '다인', tag: 'diein_(djmax)', pageUrl: 'https://djmax.fandom.com/wiki/Diein',
    profileImage: 'https://cdn.donmai.us/original/2d/77/2d77fcaf4845817d7327f882af8fd4a5.jpg', official: [],
  },
];

async function readJson(name) {
  return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));
}

async function writeJson(name, value) {
  await fs.writeFile(path.join(dataDir, name), JSON.stringify(value), 'utf8');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json,*/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

// 메모리얼 URL은 SchaleDB PathName 으로 규칙 조합해 만든다. Blue Utils 가 모든 의상의
// 메모리얼 로비를 갖고 있지는 않아서, 실제로 존재하는 것만 남기지 않으면 깨진 카드가 남는다.
// 존재 확인과 동시성 제한은 어댑터 공용 모듈에 한 벌만 둔다.
async function filterLiveImages(images, label) {
  return filterLive(images, label, { skip: SKIP_REMOTE });
}

function slug(prefix, value) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function studentPath(image) {
  try {
    const url = new URL(image.sourceUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.at(-2) !== 'student') return '';
    return decodeURIComponent(parts.at(-1) || '').toLowerCase();
  } catch {
    return '';
  }
}

function memorialImage(image) {
  const pathName = studentPath(image);
  if (!pathName) return null;
  const original = `${BLUE_UTILS}/static/img/memorylobby/original/${pathName}.webp`;
  return {
    url: original,
    thumbUrl: `${BLUE_UTILS}/static/img/memorylobby/thumbnail/${pathName}.jpg`,
    width: 1920,
    height: 1080,
    group: `${image.group || '기본'} 메모리얼`,
    type: '메모리얼',
    sourceType: 'official_misc',
    sourceUrl: original,
    // 메모리얼은 그 자체의 출시일이 없다. 어느 의상에 딸린 것인지만 남겨 두면
    // 나중에 그 의상의 순서를 그대로 물려받을 수 있다.
    parentGroup: image.group || '기본',
  };
}

async function resolveAnnouncedArt() {
  const resolved = new Map([...ANNOUNCED_ART].map(([id, art]) => [id, { ...art }]));
  if (SKIP_REMOTE) return resolved;
  try {
    const payload = await fetchJson(`${FXTWITTER}/Blue_ArchiveJP/status/${BA_SWIMSUIT_TWEET_ID}`);
    const tweet = payload.tweet || payload.status;
    const photos = tweet?.media?.photos || [];
    for (const [id, art] of resolved) {
      if (!Number.isInteger(art.tweetPhotoIndex)) continue;
      const photo = photos[art.tweetPhotoIndex];
      if (!photo?.url) continue;
      resolved.set(id, {
        ...art,
        url: photo.url,
        width: photo.width,
        height: photo.height,
        sourceUrl: tweet.url || BA_SWIMSUIT_TWEET,
      });
      console.log(`Blue Archive announced art ${id}: ${photo.url}`);
    }
  } catch (error) {
    console.warn(`Blue Archive official swimsuit tweet refresh skipped: ${error.message}`);
  }
  return resolved;
}

async function enrichBlueArchive() {
  const data = await readJson('blue-archive.json');
  const charactersById = new Map((data.characters || []).map((character) => [character.id, character]));
  const announcedArt = await resolveAnnouncedArt();

  const candidateMemorials = [];
  for (const character of data.characters || []) {
    const standing = (character.images || []).filter((image) => image?.url && image.type !== '메모리얼');
    const memorials = standing.map(memorialImage).filter(Boolean);
    candidateMemorials.push(...memorials);
    character.images = [...standing.map(({ thumbUrl: _thumbUrl, ...image }) => image), ...memorials];
  }

  // 존재하지 않는 메모리얼은 제거한다. 규칙 조합이 전면적으로 어긋난 경우(대량 소실)는
  // 원본 장애일 가능성이 높으므로 조용히 비우지 않고 빌드를 실패시킨다.
  const liveMemorials = new Set((await filterLiveImages(candidateMemorials, 'Blue Archive memorial')).map((image) => image.url));
  if (!SKIP_REMOTE) {
    const kept = liveMemorials.size;
    if (candidateMemorials.length && kept < candidateMemorials.length * 0.5) {
      throw new Error(`Blue Archive memorial URLs mostly unreachable (${kept}/${candidateMemorials.length})`);
    }
    for (const character of data.characters || []) {
      character.images = (character.images || [])
        .filter((image) => image.type !== '메모리얼' || liveMemorials.has(image.url));
    }
  }

  // 예고 아트는 출시 전까지 자리를 메우는 임시 그림이다. 출시되면 원본에 진짜
  // 전신(투명 배경)이 생기는데, 그때도 계속 덮어쓰면 홍보 카드·가로 배너가 전신을
  // 가린다. 실제로 다섯 명이 출시된 뒤에도 홍보 이미지가 카드로 걸려 있었다.
  // upcoming 은 build-blue-archive-skins 가 원본의 출시 여부로 매긴 값이다.
  const released = [];
  for (const skin of data.skins || []) {
    const announced = announcedArt.get(skin.id);
    if (!announced) continue;
    if (!skin.upcoming) {
      released.push(skin.id);
      continue;
    }
    skin.url = announced.url;
    skin.thumbUrl = announced.url;
    skin.sourceUrl = announced.sourceUrl;
    skin.temporaryArt = true;

    const character = charactersById.get(skin.characterId);
    if (!character) continue;
    const image = {
      url: announced.url,
      group: skin.skinName || skin.group || '수영복',
      type: '의상',
      sourceType: 'official_skin',
      sourceUrl: announced.sourceUrl,
      width: announced.width,
      height: announced.height,
      temporaryArt: true,
    };
    if (!(character.images || []).some((entry) => entry.url === image.url)) character.images.push(image);
  }

  // 콜라보 학생처럼 Blue Utils 에 메모리얼 로비가 아예 없는 캐릭터가 있어서 전원 보유를
  // 요구할 수는 없다. 대신 대다수가 유지되는지로 원본 장애를 감지한다.
  const total = (data.characters || []).length;
  const memorialCharacters = (data.characters || []).filter((character) =>
    (character.images || []).some((image) => image.type === '메모리얼'));
  console.log(`Blue Archive memorial coverage: ${memorialCharacters.length}/${total} characters`);
  if (total && memorialCharacters.length < total * 0.9) {
    throw new Error(`Blue Archive memorial coverage is incomplete (${memorialCharacters.length}/${total})`);
  }
  // 메모리얼을 전체 스킨 뷰에도 올린다. 그동안 캐릭터 상세에만 있어서 246장이
  // 목록에서 아예 안 보였다. 자기 출시일은 없지만 어느 의상에 딸린 것인지는 알기
  // 때문에, 그 의상의 순서를 물려받으면 같은 줄에 세울 수 있다.
  const skinOrderByKey = new Map();
  for (const skin of data.skins || []) {
    skinOrderByKey.set(`${skin.characterId}:${skin.group}`, skin);
  }
  const memorialSkins = [];
  for (const character of data.characters || []) {
    for (const image of character.images || []) {
      if (image.type !== '메모리얼') continue;
      const parent = skinOrderByKey.get(`${character.id}:${image.parentGroup}`);
      // 부모 의상을 못 찾으면 줄 세울 근거가 없다. 그런 건 올리지 않는다.
      if (!parent) continue;
      memorialSkins.push({
        id: `${parent.id}-memorial`,
        characterId: character.id,
        character: parent.character,
        skinName: image.group,
        group: image.group,
        imageType: '메모리얼',
        url: image.url,
        thumbUrl: image.thumbUrl,
        sourceUrl: image.sourceUrl,
        sourceType: image.sourceType || 'official_misc',
        ...(parent.releaseDate ? { releaseDate: parent.releaseDate } : {}),
        // 부모보다 아주 조금 뒤로 놓아 같은 의상끼리 붙어 보이게 한다.
        // 부모의 순서는 아래 지속 계층에서 확정되므로 거기서 다시 물려받는다.
        orderFrom: 'parent',
        parentId: parent.id,
        additionOrder: Number(parent.additionOrder) - 0.5,
      });
    }
  }
  if (memorialSkins.length) {
    // 기본 스탠딩과 의상을 나눠 볼 이유가 없다. 한 종류('스킨')로 묶고 메모리얼만 가른다.
    for (const skin of data.skins || []) if (!skin.imageType) skin.imageType = '스킨';
    data.skins = [...(data.skins || []), ...memorialSkins]
      .sort((a, b) => b.additionOrder - a.additionOrder || String(a.id).localeCompare(String(b.id)));
    console.log(`Blue Archive memorial: ${memorialSkins.length} added to the skin view (부모 의상 순서 상속)`);
  }

  // 아직 출시되지 않은 것만 예고 아트로 덮였어야 한다. 출시된 것은 원본 전신을 쓴다.
  const announcedIds = new Set(ANNOUNCED_ART.keys());
  const pending = (data.skins || []).filter((skin) => announcedIds.has(skin.id) && skin.upcoming);
  const replaced = (data.skins || []).filter((skin) => announcedIds.has(skin.id) && skin.temporaryArt);
  if (replaced.length !== pending.length) {
    throw new Error(`Blue Archive announced art coverage is incomplete (${replaced.length}/${pending.length})`);
  }
  if (released.length) {
    console.log(`Blue Archive announced art: ${released.length} released, now using official art (${released.join(', ')})`);
  }

  await writeJson('blue-archive.json', data);
  console.log(`Blue Archive enriched: ${data.characters?.length || 0} characters, ${data.skins?.length || 0} skins`);
}

function postToImage(post) {
  const extension = String(post.file_ext || '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return null;
  const url = post.large_file_url || post.file_url;
  if (!url) return null;
  const sourceUrl = post.source && /^https?:\/\//.test(post.source)
    ? post.source
    : `${DANBOORU}/posts/${post.id}`;
  return {
    url,
    thumbUrl: post.preview_file_url,
    width: post.image_width,
    height: post.image_height,
    group: '팬아트',
    type: '팬아트',
    sourceType: 'fanart',
    sourceUrl,
    artist: post.tag_string_artist?.split(' ').join(', ') || undefined,
    // 전체 일러 뷰의 "최신 추가순"이 기댈 유일한 실제 시각이다.
    releasedAt: /^\d{4}-\d{2}-\d{2}/.test(post.created_at || '') ? post.created_at.slice(0, 10) : undefined,
    score: post.score,
  };
}

async function djmaxFanart(tag) {
  if (SKIP_REMOTE) return [];
  const params = new URLSearchParams({ tags: `${tag} rating:general`, limit: '100' });
  const posts = await fetchJson(`${DANBOORU}/posts.json?${params}`);
  if (!Array.isArray(posts)) return [];
  return posts.map(postToImage).filter(Boolean);
}

async function enrichDjmax() {
  const previous = await readJson('djmax.json');
  const characters = [];
  for (const entry of DJMAX_CHARACTERS) {
    let fanart = [];
    try {
      fanart = await djmaxFanart(entry.tag);
    } catch (error) {
      console.warn(`DJMAX fanart refresh skipped for ${entry.en}: ${error.message}`);
    }
    const representative = {
      url: entry.profileImage,
      group: entry.official.length ? '대표 이미지' : '팬아트',
      type: entry.official.length ? '이미지' : '팬아트',
      sourceType: entry.official.length ? 'official_misc' : 'fanart',
      sourceUrl: entry.pageUrl,
    };
    const merged = [...entry.official.map((image) => ({
      ...image,
      type: '공식 이미지',
      sourceType: 'official_misc',
    })), ...(!entry.official.length ? [representative] : []), ...fanart];
    const seen = new Set();
    const images = merged.filter((image) => image.url && !seen.has(image.url) && seen.add(image.url));
    characters.push({
      id: slug('djmax', entry.en),
      names: { en: entry.en, ko: entry.ko },
      group: 'DJMAX',
      profileImage: entry.profileImage,
      sourceUrl: entry.pageUrl,
      booruTag: entry.tag,
      images: images.length ? images : [representative],
    });
  }
  const imageCount = characters.reduce((sum, character) => sum + character.images.length, 0);
  if (characters.length !== DJMAX_CHARACTERS.length) throw new Error(`DJMAX roster mismatch (${characters.length})`);
  if (!SKIP_REMOTE && imageCount <= DJMAX_CHARACTERS.length) {
    throw new Error(`DJMAX fanart enrichment returned too few images (${imageCount})`);
  }

  await writeJson('djmax.json', {
    ...previous,
    game: { id: 'djmax', name: 'DJMAX RESPECT V', description: '공식 이미지와 Danbooru 팬아트' },
    characters,
  });
  console.log(`DJMAX enriched: ${characters.length} characters, ${imageCount} images`);
}

// 원신 기본 일러는 아이콘 파일명을 치환해 URL을 조합한다. 별인형처럼 가챠 일러가 없는
// 더미 항목은 그 URL이 존재하지 않으므로, 확인해서 빈 캐릭터를 남기지 않는다.
async function pruneGenshinDeadArt() {
  if (SKIP_REMOTE) return;
  const data = await readJson('genshin.json');
  if (data.error) return;
  const before = (data.characters || []).length;
  for (const character of data.characters || []) {
    character.images = await filterLiveImages(character.images || [], `Genshin ${character.names?.ko || character.id}`);
  }
  data.characters = (data.characters || []).filter((character) => (character.images || []).length);
  const dropped = before - data.characters.length;

  // 캐릭터가 사라지면 전체 스킨 뷰에 고아 항목이 남으므로 함께 정리한다.
  if (Array.isArray(data.skins)) {
    const keptIds = new Set(data.characters.map((character) => character.id));
    const live = await filterLiveImages(
      data.skins.filter((skin) => keptIds.has(skin.characterId)),
      'Genshin skins',
    );
    const removedSkins = data.skins.length - live.length;
    if (removedSkins) console.log(`Genshin skins: dropped ${removedSkins} orphaned or missing entries`);
    data.skins = live;
  }

  if (before && data.characters.length < before * 0.9) {
    throw new Error(`Genshin character art mostly unreachable (${data.characters.length}/${before})`);
  }
  await writeJson('genshin.json', data);

  // 매니페스트의 건수는 실제 항목 수와 일치해야 검증을 통과한다.
  if (dropped) {
    const manifest = await readJson('manifest.json');
    const result = (manifest.results || []).find((entry) => entry.name === 'genshin.json');
    if (result) result.count = data.characters.length;
    await writeJson('manifest.json', manifest);
  }
  console.log(`Genshin art verified: ${data.characters.length}/${before} characters kept${dropped ? ` (${dropped} dropped)` : ''}`);
}

/**
 * 모든 게임에 공통으로 도는 정리 단계.
 *  - 캐릭터가 없는 스킨은 전체 스킨 뷰에서 눌러도 404 로 가므로 뺀다.
 *  - 이미지가 하나도 없는 캐릭터는 목록에 빈 카드로 남으므로 뺀다.
 * 소스가 서로 다른 경로로 만들어지는 게임(블루 아카이브·SDVX)에서 실제로 발생했다.
 */
async function pruneDanglingReferences() {
  for (const game of GAMES) {
    let data;
    try {
      data = await readJson(game.dataFile);
    } catch {
      continue;
    }
    if (data.error) continue;
    const characters = Array.isArray(data.characters) ? data.characters : [];
    const skins = Array.isArray(data.skins) ? data.skins : [];

    const withArt = characters.filter((character) => (character.images || []).length);
    const droppedCharacters = characters.length - withArt.length;

    const ids = new Set(withArt.map((character) => character.id));
    const linkedSkins = skins.filter((skin) => !skin.characterId || ids.has(skin.characterId));
    const droppedSkins = skins.length - linkedSkins.length;

    if (!droppedCharacters && !droppedSkins) continue;

    // 자켓 게임은 캐릭터가 부가 정보라 목록 건수를 매니페스트가 세지 않는다.
    if (characters.length) data.characters = withArt;
    if (skins.length) data.skins = linkedSkins;
    await writeJson(game.dataFile, data);

    if (game.collection === 'characters' && droppedCharacters) {
      const manifest = await readJson('manifest.json');
      const result = (manifest.results || []).find((entry) => entry.name === game.dataFile);
      if (result) result.count = withArt.length;
      await writeJson('manifest.json', manifest);
    }
    console.log(`${game.id}: pruned ${droppedCharacters} character(s) without art, ${droppedSkins} dangling skin(s)`);
  }
}

/**
 * 전체 스킨 뷰가 켜져 있는데 스킨 목록이 없는 게임은 캐릭터 이미지에서 만들어 준다.
 *
 * DJMAX·스타레일·SDVX 처럼 원본에 "스킨" 개념이 없는 게임도 같은 화면을 갖게 하는 게
 * 목적이다. 어댑터가 이미 스킨을 만들어 두면 손대지 않는다.
 */
async function ensureSkinCatalogs() {
  for (const game of GAMES) {
    if (!game.features?.skins) continue;
    const data = await readJson(game.dataFile);
    if (Array.isArray(data.skins) && data.skins.length) continue;

    const skins = [];
    (data.characters || []).forEach((character, characterIndex) => {
      const names = character.names;
      (character.images || []).forEach((image, index) => {
        if (!image.url) return;
        const label = image.group || image.type || '기본';
        skins.push({
          id: slug(`${game.id}-art`, `${character.id}-${index}`),
          characterId: character.id,
          character: { id: character.id, names },
          // 팬아트는 라벨이 전부 '팬아트'라 카드가 구분되지 않는다. 작가명을 붙인다.
          skinName: image.sourceType === 'fanart' && image.artist ? `${label} · ${image.artist}` : label,
          group: label,
          url: image.url,
          ...(image.thumbUrl ? { thumbUrl: image.thumbUrl } : {}),
          ...(image.artist ? { artist: image.artist } : {}),
          ...(image.variants ? { variants: image.variants } : {}),
          ...(image.releasedAt || character.releasedAt
            ? { releasedAt: image.releasedAt || character.releasedAt }
            : {}),
          sourceUrl: image.sourceUrl || character.sourceUrl,
          sourceType: image.sourceType || 'official_misc',
          additionOrder: additionOrderOf(
            image.releasedAt || character.releasedAt,
            characterIndex * 100 + index,
          ),
        });
      });
    });

    if (!skins.length) throw new Error(`${game.id}: 전체 스킨 뷰를 켰지만 만들 이미지가 없습니다`);
    skins.sort((a, b) => b.additionOrder - a.additionOrder || String(a.id).localeCompare(String(b.id)));
    data.skins = skins;
    await writeJson(game.dataFile, data);
    console.log(`${game.id}: derived ${skins.length} skin(s) from character art`);
  }
}

/**
 * "최신 추가순"이 실제로 최신순이 되게 한다.
 *
 * 원본이 출시일을 주지 않는 게임(벽람항로 등)은 정렬 키가 원본 나열 순서일 뿐이라
 * 새 항목이 위로 오지 않는다. 이미 배포된 데이터에 있던 항목은 그때의 키를 그대로
 * 유지하고, 처음 보는 항목에만 지금 시각을 준다. 그러면 나열 순서를 기준선으로 삼되
 * 새로 추가된 것은 항상 맨 위로 온다.
 *
 * 최초 배포이거나 원격을 못 읽으면 아무것도 바꾸지 않는다. 그러지 않으면 전체가
 * "방금 추가됨"이 되어 정렬이 통째로 무의미해진다.
 */
async function applyFirstSeenSkinOrder() {
  if (SKIP_REMOTE) return;
  const firstSeenAt = Date.now();
  for (const game of GAMES) {
    if (!game.features?.skins) continue;
    const data = await readJson(game.dataFile);
    const skins = Array.isArray(data.skins) ? data.skins : [];
    if (!skins.length) continue;

    let published;
    try {
      published = await fetchJson(`https://intionma.github.io/char-gallery-pages/data/${game.dataFile}`);
    } catch (error) {
      console.warn(`${game.id}: previous skin order unavailable (${error.message})`);
      continue;
    }
    const orders = new Map((published.skins || [])
      .filter((skin) => Number.isFinite(Number(skin.additionOrder)))
      .map((skin) => [skin.id, Number(skin.additionOrder)]));
    if (!orders.size) continue;

    let added = 0;
    let datedNew = 0;
    for (const skin of skins) {
      // 원본이 실제 날짜를 준 항목은 그 날짜가 진실이다. 최초 관측 시각은 어디까지나
      // 날짜를 모르는 항목의 대체값이지, 아는 날짜를 덮어쓸 근거가 아니다.
      if (skin.releasedAt) continue;
      // 부모에서 순서를 물려받는 항목(메모리얼)은 관측 시각으로 덮지 않는다. 덮으면
      // 전부 같은 값이 되어 목록 맨 위에 뭉친다.
      if (skin.orderFrom === 'parent') continue;
      const seen = orders.get(skin.id);
      // 순번은 실제 시각과 자릿수가 달라서 max 로 섞으면 옛 순번이 눌러앉는다.
      // 순번 기준을 바꿔도 반영되도록, 실제 시각일 때만 max 를 쓴다.
      // 순번은 0 부터 시작할 수 있다(SchaleDB DefaultOrder). || 로 받으면 0 이
      // 옛 값으로 새어 나가므로 유한한 숫자인지로 판단한다.
      const current = Number(skin.additionOrder);
      // 최초 관측 시각은 날짜를 모르는 항목(순번)의 대체값이다. 원본이 이미 실제 시각
      // (위키 업로드 시각 등)을 준 항목은 처음 봤더라도 그 시각을 쓴다. 그러지 않으면
      // 수집 규칙을 고쳐 예전부터 있던 그림을 새로 줍게 됐을 때 전부 "오늘 추가"로 찍혀
      // 최신순 맨 위를 덮는다(니케 별도 유닛 65장이 그 경우였다).
      const knownTime = Number.isFinite(current) && current > REAL_TIME_FLOOR ? current : undefined;
      const previous = seen ?? knownTime ?? firstSeenAt;
      if (seen == null) {
        if (knownTime == null) added += 1;
        else datedNew += 1;
      }
      skin.additionOrder = previous > REAL_TIME_FLOOR
        ? Math.max(Number.isFinite(current) ? current : 0, previous)
        : (Number.isFinite(current) ? current : previous);
    }
    // 부모가 확정된 뒤에 상속 항목을 다시 계산한다.
    const skinById = new Map(skins.map((skin) => [skin.id, skin]));
    for (const skin of skins) {
      if (skin.orderFrom !== 'parent' || !skin.parentId) continue;
      const parent = skinById.get(skin.parentId);
      if (parent) skin.additionOrder = Number(parent.additionOrder) - 0.5;
    }
    skins.sort((a, b) => b.additionOrder - a.additionOrder || String(a.id).localeCompare(String(b.id)));
    await writeJson(game.dataFile, data);
    if (added) console.log(`${game.id}: ${added} newly added skin(s) moved to the top`);
    if (datedNew) console.log(`${game.id}: ${datedNew} newly collected skin(s) kept at their own timestamp`);
  }
}

/**
 * 전체 스킨 뷰의 인기순 근거를 붙인다.
 *
 * 인기도는 캐릭터 단위다. Danbooru 의 캐릭터 태그 게시물 수를 쓰는데, 태그는
 * 의상별로 나뉘지 않고 캐릭터 하나에 붙기 때문이다. 그래서 한 캐릭터의 스킨들은
 * 같은 점수를 갖고 목록에서 서로 붙어 나온다.
 *
 * 근거를 못 찾은 게임은 그냥 넘어간다. 억지로 만들면 잘못된 순서가 된다 —
 * 화면 쪽도 점수가 있는 게임에서만 인기순을 띄운다.
 */
async function fetchBooruTags(suffix) {
  const tags = [];
  for (let page = 1; page <= 3; page += 1) {
    const url = new URL('https://danbooru.donmai.us/tags.json');
    url.searchParams.set('search[category]', '4');
    url.searchParams.set('search[name_matches]', `*_(${suffix})`);
    url.searchParams.set('search[hide_empty]', 'yes');
    url.searchParams.set('search[is_deprecated]', 'no');
    url.searchParams.set('search[order]', 'count');
    url.searchParams.set('limit', '1000');
    url.searchParams.set('page', String(page));
    const batch = await fetchJson(url.href);
    if (!Array.isArray(batch)) throw new Error('Danbooru 응답이 배열이 아닙니다');
    tags.push(...batch);
    if (batch.length < 1000) break;
  }
  if (!tags.length) throw new Error(`Danbooru 에 *_(${suffix}) 캐릭터 태그가 없습니다`);
  return tags;
}

async function applySkinPopularity() {
  for (const game of GAMES) {
    if (!game.features?.skins || !game.booruSuffix) continue;
    const data = await readJson(game.dataFile);
    const skins = Array.isArray(data.skins) ? data.skins : [];
    const characters = Array.isArray(data.characters) ? data.characters : [];
    if (!skins.length || !characters.length) continue;

    // 이미 캐릭터 점수를 가진 게임(블루 아카이브)은 그 값을 그대로 쓴다.
    let scores = new Map(characters
      .filter((character) => Number(character.popularityScore) > 0)
      .map((character) => [character.id, Number(character.popularityScore)]));
    if (!scores.size) {
      try {
        scores = buildBooruPopularityScores(characters, await fetchBooruTags(game.booruSuffix), game.booruSuffix);
      } catch (error) {
        console.log(`${game.id}: 인기순 근거 없음 — ${error.message}`);
        continue;
      }
    }
    const matched = [...scores.values()].filter((score) => score > 0).length;
    if (!matched) {
      console.log(`${game.id}: 인기순 근거 없음 — 태그가 캐릭터와 하나도 맞지 않습니다`);
      continue;
    }
    for (const character of characters) character.popularityScore = scores.get(character.id) || 0;
    for (const skin of skins) skin.popularity = scores.get(skin.characterId) || 0;
    data.sortMetadata = {
      ...(data.sortMetadata || {}),
      skinPopularity: { available: true, source: 'danbooru', matched, total: characters.length },
    };
    await writeJson(game.dataFile, data);
    console.log(`${game.id}: 인기순 근거 ${matched}/${characters.length} 캐릭터 (danbooru)`);
  }
}

async function restoreGameLogos() {

  const manifest = await readJson('manifest.json');
  manifest.games = (manifest.games || []).map((game) => ({
    ...game,
    coverImage: gameById.get(game.id)?.logoImage || game.coverImage,
  }));
  const missing = (manifest.games || []).filter((game) => !game.coverImage);
  if (missing.length) throw new Error(`Missing game logos: ${missing.map((game) => game.id).join(', ')}`);
  await writeJson('manifest.json', manifest);
  console.log('Game logos restored');
}

await enrichBlueArchive();
await enrichDjmax();
await pruneGenshinDeadArt();
await pruneDanglingReferences();
// 스킨 목록을 채운 뒤에 정렬 키를 잡아야 파생 스킨도 같은 규칙을 따른다.
await ensureSkinCatalogs();
await applyFirstSeenSkinOrder();
await applySkinPopularity();
await restoreGameLogos();