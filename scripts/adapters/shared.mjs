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

/**
 * 일시적인 거절(429 레이트리밋, 5xx)만 지수 백오프로 다시 시도한다.
 *
 * 위키 API 는 문서를 수백 건씩 훑기 때문에 429 를 자주 돌려준다. 여기서 한 번
 * 실패하면 어댑터 전체가 예외로 끝나고 그 게임이 스냅샷 폴백으로 떨어진다.
 * 404 처럼 다시 걸어도 결과가 같은 응답은 그대로 던진다.
 */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchRetrying(url, options, accept) {
  const attempts = options.attempts ?? 4;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let retryAfterMs = 1000 * 2 ** attempt;
    try {
      const response = await fetch(url, {
        ...options,
        headers: { Accept: accept, 'User-Agent': USER_AGENT, ...(options.headers || {}) },
        signal: AbortSignal.timeout(options.timeout || 60000),
      });
      if (response.ok) return response;

      lastError = new Error(`${response.status} ${response.statusText}: ${url}`);
      // 404 처럼 다시 걸어도 답이 같은 응답은 즉시 포기한다.
      if (!RETRY_STATUSES.has(response.status)) throw lastError;
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = Math.min(retryAfter * 1000, 30000);
    } catch (error) {
      if (error === lastError && !RETRY_STATUSES.has(Number(String(error.message).slice(0, 3)))) throw error;
      // 네트워크 오류·타임아웃도 다시 시도할 값어치가 있다.
      lastError = error;
    }
    if (attempt < attempts - 1) await wait(retryAfterMs);
  }
  throw lastError;
}

export async function fetchJson(url, options = {}) {
  const response = await fetchRetrying(url, options, 'application/json,*/*');
  return response.json();
}

export async function fetchText(url, options = {}) {
  const response = await fetchRetrying(url, options, 'text/html,application/javascript,*/*');
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

/**
 * URL 한 건의 상태. 'missing' 은 서버가 없다고 답한 것이고, 'unreachable' 은 아예 답을
 * 못 받은 것이다. 둘을 섞으면 안 된다 — 호스트가 통째로 사라졌을 때 모든 요청이 예외로
 * 끝나는데, 그걸 'live' 로 세면 "전부 살아있다"는 결론이 나온다. 실제로 그렇게
 * test.blue-utils.me 의 DNS 가 사라진 뒤에도 메모리얼 538건이 그대로 배포됐다.
 */
export async function urlLiveness(url) {
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
        return MISSING_STATUSES.has(response.status) ? 'missing' : 'live';
      } catch {
        return 'unreachable';
      }
    }
    return 'live';
  })();
  missingUrlCache.set(url, check);
  return check;
}

/** 서버가 명시적으로 "없다"고 답한 경우에만 true. 도달 실패는 지우지 않는다. */
export async function isMissingUrl(url) {
  return (await urlLiveness(url)) === 'missing';
}

/**
 * images 중 실제로 없는 것만 걸러낸다. skip 이 true 면 원본을 그대로 돌려준다.
 * 도달 실패가 대부분이면 원본 장애로 보고 예외를 던진다 — 조용히 통과시키면
 * 죽은 호스트가 그대로 배포된다.
 */
export async function filterLiveImages(images, label, {
  skip = false, log = console.log, unreachableLimit = 0.5, unreachableSample = 20,
} = {}) {
  if (skip) return images;
  const states = await mapLimited(images, LIVE_CHECK_CONCURRENCY, (image) => urlLiveness(image.url));
  const unreachable = states.filter((state) => state === 'unreachable').length;
  // 표본이 작으면 일시 장애 한두 건으로도 비율이 튄다. 캐릭터 한 명씩 도는 호출까지
  // 터뜨리지 않도록 일정 건수 이상일 때만 장애로 판정한다.
  if (images.length >= unreachableSample && unreachable > images.length * unreachableLimit) {
    throw new Error(`${label}: ${unreachable}/${images.length} image URL(s) unreachable — 원본 호스트 장애로 보입니다`);
  }
  const kept = images.filter((_, index) => states[index] !== 'missing');
  const dropped = images.length - kept.length;
  if (dropped) log(`${label}: dropped ${dropped} missing image URL(s) of ${images.length}`);
  if (unreachable) log(`${label}: ${unreachable} unreachable URL(s) kept (일시 장애로 간주)`);
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
      // timestamp 는 파일이 위키에 올라온 시각이다. 출시일 필드가 없는 위키 기반
      // 게임에서 "최신 추가순"의 유일한 실제 근거가 되므로 항상 함께 받는다.
      iiprop: 'url|size|timestamp', titles: titles.slice(i, i + batch).join('|'), origin: '*',
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

/**
 * 문서마다 붙어 있는 파일 목록을 가져온다. 위키는 내비게이션 아이콘까지 함께 주므로
 * 호출한 쪽에서 이름 규칙으로 걸러야 한다.
 */
export async function wikiPageImages(host, titles, { batch = 20 } = {}) {
  const byTitle = new Map();
  for (let i = 0; i < titles.length; i += batch) {
    // 여러 문서를 한 번에 물으면 결과가 잘린다. imcontinue 를 끝까지 따라가야
    // 뒤쪽 문서의 파일 목록이 비지 않는다.
    let imcontinue;
    do {
      const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', prop: 'images',
        imlimit: '500', titles: titles.slice(i, i + batch).join('|'), origin: '*',
      });
      if (imcontinue) params.set('imcontinue', imcontinue);
      const data = await fetchJson(`https://${host}/api.php?${params}`);
      for (const page of data.query?.pages || []) {
        if (page.missing) continue;
        // 연속 조회는 이미 끝난 문서의 목록을 다시 주기도 한다. 중복을 걸러 쌓는다.
        const key = normalizeTitle(page.title);
        const prev = byTitle.get(key) || [];
        const merged = new Set(prev);
        for (const image of page.images || []) merged.add(image.title);
        byTitle.set(key, [...merged]);
      }
      imcontinue = data.continue?.imcontinue;
    } while (imcontinue);
  }
  return byTitle;
}

export function normalizeTitle(value) {
  return String(value || '').replace(/_/g, ' ').toLowerCase();
}

/**
 * 위키아 이미지 URL 을 축소본으로 바꾼다. 위키 기반 게임은 별도 썸네일이 없어서
 * 목록에 원본 전신 일러(수백 KB)를 그대로 쓰면 한 화면에서 수십 MB를 받게 된다.
 * 200px 기준으로 250KB → 14KB 수준으로 줄어든다.
 */
export function wikiThumb(url, width) {
  if (!url || !/static\.wikia\.nocookie\.net/.test(url)) return url;
  return url.replace(/\/revision\/latest/, `/revision/latest/scale-to-width-down/${width}`);
}

export function wikiPageUrl(host, title) {
  return `https://${host}/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}

/**
 * 전체 스킨 뷰의 "최신 추가순" 정렬 키를 만든다.
 *
 * 실제 시각(위키 업로드 시각 등)을 알면 epoch ms 를 그대로 쓴다. 모르면 원본이
 * 나열한 순서를 쓴다. epoch ms(약 1.7e12)는 나열 순서(수만 단위)보다 훨씬 크므로
 * 시각을 아는 항목이 항상 위로 온다 — 시각을 모르는 항목을 "오래된 것"으로
 * 취급하는 셈이고, 이게 "최신 추가순"이 약속하는 화면과 맞는다.
 */
export function additionOrderOf(timestamp, fallbackOrder) {
  const parsed = Date.parse(timestamp || '');
  return Number.isFinite(parsed) ? parsed : fallbackOrder;
}
