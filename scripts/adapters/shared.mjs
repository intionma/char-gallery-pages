// 게임 어댑터가 공유하는 최소 도구 모음.
//
// == 어댑터 규약 ==
// 어댑터는 `scripts/adapters/<게임id>.mjs` 에 두고 기본 내보내기로 비동기 함수를 노출한다.
// 이 함수는 아래 형태를 반환한다. `game` 과 `generatedAt` 은 build-data 가 붙이므로
// 어댑터는 목록만 만들면 된다.
//
//   export default async function build(context) {
//     return { characters: [...] };   // 또는 { jackets: [...] }
//   }
//
// context 는 build-data 가 넘긴다.
//   { game, generatedAt, publishedData(name), fetchJson(url, opts), fetchText(url) }
//
// 캐릭터 한 건의 공통 형태:
//   {
//     id,                     // 게임 접두사를 붙인 고유 id (slug 헬퍼 사용)
//     names: { ko, en, ja },  // 최소 하나는 있어야 한다
//     group,                  // 목록 필터에 쓰이는 분류. 없으면 '기타'
//     profileImage,           // 목록 썸네일 (정사각 크롭이어도 된다)
//     sourceUrl,              // 출처 문서 URL. 공개 저장소 원칙상 반드시 남긴다
//     images: [{ url, group, type, sourceUrl, width?, height? }],
//   }
//
// 이미지 URL 은 항상 HTTPS 원격 주소를 쓴다. 이 저장소는 이미지를 저장하지 않는다.

export const USER_AGENT = 'char-gallery-pages/1.0 (+https://github.com/intionma/char-gallery-pages)';

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json,*/*', 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'text/html,application/javascript,*/*', 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 60000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

export function slug(prefix, value) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

/** 원격 요청을 제한된 동시성으로 돌린다. 무제한 병렬은 레이트리밋을 유발한다. */
export async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  }));
  return out;
}

// ── 죽은 이미지 URL 정리 ────────────────────────────────────────────────────
// 규칙으로 조합해 만든 URL은 실제로 존재하지 않을 수 있다. 판정은 보수적으로 한다.
// 확실한 404/410 만 죽은 것으로 보고, 타임아웃·5xx·네트워크 오류는 살아있는 것으로
// 남긴다. 원본이 잠시 흔들릴 때 멀쩡한 이미지를 지워버리면 안 되기 때문이다.
// 동시 요청을 제한하지 않으면 레이트리밋 응답을 죽음으로 오판한다(실측 35건 → 70건).

const MISSING_STATUSES = new Set([404, 410]);
export const LIVE_CHECK_CONCURRENCY = 6;
const missingUrlCache = new Map();

export async function isMissingUrl(url) {
  if (missingUrlCache.has(url)) return missingUrlCache.get(url);
  const check = (async () => {
    for (const method of ['HEAD', 'GET']) {
      try {
        const response = await fetch(url, {
          method,
          headers: { Accept: 'image/*,*/*', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30000),
        });
        if (response.body) await response.body.cancel().catch(() => {});
        if (response.status === 405 || response.status === 501) continue;
        return MISSING_STATUSES.has(response.status);
      } catch {
        return false;
      }
    }
    return false;
  })();
  missingUrlCache.set(url, check);
  return check;
}

/** images 중 실제로 없는 것만 걸러낸다. skip 이 true 면 원본을 그대로 돌려준다. */
export async function filterLiveImages(images, label, { skip = false, log = console.log } = {}) {
  if (skip) return images;
  const missing = await mapLimited(images, LIVE_CHECK_CONCURRENCY, (image) => isMissingUrl(image.url));
  const kept = images.filter((_, index) => !missing[index]);
  const dropped = images.length - kept.length;
  if (dropped) log(`${label}: dropped ${dropped} missing image URL(s) of ${images.length}`);
  return kept;
}

// ── MediaWiki (Fandom / wiki.gg) ───────────────────────────────────────────
// 공식 API 가 없는 게임은 위키가 유일한 공개 출처다. 위키 개편에 취약하므로
// 어댑터는 결과가 비면 예외를 던져 build-data 의 스냅샷 폴백이 동작하게 해야 한다.

export async function wikiCategoryMembers(host, category, { limit = 500 } = {}) {
  const rows = [];
  let cmcontinue;
  do {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', list: 'categorymembers',
      cmtitle: `Category:${category}`, cmlimit: String(limit), cmtype: 'page', origin: '*',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);
    const data = await fetchJson(`https://${host}/api.php?${params}`);
    rows.push(...(data.query?.categorymembers || []));
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);
  return rows;
}

/** 파일 제목 목록을 실제 이미지 URL·크기로 바꾼다. 없는 파일은 결과에서 빠진다. */
export async function wikiImageInfo(host, titles, { batch = 40 } = {}) {
  const byTitle = new Map();
  for (let i = 0; i < titles.length; i += batch) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
      iiprop: 'url|size', titles: titles.slice(i, i + batch).join('|'), origin: '*',
    });
    const data = await fetchJson(`https://${host}/api.php?${params}`);
    for (const page of data.query?.pages || []) {
      const info = page.imageinfo?.[0];
      if (!page.missing && info?.url) byTitle.set(normalizeTitle(page.title), info);
    }
  }
  return byTitle;
}

/** 위키 문서 본문(wikitext)을 제목 단위로 가져온다. */
export async function wikiPageContent(host, titles, { batch = 50 } = {}) {
  const byTitle = new Map();
  for (let i = 0; i < titles.length; i += batch) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'revisions',
      rvprop: 'content', rvslots: 'main', titles: titles.slice(i, i + batch).join('|'), origin: '*',
    });
    const data = await fetchJson(`https://${host}/api.php?${params}`);
    for (const page of data.query?.pages || []) {
      const text = page.revisions?.[0]?.slots?.main?.content;
      if (text) byTitle.set(normalizeTitle(page.title), text);
    }
  }
  return byTitle;
}

export function normalizeTitle(value) {
  return String(value || '').replace(/_/g, ' ').toLowerCase();
}

export function wikiPageUrl(host, title) {
  return `https://${host}/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}
