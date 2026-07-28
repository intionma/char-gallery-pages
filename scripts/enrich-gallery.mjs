import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.argv[2] || 'dist/data');
const UA = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';
const BLUE_UTILS = 'https://test.blue-utils.me';
const DANBOORU = 'https://danbooru.donmai.us';
const FXTWITTER = 'https://api.fxtwitter.com';
const BA_SWIMSUIT_TWEET_ID = '2081344804974403832';
const BA_SWIMSUIT_TWEET = `https://x.com/Blue_ArchiveJP/status/${BA_SWIMSUIT_TWEET_ID}`;
const SKIP_REMOTE = process.env.CG_SKIP_REMOTE === '1';

const LOGOS = {
  'blue-archive': 'https://static.wikia.nocookie.net/blue-archive/images/e/e6/Site-logo.png/revision/latest',
  'eternal-return': 'https://static.wikia.nocookie.net/blacksurvivaleternalreturn_gamepedia_en/images/e/e6/Site-logo.png/revision/latest',
  genshin: 'https://static.wikia.nocookie.net/gensin-impact/images/e/e6/Site-logo.png/revision/latest',
  'sound-voltex': 'https://static.wikia.nocookie.net/sound-voltex/images/e/e6/Site-logo.png/revision/latest',
  djmax: 'https://static.wikia.nocookie.net/djmax/images/e/e6/Site-logo.png/revision/latest',
};

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

  for (const character of data.characters || []) {
    const standing = (character.images || []).filter((image) => image?.url && image.type !== '메모리얼');
    const memorials = standing.map(memorialImage).filter(Boolean);
    character.images = [...standing.map(({ thumbUrl: _thumbUrl, ...image }) => image), ...memorials];
  }

  for (const skin of data.skins || []) {
    const announced = announcedArt.get(skin.id);
    if (!announced) continue;
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

  const memorialCharacters = (data.characters || []).filter((character) =>
    (character.images || []).some((image) => image.type === '메모리얼'));
  if (memorialCharacters.length !== (data.characters || []).length) {
    throw new Error(`Blue Archive memorial coverage is incomplete (${memorialCharacters.length}/${data.characters?.length || 0})`);
  }
  const announcedIds = new Set(ANNOUNCED_ART.keys());
  const replaced = (data.skins || []).filter((skin) => announcedIds.has(skin.id) && skin.temporaryArt);
  if (replaced.length !== ANNOUNCED_ART.size) {
    throw new Error(`Blue Archive announced art coverage is incomplete (${replaced.length}/${ANNOUNCED_ART.size})`);
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

async function restoreGameLogos() {
  const manifest = await readJson('manifest.json');
  manifest.games = (manifest.games || []).map((game) => ({
    ...game,
    coverImage: LOGOS[game.id] || game.coverImage,
  }));
  const missing = (manifest.games || []).filter((game) => !game.coverImage);
  if (missing.length) throw new Error(`Missing game logos: ${missing.map((game) => game.id).join(', ')}`);
  await writeJson('manifest.json', manifest);
  console.log('Game logos restored');
}

await enrichBlueArchive();
await enrichDjmax();
await restoreGameLogos();