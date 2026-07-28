# Character Gallery Pages

여러 게임의 공식 캐릭터 이미지와 리듬게임 자켓을 보는 GitHub Pages 정적 갤러리입니다.

## 특징

- GitHub Pages에서만 동작하는 정적 사이트
- 별도 서버 함수, 데이터베이스, API 키 없음
- 이미지는 저장하지 않고 각 공개 출처의 원격 URL을 사용
- GitHub Actions가 공개 데이터 소스에서 정적 JSON을 생성
- 매일 04:17 KST에 데이터 갱신

## 로컬 확인

```bash
rm -rf dist
mkdir -p dist/data
cp index.html 404.html styles.css skins.css app.js skins.js dist/
node scripts/build-data.mjs dist/data
node scripts/build-blue-archive-skins.mjs dist/data/blue-archive.json
node scripts/build-eternal-return-skins.mjs dist/data/eternal-return.json
node scripts/build-genshin-skins.mjs dist/data/genshin.json
node scripts/enrich-gallery.mjs dist/data
node scripts/normalize-sdvx.mjs dist/data/sound-voltex.json
node scripts/validate-data.mjs dist/data
python3 -m http.server 8000 -d dist
```

외부 요청 없이 보강 스크립트의 구조만 확인할 때는 `CG_SKIP_REMOTE=1 node scripts/enrich-gallery.mjs dist/data`를 사용할 수 있습니다.

## 데이터 출처

- Blue Archive: SchaleDB, Blue Utils 메모리얼 로비, 공식 X 및 공개 이미지 원본
- Eternal Return: DAK.GG, Eternal Return Wiki, 공식 뉴스 이미지
- Genshin Impact: Project Amber, genshin-db, Genshin Impact Wiki
- SOUND VOLTEX: SDVX Index
- DJMAX RESPECT V: DJMAX Wiki, Danbooru 일반 등급 팬아트 및 각 이미지 원본 페이지

캐릭터 목록은 가능한 경우 블루 아카이브 Danbooru 인기순과 이터널 리턴 공식 위키 출시순 메타데이터를 정적 JSON에 함께 저장합니다. 외부 원본 갱신이 일시적으로 실패하면 빈 목록으로 덮지 않고 마지막 정상 배포본을 검증해 유지합니다.

## 자켓 민감도 분류

SOUND VOLTEX 자켓의 `● / ○ / □ / ■` 분류 기준은 [`docs/SDVX_JACKET_MODERATION.md`](docs/SDVX_JACKET_MODERATION.md)를 따릅니다.
수동 등급은 `scripts/sdvx-jacket-ratings.mjs`의 `MANUAL_RATINGS`에 자켓 단위로 등록하며, 등록되지 않은 자켓은 캐릭터 연결 여부로만 `□`/`■`로 분류합니다.
민감도 분류와 인기순 정렬은 서로 독립된 데이터이고, 선정성 숫자 점수는 사용하지 않습니다.

각 이미지와 게임 관련 권리는 해당 권리자에게 있습니다.