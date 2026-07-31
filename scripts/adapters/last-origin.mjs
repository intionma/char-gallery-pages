// 라스트오리진 — Fandom 위키
//
// 공식 API 가 없어 위키가 유일한 공개 출처다. 위키 개편에 취약하므로 결과가 비면
// 예외를 던져 build-data 의 스냅샷 폴백이 동작하게 한다.
// 등장인물이 전부 여성형 바이오로이드라 성별 필터가 필요 없다.
import {
  fetchJson, slug, mapLimited, wikiCategoryMembers, wikiPageImages, wikiImageInfo,
  wikiThumb,
  normalizeTitle, wikiPageUrl,
} from './shared.mjs';

const HOST = 'lastorigin.fandom.com';

// 파일명 규칙:  {이름}.png 기본 / {이름} Skin N.png 스킨 / {이름} Icon.png 아이콘
// 제외:        Censored(검열판) · Damaged(피격) · Intro(연출컷) 등 파생 이미지
const EXCLUDED = /(censored|damaged|intro|icon|chibi|sprite|thumb)/i;

function skinLabel(fileTitle, name) {
  const base = fileTitle.replace(/^File:/i, '').replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const rest = base.slice(name.length).trim();
  if (!rest) return '기본';
  if (/^Alt/i.test(rest)) return rest.replace(/^Alt\s*/i, '변형 ').trim() || '변형';
  return rest.replace(/^Skin\s*/i, '스킨 ');
}

export default async function buildLastOrigin() {
  const members = await wikiCategoryMembers(HOST, 'Characters');
  // 하위 문서(슬래시 포함)와 목록 문서는 캐릭터가 아니다.
  const names = members
    .map((row) => row.title)
    .filter((title) => !title.includes('/') && !/^List of/i.test(title));

  if (names.length < 100) {
    throw new Error(`Last Origin roster is unexpectedly small (${names.length})`);
  }

  const pageImages = await wikiPageImages(HOST, names);

  // 캐릭터별로 자기 이름으로 시작하는 파일만 남긴다.
  const wanted = new Map();
  for (const name of names) {
    const files = pageImages.get(normalizeTitle(name)) || [];
    const own = files.filter((file) => {
      const base = file.replace(/^File:/i, '');
      if (!base.toLowerCase().startsWith(`${name.toLowerCase()}`)) return false;
      if (EXCLUDED.test(base)) return false;
      // '{이름}.png' 이거나 '{이름} Skin N.png' 형태만 받는다.
      const rest = base.slice(name.length).replace(/\.(png|jpg|jpeg|webp)$/i, '').trim();
      return rest === '' || /^Skin\s*\d+$/i.test(rest) || /^Alt\s*\d*$/i.test(rest);
    });
    if (own.length) wanted.set(name, own);
  }

  const allTitles = [...new Set([...wanted.values()].flat())];
  const info = await wikiImageInfo(HOST, allTitles);

  const characters = [];
  const skins = [];
  for (const [name, files] of wanted) {
    const id = slug('lo', name);
    const sourceUrl = wikiPageUrl(HOST, name);
    const images = files
      .map((file) => ({ file, meta: info.get(normalizeTitle(file)) }))
      .filter((entry) => entry.meta?.url)
      .map((entry) => {
        const label = skinLabel(entry.file, name);
        return {
          file: entry.file,
          url: entry.meta.url,
          // 목록·상세 카드는 축소본을 쓰고, 라이트박스만 원본을 연다.
          thumbUrl: wikiThumb(entry.meta.url, 480),
          width: entry.meta.width,
          height: entry.meta.height,
          group: label,
          type: label === '기본' ? '기본' : '의상',
          sourceType: label === '기본' ? 'official_standing' : 'official_skin',
          sourceUrl,
        };
      })
      // 위키에 대소문자만 다른 같은 파일이 올라와 있는 경우가 있다. URL 로 중복을 없앤다.
      .filter((image, index, list) => list.findIndex((other) => other.url === image.url) === index)
      // 기본 일러를 맨 앞에 두고 나머지는 파일명 순으로 정렬한다.
      .sort((a, b) => (
        Number(b.group === '기본') - Number(a.group === '기본')
        || a.file.localeCompare(b.file, 'en', { numeric: true })
      ));
    if (!images.length) continue;

    const names_ = { en: name };
    characters.push({
      id,
      names: names_,
      group: '바이오로이드',
      profileImage: wikiThumb(images[0].url, 240),
      sourceUrl,
      images: images.map(({ file: _file, ...image }) => image),
    });
    images.forEach((image, index) => {
      skins.push({
        // 라벨은 한글이라 슬러그에서 사라진다. 파일 제목으로 고유 id 를 만든다.
        id: slug('lo-skin', image.file.replace(/^File:/i, '').replace(/\.[a-z]+$/i, '')),
        characterId: id,
        character: { id, names: names_ },
        skinName: image.group,
        group: image.group,
        url: image.url,
        thumbUrl: image.thumbUrl,
        sourceUrl,
        sourceType: image.sourceType,
        additionOrder: characters.length * 100 + index,
      });
    });
  }

  if (characters.length < 80) {
    throw new Error(`Last Origin gallery is unexpectedly small (${characters.length})`);
  }

  characters.sort((a, b) => a.names.en.localeCompare(b.names.en, 'en'));
  return { characters, skins };
}
