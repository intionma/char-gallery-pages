import assert from 'node:assert/strict';
import {
  BOORU_TAG_MIN_POSTS,
  booruCandidates,
  buildBooruPopularityScores,
  releaseTimestamp,
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

console.log('sort metadata assertions passed');
