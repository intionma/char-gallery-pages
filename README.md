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
node scripts/build-registry.mjs dist
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
- Honkai: Star Rail: Project Amber
- Azur Lane: AzurAPI, Azur Lane Wiki
- Arknights: ArknightsGameData(YoStar), Aceship 이미지, ArknightsGameResource 아이콘
- Last Origin: Last Origin Wiki (검열판·무검열판 모두 수록, 화면 기본값은 검열판)
- NIKKE: NIKKE Wiki
- SOUND VOLTEX: SDVX Index
- DJMAX RESPECT V: DJMAX Wiki, Danbooru 일반 등급 팬아트 및 각 이미지 원본 페이지

캐릭터 목록은 가능한 경우 블루 아카이브 Danbooru 인기순과 이터널 리턴 공식 위키 출시순 메타데이터를 정적 JSON에 함께 저장합니다. 외부 원본 갱신이 일시적으로 실패하면 빈 목록으로 덮지 않고 마지막 정상 배포본을 검증해 유지합니다.

## 게임 추가

게임 정의는 [`scripts/games/registry.mjs`](scripts/games/registry.mjs)가 단일 기준입니다.
id·이름·테마 색 토큰·정렬 모드·기능 플래그를 한곳에 적으면 프런트엔드, 테마 CSS,
데이터 검증이 모두 따라옵니다. 빌드가 이 정의로부터 `dist/games.js`와 `dist/themes.css`를
생성하므로 두 파일은 직접 고치지 않습니다.

## 전체 스킨 뷰와 정렬 근거

게임 화면의 진입 링크로 그 게임의 모든 일러를 한 화면에서 봅니다. 원본에 "스킨" 개념이
없는 게임(DJMAX·스타레일·SOUND VOLTEX)은 빌드가 캐릭터 이미지로 목록을 만듭니다.

정렬 키(`additionOrder`)의 근거는 게임마다 다르고, 화면의 정렬 이름도 그에 맞춥니다.

| 게임 | 근거 |
|------|------|
| 블루 아카이브 · 이터널 리턴 | 공식 발표일과 최초 관측 시각 (추가순) |
| 원신 | 게임 버전 (버전순) |
| 명일방주 | `skin_table`의 실장 시각 (실장순) |
| 붕괴: 스타레일 | 캐릭터 출시 시각 (출시순) |
| SOUND VOLTEX | 곡 발매일 (발매순) |
| 라스트오리진 · 니케 | 위키 파일 업로드 시각 (등록순) |
| DJMAX | Danbooru 등록일 (등록순) |
| 벽람항로 | 출시일이 공개되지 않아 함선 번호 순. 새로 들어온 것만 위로 올립니다 |

원본이 실제 날짜를 주지 않는 항목은 이 사이트가 처음 관측한 시각을 대체값으로 씁니다.
날짜를 아는 항목을 이 값으로 덮어쓰지는 않습니다.

## 세부 항목으로 이동

라이트박스에서 `이 캐릭터로 이동` / `이 자켓으로 이동` 버튼으로 그 이미지의 상세 화면으로
건너뜁니다. 자켓은 `#/game/<게임>/jackets/<자켓id>` 로 바로 열 수 있습니다.

## 검열 토글

라스트오리진은 위키에 검열판이 따로 있어 두 판본을 함께 싣습니다. **사이트 기본값은
검열판**이고, 상단 눈 모양 버튼으로 해제할 수 있습니다. 선택은 브라우저에 저장되며,
검열판이 없는 이미지는 애초에 검열 대상이 아니므로 그대로 표시합니다. 검열판이 실린
게임에서만 버튼이 나타납니다.

## 자켓 민감도 분류

SOUND VOLTEX 자켓의 `● / ○ / □ / ■` 분류 기준은 [`docs/SDVX_JACKET_MODERATION.md`](docs/SDVX_JACKET_MODERATION.md)를 따릅니다.
수동 등급은 `scripts/sdvx-jacket-ratings.mjs`의 `MANUAL_RATINGS`에 자켓 단위로 등록하며, 등록되지 않은 자켓은 캐릭터 연결 여부로만 `□`/`■`로 분류합니다.
민감도 분류와 인기순 정렬은 서로 독립된 데이터이고, 선정성 숫자 점수는 사용하지 않습니다.

각 이미지와 게임 관련 권리는 해당 권리자에게 있습니다.