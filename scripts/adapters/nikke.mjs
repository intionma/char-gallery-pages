// 승리의 여신: 니케 — Fandom 위키
//
// 공식 API 가 없어 위키가 유일한 공개 출처다. 위키 개편에 취약하므로 결과가 비면
// 예외를 던져 build-data 의 스냅샷 폴백이 동작하게 한다.
// 니케가 전부 여성이라 성별 필터가 필요 없다.
import {
  slug, wikiCategoryMembers, wikiPageImages, wikiImageInfo, normalizeTitle, wikiPageUrl,
  wikiThumb,
} from './shared.mjs';

const HOST = 'nikke-goddess-of-victory-international.fandom.com';

// 파일명 규칙:  {이름} FB.png 전신 / {이름} ({코스튬}) FB.png 코스튬 전신
//               MI 는 다른 구도의 일러라 FB 가 없을 때만 쓴다.
// 제외:        {이름}S.png(아이콘), aim idle combat, cover idle, Skill Burst 등 연출용
const ART_PATTERN = /^(?:\s*\(([^)]+)\))?\s+(FB|MI)$/;

export default async function buildNikke() {
  const members = await wikiCategoryMembers(HOST, 'Nikke');
  const names = members
    .map((row) => row.title)
    .filter((title) => !title.includes('/') && !/^List of/i.test(title));

  if (names.length < 100) {
    throw new Error(`NIKKE roster is unexpectedly small (${names.length})`);
  }

  const pageImages = await wikiPageImages(HOST, names);

  // 캐릭터별로 전신 일러만 고른다. 같은 코스튬에 FB 와 MI 가 둘 다 있으면 FB 를 쓴다.
  const wanted = new Map();
  for (const name of names) {
    const files = pageImages.get(normalizeTitle(name)) || [];
    const byCostume = new Map();
    for (const file of files) {
      const base = file.replace(/^File:/i, '').replace(/\.(png|jpg|jpeg|webp)$/i, '');
      if (!base.startsWith(name)) continue;
      const match = ART_PATTERN.exec(base.slice(name.length));
      if (!match) continue;
      const costume = match[1] || '기본';
      const kind = match[2];
      const prev = byCostume.get(costume);
      // FB 우선. 이미 FB 가 있으면 MI 로 덮지 않는다.
      if (!prev || (prev.kind === 'MI' && kind === 'FB')) byCostume.set(costume, { file, kind });
    }
    if (byCostume.size) wanted.set(name, byCostume);
  }

  const allTitles = [...new Set([...wanted.values()].flatMap((map) => [...map.values()].map((v) => v.file)))];
  const info = await wikiImageInfo(HOST, allTitles);

  const characters = [];
  const skins = [];
  for (const [name, byCostume] of wanted) {
    const id = slug('nikke', name);
    const sourceUrl = wikiPageUrl(HOST, name);
    const entries = [...byCostume.entries()]
      .map(([costume, { file }]) => ({ costume, file, meta: info.get(normalizeTitle(file)) }))
      .filter((entry) => entry.meta?.url)
      // 중복 URL 제거 후 기본을 맨 앞에 둔다.
      .filter((entry, index, list) => list.findIndex((other) => other.meta.url === entry.meta.url) === index)
      .sort((a, b) => (
        Number(b.costume === '기본') - Number(a.costume === '기본')
        || a.costume.localeCompare(b.costume, 'en')
      ));
    if (!entries.length) continue;

    const names_ = { en: name };
    const images = entries.map((entry) => ({
      url: entry.meta.url,
      // 목록·상세 카드는 축소본을 쓰고, 라이트박스만 원본을 연다.
      thumbUrl: wikiThumb(entry.meta.url, 480),
      width: entry.meta.width,
      height: entry.meta.height,
      group: entry.costume,
      type: entry.costume === '기본' ? '기본' : '의상',
      sourceType: entry.costume === '기본' ? 'official_standing' : 'official_skin',
      sourceUrl,
    }));

    characters.push({
      id,
      names: names_,
      group: '니케',
      profileImage: wikiThumb(images[0].url, 240),
      sourceUrl,
      images,
    });

    entries.forEach((entry, index) => {
      skins.push({
        id: slug('nikke-skin', entry.file.replace(/^File:/i, '').replace(/\.[a-z]+$/i, '')),
        characterId: id,
        character: { id, names: names_ },
        skinName: entry.costume,
        group: entry.costume,
        url: entry.meta.url,
        thumbUrl: wikiThumb(entry.meta.url, 480),
        sourceUrl,
        sourceType: entry.costume === '기본' ? 'official_standing' : 'official_skin',
        additionOrder: characters.length * 100 + index,
      });
    });
  }

  if (characters.length < 80) {
    throw new Error(`NIKKE gallery is unexpectedly small (${characters.length})`);
  }

  characters.sort((a, b) => a.names.en.localeCompare(b.names.en, 'en'));
  return { characters, skins };
}
