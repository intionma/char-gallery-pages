// SOUND VOLTEX 자켓 공개 민감도 분류.
// 기준 문서: docs/SDVX_JACKET_MODERATION.md
//
// 분류 대상은 캐릭터나 곡이 아니라 각 자켓 이미지 자체다. 수동 등급이 없는
// 자켓은 캐릭터 연결 여부로만 기본 분류하며, ● / ○ 는 사람이 직접 검토해
// MANUAL_RATINGS 에 등록한 자켓에만 부여한다.
//
// 인기순 정렬과 민감도 분류는 서로 독립된 데이터다. 선정성 숫자 점수
// (adultScore)는 사용하지 않는다.

export const SDVX_JACKET_CATEGORIES = ['●', '○', '□', '■'];

/** @type {Record<string, { category: string }>} */
const MANUAL_RATINGS = {};

export function ratingKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function rateSdvxJacket(jacket, linkedCharacterCount = 0) {
  const manual = MANUAL_RATINGS[ratingKey(jacket.title || jacket.group)];
  if (manual && SDVX_JACKET_CATEGORIES.includes(manual.category)) {
    return manual.category;
  }
  return linkedCharacterCount > 0 ? '□' : '■';
}
