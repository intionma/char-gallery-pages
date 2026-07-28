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
