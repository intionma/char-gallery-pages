export const BOORU_TAG_MIN_POSTS = 20;

export function booruCandidates(value, suffix) {
  const parts = String(value || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const base = [parts.join('_')];
  if (parts.length === 2) base.push([parts[1], parts[0]].join('_'));
  base.push(parts.at(-1), parts[0]);
  const candidates = [...base];
  if (suffix) base.forEach((tag) => candidates.push(`${tag}_(${suffix})`));
  return [...new Set(candidates)];
}

export function buildBooruPopularityScores(characters, tags, suffix) {
  const counts = new Map(
    tags
      .filter((tag) => tag.category === 4 && !tag.is_deprecated)
      .map((tag) => [String(tag.name).toLowerCase(), Number(tag.post_count) || 0]),
  );
  return new Map(characters.map((character) => {
    let score = 0;
    for (const candidate of booruCandidates(character.names?.en, suffix)) {
      const count = counts.get(candidate) || 0;
      if (count >= BOORU_TAG_MIN_POSTS) {
        score = count;
        break;
      }
    }
    return [character.id, score];
  }));
}

export function releaseTimestamp(content) {
  const line = String(content || '').split('\n').find((candidate) => {
    const match = candidate.match(/^\|\s*([^=]+?)\s*=/);
    if (!match) return false;
    const key = match[1].toLowerCase().replace(/[\s_-]/g, '');
    return key === 'release' || key === 'released' || key === 'releasedate';
  });
  if (!line) return 0;
  const raw = line.slice(line.indexOf('=') + 1).trim();
  if (!raw || /^unreleased$/i.test(raw)) return 0;
  const numeric = raw.match(/\b(20\d{2})\s*(?:\||-|\/)\s*(\d{1,2})\s*(?:\||-|\/)\s*(\d{1,2})\b/);
  if (numeric) return Date.UTC(Number(numeric[1]), Number(numeric[2]) - 1, Number(numeric[3]));
  const cleaned = raw
    .replace(/<!--.*?-->/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parsed = Date.parse(`${cleaned} UTC`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ── 프로필 정렬(나이·키·생일) ────────────────────────────────────────────────
// 원본마다 표기가 제각각이라 숫자로 못 읽는 값('Top Secret', 'Unknown', '??세')은
// 버린다. 값이 없는 캐릭터는 정렬에서 맨 뒤로 간다. 추정값을 지어내지 않는다.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function stripWikiMarkup(raw) {
  return String(raw ?? '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/'''?/g, '')
    .trim();
}

/** '16 years old', '22', '16세' → 16. '17?' 처럼 위키가 확신하지 않는 값은 버린다. */
export function parseAge(raw) {
  const text = stripWikiMarkup(raw).split('\n')[0].trim();
  const match = text.match(/^(\d{1,4})\s*(?:years?\s*old|세|살)?$/i);
  if (!match) return undefined;
  const age = Number(match[1]);
  return age > 0 && age < 10000 ? age : undefined;
}

/**
 * '160cm', '167 cm', '1.6m', '158.5cm' → cm 단위 숫자. 범위('150~160cm')는 단위가 붙은 값을,
 * 여러 줄(라스트오리진의 '길이' 추가 표기)은 첫 줄만 쓴다.
 */
export function parseHeightCm(raw) {
  const text = stripWikiMarkup(raw).split('\n')[0];
  const match = text.match(/(\d+(?:\.\d+)?)\s*(cm|m)\b/i);
  if (!match) return undefined;
  const value = Number(match[1]) * (match[2].toLowerCase() === 'm' ? 100 : 1);
  const rounded = Math.round(value * 10) / 10;
  return rounded >= 10 && rounded <= 5000 ? rounded : undefined;
}

function monthDay(month, day) {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return undefined;
  if (day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) return undefined; // 윤년 기준
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** [9, 28], '3/12', 'Dec. 23', 'July 4' → 'MM-DD'. 연도는 다루지 않는다. */
export function parseBirthday(raw) {
  if (Array.isArray(raw)) return monthDay(Number(raw[0]), Number(raw[1]));
  const text = stripWikiMarkup(raw);
  const numeric = text.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/);
  if (numeric) return monthDay(Number(numeric[1]), Number(numeric[2]));
  const named = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return monthDay(month, Number(named[2]));
  }
  return undefined;
}

export const PROFILE_SORT_FIELDS = { age: 'age', height: 'heightCm', birthday: 'birthday' };

/**
 * 캐릭터에 실린 프로필 값으로 sortMetadata 항목을 만든다. 값이 하나도 없는 항목은
 * 내보내지 않는다(프런트엔드는 항목이 없으면 그 정렬을 숨긴다).
 */
export function profileSortMetadata(characters, source, keys = Object.keys(PROFILE_SORT_FIELDS)) {
  const metadata = {};
  for (const key of keys) {
    const field = PROFILE_SORT_FIELDS[key];
    const matched = characters.filter((character) => character[field] !== undefined).length;
    if (matched) metadata[key] = { available: true, source, matched, total: characters.length };
  }
  return metadata;
}

/** 정의된 프로필 값만 남긴다. 캐릭터 객체에 펼쳐 넣는 용도. */
export function profileFields({ age, heightCm, birthday } = {}) {
  return {
    ...(age !== undefined ? { age } : {}),
    ...(heightCm !== undefined ? { heightCm } : {}),
    ...(birthday !== undefined ? { birthday } : {}),
  };
}
