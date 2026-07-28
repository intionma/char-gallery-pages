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
node scripts/normalize-sdvx.mjs dist/data/sound-voltex.json
python3 -m http.server 8000 -d dist
```

## 데이터 출처

- Blue Archive: SchaleDB
- Eternal Return: DAK.GG, Eternal Return Wiki
- Genshin Impact: Project Amber, Genshin Impact Wiki
- SOUND VOLTEX: SDVX Index
- DJMAX RESPECT V: DJMAX Wiki 및 각 이미지 원본 페이지

각 이미지와 게임 관련 권리는 해당 권리자에게 있습니다.
