import assert from 'node:assert/strict';
import {
  BOORU_TAG_MIN_POSTS,
  booruCandidates,
  buildBooruPopularityScores,
  releaseTimestamp,
  parseAge,
  parseHeightCm,
  parseBirthday,
  profileSortMetadata,
} from './sort-utils.mjs';

assert.deepEqual(
  booruCandidates('Rikuhachima Aru', 'blue_archive'),
  [
    'rikuhachima_aru',
    'aru_rikuhachima',
    'aru',
    'rikuhachima',
    'rikuhachima_aru_(blue_archive)',
    'aru_rikuhachima_(blue_archive)',
    'aru_(blue_archive)',
    'rikuhachima_(blue_archive)',
  ],
);

const characters = [
  { id: 'aru', names: { en: 'Rikuhachima Aru' } },
  { id: 'hina', names: { en: 'Sorasaki Hina' } },
  { id: 'unknown', names: { en: 'Unknown Student' } },
];
const scores = buildBooruPopularityScores(characters, [
  { name: 'rikuhachima_aru_(blue_archive)', category: 4, post_count: 1234 },
  { name: 'sorasaki_hina_(blue_archive)', category: 4, post_count: BOORU_TAG_MIN_POSTS - 1 },
  { name: 'unknown_student_(blue_archive)', category: 0, post_count: 9999 },
], 'blue_archive');
assert.equal(scores.get('aru'), 1234);
assert.equal(scores.get('hina'), 0);
assert.equal(scores.get('unknown'), 0);

assert.equal(
  releaseTimestamp('| gender = female\n| release = {{Date|2023|8|31}}\n'),
  Date.UTC(2023, 7, 31),
);
assert.equal(
  releaseTimestamp('| release_date = [[March 3]], 2022\n'),
  Date.UTC(2022, 2, 3),
);
assert.equal(releaseTimestamp('| released = Unreleased\n'), 0);
assert.equal(releaseTimestamp('| other = 2024-01-01\n'), 0);

assert.equal(parseAge('16 years old'), 16);
assert.equal(parseAge('22'), 22);
assert.equal(parseAge('16세'), 16);
assert.equal(parseAge('Top Secret'), undefined);
assert.equal(parseAge('Unknown'), undefined);
assert.equal(parseAge('17?'), undefined);
assert.equal(parseAge('??세'), undefined);

assert.equal(parseHeightCm('160cm'), 160);
assert.equal(parseHeightCm('167 cm'), 167);
assert.equal(parseHeightCm('158.5 cm'), 158.5);
assert.equal(parseHeightCm('1.6m'), 160);
assert.equal(parseHeightCm('150~160cm'), 160);
assert.equal(parseHeightCm("3.5m<br>'''Length:''' 6.2m"), 350);
assert.equal(parseHeightCm('Data Cracked'), undefined);
assert.equal(parseHeightCm('Undisclosed'), undefined);

assert.equal(parseBirthday([9, 28]), '09-28');
assert.equal(parseBirthday('3/12'), '03-12');
assert.equal(parseBirthday('Dec. 23'), '12-23');
assert.equal(parseBirthday('July 4'), '07-04');
assert.equal(parseBirthday('February 29'), '02-29');
assert.equal(parseBirthday('February 30'), undefined);
assert.equal(parseBirthday('-'), undefined);
assert.equal(parseBirthday('Unknown'), undefined);

assert.deepEqual(
  profileSortMetadata([{ age: 16, birthday: '03-12' }, { age: 17 }, {}], 'test'),
  {
    age: { available: true, source: 'test', matched: 2, total: 3 },
    birthday: { available: true, source: 'test', matched: 1, total: 3 },
  },
);

console.log('sort metadata assertions passed');
