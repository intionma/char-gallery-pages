// 게임 정의의 단일 기준.
//
// 이 파일 하나만 고치면 빌드 파이프라인, 프런트엔드, 테마 CSS, 데이터 검증이 모두 따라온다.
// 예전에는 게임 하나가 build-data / skins 빌더 / enrich / validate / app.js / skins.js /
// styles.css / 워크플로 여덟 곳에 흩어져 있어서, 게임을 추가할 때마다 같은 작업을 반복했다.
//
// scripts/build-registry.mjs 가 이 정의로부터 다음을 생성한다.
//   dist/games.js   : window.CharGalleryGames (프런트엔드가 동기적으로 읽는다)
//   dist/themes.css : 게임별 색 토큰과 테마 변형 규칙
//
// theme.tokens 는 CSS 커스텀 프로퍼티 이름에서 `--` 를 뗀 것과 1:1로 대응한다.
// theme.dark 는 라이트를 기본으로 쓰는 게임의 다크 모드 덮어쓰기다. 처음부터 어두운
// 게임(이터널 리턴·SDVX·DJMAX)은 dark 를 두지 않고 scheme 만 dark 로 둔다.

/** 처음부터 어두운 테마들이 공유하는 값 */
const DARK_DANGER_BG = '52 24 30';
const NEON_DANGER_BG = '48 20 31';

export const GAMES = [
  {
    id: 'blue-archive',
    name: '블루 아카이브',
    description: '공식 스탠딩과 의상',
    dataFile: 'blue-archive.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/blue-archive/images/e/e6/Site-logo.png/revision/latest',
    // 각 게임 JSON 안에 들어가는 설명. 홈 카드의 description 과는 따로 관리한다.
    dataDescription: 'SchaleDB 기반 공식 스탠딩과 의상',
    coverImage: 'https://schaledb.com/images/student/portrait/10000.webp',
    collection: 'characters',
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      skins: '기본 스탠딩과 의상을 최신 추가순으로 한 번에 봅니다.',
      // 전체 스킨 뷰의 정렬 이름. additionOrder 가 실제로 무엇을 뜻하는지 그대로 적는다.
      // 게임마다 근거가 달라서(출시일·버전·위키 업로드 시각·나열 순서) 한 단어로 고정하면
      // 화면이 거짓말을 한다.
      skinsOrder: '추가순',
    },
    sort: {
      // capabilities.popularity 가 참일 때 첫 모드를, 아니면 fallback 을 쓴다.
      capability: 'popularity',
      modes: [['popularity', '인기순'], ['ko', '가나다순']],
      fallbackModes: [['source', '기본순'], ['ko', '가나다순']],
    },
    genderFilter: 'source-curated',
    theme: {
      scheme: 'light',
      default: true, // :root 에도 함께 적용한다
      themeColor: '#eaf1fa',
      darkThemeColor: '#0c111a',
      tokens: {
        bg: '234 241 250',
        'bg-2': '246 249 254',
        panel: '255 255 255',
        line: '215 228 244',
        accent: '58 142 230',
        'accent-strong': '31 111 208',
        'accent-soft': '140 196 245',
        text: '27 42 65',
        sub: '97 116 142',
        halo: '215 242 74',
        danger: '202 44 67',
        'danger-bg': '255 241 243',
        shadow: '0 1px 2px rgba(27, 42, 65, .04), 0 8px 24px -12px rgba(31, 111, 208, .22)',
        'shadow-hover': '0 2px 4px rgba(27, 42, 65, .06), 0 18px 40px -14px rgba(31, 111, 208, .38)',
      },
      dark: {
        bg: '12 17 26',
        'bg-2': '17 24 36',
        panel: '23 31 46',
        line: '44 58 82',
        accent: '84 168 250',
        'accent-strong': '128 194 255',
        'accent-soft': '96 150 210',
        text: '226 236 248',
        sub: '150 169 195',
        halo: '200 226 70',
        'danger-bg': DARK_DANGER_BG,
        shadow: '0 1px 2px rgb(0 0 0 / .12), 0 10px 30px -16px rgb(0 0 0 / .8)',
        'shadow-hover': '0 2px 4px rgb(0 0 0 / .18), 0 18px 42px -15px rgb(var(--accent) / .38)',
      },
    },
  },
  {
    id: 'eternal-return',
    name: '이터널 리턴',
    description: '실험체 스탠딩과 스킨',
    dataFile: 'eternal-return.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/blacksurvivaleternalreturn_gamepedia_en/images/e/e6/Site-logo.png/revision/latest',
    // 각 게임 JSON 안에 들어가는 설명. 홈 카드의 description 과는 따로 관리한다.
    dataDescription: 'DAK.GG 및 공식 위키 기반 스탠딩과 스킨',
    coverImage: 'https://cdn.dak.gg/assets/er/game-assets/11.7.0/ui/characterfullsize/CharFull_Jackie_S000.png',
    collection: 'characters',
    features: { skins: true, jackets: false, wallpapers: true },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      skins: '기본 스탠딩과 스킨을 출시·추가 최신순으로 한 번에 봅니다.',
      skinsOrder: '추가순',
      wallpapersTitle: '시즌 배경화면',
      wallpapersEntry: '시즌 배경화면 보기',
      wallpapers: '공식 팬키트의 시즌별 배경화면을 최신 시즌순으로 봅니다.',
    },
    sort: {
      capability: 'release',
      modes: [['release', '출시순'], ['ko', '가나다순'], ['en', 'A–Z']],
      fallbackModes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']],
    },
    genderFilter: 'source-curated',
    theme: {
      scheme: 'dark',
      themeColor: '#0d0f15',
      tokens: {
        bg: '13 15 21',
        'bg-2': '20 23 31',
        panel: '27 31 41',
        line: '48 54 68',
        accent: '224 66 74',
        'accent-strong': '190 44 52',
        'accent-soft': '236 112 118',
        text: '233 237 245',
        sub: '152 162 180',
        halo: '240 186 96',
        'danger-bg': DARK_DANGER_BG,
      },
    },
  },
  {
    id: 'genshin',
    name: '원신',
    description: '공식 캐릭터 이미지와 의상',
    dataFile: 'genshin.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/gensin-impact/images/e/e6/Site-logo.png/revision/latest',
    // 각 게임 JSON 안에 들어가는 설명. 홈 카드의 description 과는 따로 관리한다.
    dataDescription: 'Project Amber 기반 공식 캐릭터 이미지와 의상',
    coverImage: 'https://gi.yatta.moe/assets/UI/UI_Gacha_AvatarImg_Ayaka.png',
    collection: 'characters',
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      skins: '기본 일러스트와 의상을 게임 버전 최신순으로 한 번에 봅니다.',
      skinsOrder: '버전순',
    },
    sort: { modes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']] },
    genderFilter: 'bodyType',
    theme: {
      scheme: 'light',
      themeColor: '#f0e9da',
      darkThemeColor: '#121411',
      tokens: {
        bg: '240 233 218',
        'bg-2': '248 243 232',
        panel: '253 250 243',
        line: '223 210 185',
        accent: '56 122 118',
        'accent-strong': '38 92 89',
        'accent-soft': '122 176 170',
        text: '60 51 38',
        sub: '124 110 88',
        halo: '201 162 92',
      },
      dark: {
        bg: '18 20 17',
        'bg-2': '24 27 23',
        panel: '31 35 30',
        line: '56 61 51',
        accent: '96 182 172',
        'accent-strong': '134 208 198',
        'accent-soft': '120 162 152',
        text: '237 232 219',
        sub: '170 161 140',
        halo: '214 178 106',
        'danger-bg': DARK_DANGER_BG,
      },
    },
  },
  {
    id: 'sound-voltex',
    name: 'SOUND VOLTEX',
    description: '전체 곡 자켓과 난이도별 변형',
    dataFile: 'sound-voltex.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/sound-voltex/images/e/e6/Site-logo.png/revision/latest',
    // 각 게임 JSON 안에 들어가는 설명. 홈 카드의 description 과는 따로 관리한다.
    dataDescription: '전체 곡 자켓과 난이도별 변형',
    coverImage: null,
    collection: 'jackets',
    // 자켓 뷰(전곡)와 별개로, 캐릭터가 그려진 자켓만 모아 보는 화면도 함께 둔다.
    features: { skins: true, jackets: true, crew: true },
    labels: {
      detailSection: '공식 이미지',
      emptyList: 'SDVX 캐릭터 데이터가 준비되면 이 화면에 기존과 같은 목록으로 표시됩니다.',
      skinsTitle: '캐릭터 자켓',
      skins: '캐릭터가 그려진 자켓만 모아 발매 최신순으로 봅니다.',
      skinsEntry: '캐릭터 자켓 모아보기',
      skinsOrder: '발매순',
      crewTitle: '네메시스 크루',
      crew: '플레이 화면에 세우는 내비게이터 아트를 모아 봅니다.',
      crewEntry: '네메시스 크루 모아보기',
    },
    sort: { modes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']] },
    genderFilter: 'source-curated',
    theme: {
      scheme: 'dark',
      variant: 'neon',
      themeColor: '#080a12',
      tokens: {
        bg: '8 10 18',
        'bg-2': '13 17 28',
        panel: '20 24 38',
        line: '48 59 82',
        accent: '35 217 255',
        'accent-strong': '0 175 220',
        'accent-soft': '255 61 165',
        text: '238 246 255',
        sub: '150 169 196',
        halo: '249 224 73',
        'danger-bg': NEON_DANGER_BG,
        'surface-image': [
          'radial-gradient(760px 480px at 100% -6%, rgb(var(--accent) / .2), transparent 60%)',
          'radial-gradient(720px 480px at -6% 106%, rgb(var(--accent-soft) / .2), transparent 58%)',
          'radial-gradient(680px 420px at 50% 122%, rgb(150 60 240 / .12), transparent 66%)',
          'repeating-linear-gradient(122deg, rgb(255 255 255 / .028) 0 1px, transparent 1px 44px)',
        ].join(', '),
        'topbar-glow': '0 1px 0 rgb(var(--accent) / .45), 0 8px 24px -14px rgb(var(--accent) / .6)',
      },
    },
  },
  {
    id: 'djmax',
    name: 'DJMAX RESPECT V',
    description: '대표 캐릭터 이미지',
    dataFile: 'djmax.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/djmax/images/e/e6/Site-logo.png/revision/latest',
    // 각 게임 JSON 안에 들어가는 설명. 홈 카드의 description 과는 따로 관리한다.
    dataDescription: '대표 캐릭터 이미지',
    coverImage: 'https://static.wikia.nocookie.net/djmax/images/d/da/El_Clear_Tic_Tac_Toe.webp/revision/latest',
    collection: 'characters',
    // 원본에 "스킨" 개념이 없어 캐릭터 이미지에서 목록을 파생한다 (enrich-gallery).
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      skinsTitle: '전체 일러',
      // 팬아트는 Danbooru 등록일이 있고 공식 이미지는 없다. 후자는 아래로 내려간다.
      skins: '공식 이미지와 팬아트를 등록 최신순으로 한 번에 봅니다.',
      skinsEntry: '전체 일러 모아보기',
      skinsOrder: '등록순',
    },
    sort: { modes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']] },
    genderFilter: 'source-curated',
    theme: {
      scheme: 'dark',
      variant: 'neon',
      themeColor: '#0a0810',
      tokens: {
        bg: '10 8 16',
        'bg-2': '16 12 24',
        panel: '24 18 34',
        line: '58 44 80',
        accent: '255 74 150',
        'accent-strong': '226 44 120',
        'accent-soft': '158 96 255',
        text: '245 240 255',
        sub: '172 156 196',
        halo: '255 150 60',
        'danger-bg': NEON_DANGER_BG,
        'surface-image': [
          'radial-gradient(820px 520px at 108% -10%, rgb(var(--halo) / .16), transparent 58%)',
          'radial-gradient(760px 520px at 52% -12%, rgb(var(--accent) / .18), transparent 60%)',
          'radial-gradient(840px 560px at -8% 110%, rgb(var(--accent-soft) / .2), transparent 60%)',
        ].join(', '),
        'topbar-glow': '0 1px 0 rgb(var(--accent) / .4), 0 8px 24px -14px rgb(var(--accent-soft) / .55)',
      },
    },
  },
  {
    id: 'honkai-star-rail',
    name: '붕괴: 스타레일',
    description: '공식 캐릭터 일러스트',
    dataFile: 'honkai-star-rail.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/houkai-star-rail/images/e/e6/Site-logo.png/revision/latest',
    // 각 게임 JSON 안에 들어가는 설명. 홈 카드의 description 과는 따로 관리한다.
    dataDescription: 'Project Amber 기반 공식 캐릭터 일러스트',
    coverImage: 'https://sr.yatta.moe/hsr/assets/UI/avatar/large/1003.png',
    collection: 'characters',
    // 캐릭터당 공식 일러 한 장뿐이라 "스킨"이 없다. 같은 화면을 위해 파생한다.
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      skinsTitle: '전체 일러',
      skins: '공식 캐릭터 일러스트를 출시 최신순으로 한 번에 봅니다.',
      skinsEntry: '전체 일러 모아보기',
      skinsOrder: '출시순',
    },
    sort: {
      capability: 'release',
      modes: [['release', '출시순'], ['ko', '가나다순'], ['en', 'A–Z']],
      fallbackModes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']],
    },
    // 어떤 공개 소스에도 성별 필드가 없다. 오너 결정에 따라 필터 없이 전원을 담는다.
    genderFilter: 'none',
    theme: {
      scheme: 'dark',
      themeColor: '#0e0f1a',
      tokens: {
        bg: '14 15 26',
        'bg-2': '20 22 36',
        panel: '28 30 48',
        line: '52 56 84',
        accent: '168 140 255',
        'accent-strong': '198 178 255',
        'accent-soft': '255 208 122',
        text: '234 235 248',
        sub: '156 160 190',
        halo: '255 214 130',
        'danger-bg': '52 24 30',
      },
    },
  },
  {
    id: 'azur-lane',
    name: '벽람항로',
    description: '함선 인격 일러스트와 스킨',
    dataFile: 'azur-lane.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/azur-lane/images/e/e6/Site-logo.png/revision/latest',
    dataDescription: 'AzurAPI 기반 함선 일러스트와 스킨',
    coverImage: 'https://raw.githubusercontent.com/AzurAPI/azurapi-js-setup/master/images/skins/077/Default/image.png',
    collection: 'characters',
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      // AzurAPI 에 출시일이 없다. 새로 들어온 스킨만 최초 관측 시각으로 위에 올리고,
      // 그 아래는 함선 번호 순서다. 설명도 그대로 적는다.
      skins: '새로 추가된 스킨을 맨 위에 두고, 나머지는 함선 번호 순서로 봅니다.',
      skinsEntry: '전체 스킨 보기',
      skinsOrder: '추가순',
    },
    sort: { modes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']] },
    // 함선 인격이 전부 여성이라 필터가 필요 없다.
    genderFilter: 'not-needed',
    theme: {
      scheme: 'dark',
      themeColor: '#0b1220',
      tokens: {
        bg: '11 18 32',
        'bg-2': '16 25 42',
        panel: '23 34 55',
        line: '46 62 92',
        accent: '96 174 255',
        'accent-strong': '150 205 255',
        'accent-soft': '126 226 214',
        text: '229 238 250',
        sub: '150 168 196',
        halo: '255 206 122',
        'danger-bg': '52 24 30',
      },
    },
  },
  {
    id: 'arknights',
    name: '명일방주',
    description: '여성 오퍼레이터 일러스트와 스킨',
    dataFile: 'arknights.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/mrfz/images/e/e6/Site-logo.png/revision/latest',
    dataDescription: 'ArknightsGameData 및 Aceship 기반 오퍼레이터 일러스트',
    coverImage: 'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/characters/char_002_amiya_2.png',
    collection: 'characters',
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      // skin_table 의 getTime 이 실장 시각을 준다. 기본 아트는 값이 없어 아래로 내려간다.
      skins: '유상·이벤트 스킨을 실장 최신순으로 먼저 보여주고, 기본 아트를 뒤에 둡니다.',
      skinsEntry: '전체 스킨 보기',
      skinsOrder: '실장순',
    },
    sort: { modes: [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']] },
    // 핸드북 프로필의 [Gender] Female 로 자동 판별한다.
    genderFilter: 'handbook',
    theme: {
      scheme: 'dark',
      themeColor: '#101216',
      tokens: {
        bg: '16 18 22',
        'bg-2': '22 25 30',
        panel: '31 35 42',
        line: '56 62 72',
        accent: '255 204 68',
        'accent-strong': '255 226 130',
        'accent-soft': '124 196 236',
        text: '234 237 243',
        sub: '154 162 176',
        halo: '255 176 60',
        'danger-bg': '52 24 30',
      },
    },
  },
  {
    id: 'last-origin',
    name: '라스트오리진',
    description: '바이오로이드 일러스트와 스킨',
    dataFile: 'last-origin.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/lastorigin/images/e/e6/Site-logo.png/revision/latest',
    dataDescription: 'Last Origin Wiki 기반 바이오로이드 일러스트',
    coverImage: null,
    collection: 'characters',
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      // 출시일 필드가 없어 위키에 일러가 올라온 시각을 추가 시점으로 쓴다.
      skins: '기본 일러스트와 스킨을 위키 등록 최신순으로 한 번에 봅니다.',
      skinsEntry: '전체 스킨 보기',
      skinsOrder: '등록순',
    },
    sort: { modes: [['source', '기본순'], ['en', 'A–Z']] },
    // 등장인물이 전부 여성형 바이오로이드라 필터가 필요 없다.
    genderFilter: 'not-needed',
    theme: {
      scheme: 'dark',
      themeColor: '#12100e',
      tokens: {
        bg: '18 16 14',
        'bg-2': '25 22 19',
        panel: '34 30 26',
        line: '62 55 47',
        accent: '230 138 74',
        'accent-strong': '245 176 120',
        'accent-soft': '196 166 122',
        text: '241 235 226',
        sub: '172 160 145',
        halo: '250 200 110',
        'danger-bg': '52 24 30',
      },
    },
  },
  {
    id: 'nikke',
    name: '승리의 여신: 니케',
    description: '니케 일러스트와 코스튬',
    dataFile: 'nikke.json',
    // 홈 카드에 쓰는 게임 로고. enrich 단계에서 coverImage 를 이걸로 덮는다.
    logoImage: 'https://static.wikia.nocookie.net/nikke-goddess-of-victory-international/images/e/e6/Site-logo.png/revision/latest',
    dataDescription: 'NIKKE Wiki 기반 니케 일러스트와 코스튬',
    coverImage: null,
    collection: 'characters',
    features: { skins: true, jackets: false },
    labels: {
      detailSection: '스탠딩 · 의상',
      emptyList: '표시할 캐릭터가 없습니다.',
      // 출시일 필드가 없어 위키에 일러가 올라온 시각을 추가 시점으로 쓴다.
      skins: '기본 일러스트와 코스튬을 위키 등록 최신순으로 한 번에 봅니다.',
      skinsEntry: '전체 스킨 보기',
      skinsOrder: '등록순',
    },
    sort: { modes: [['source', '기본순'], ['en', 'A–Z']] },
    // 니케가 전부 여성이라 필터가 필요 없다.
    genderFilter: 'not-needed',
    theme: {
      scheme: 'dark',
      themeColor: '#0f0d14',
      tokens: {
        bg: '15 13 20',
        'bg-2': '21 18 28',
        panel: '30 26 40',
        line: '58 50 76',
        accent: '236 92 130',
        'accent-strong': '250 140 170',
        'accent-soft': '140 208 232',
        text: '240 234 245',
        sub: '166 156 180',
        halo: '250 206 120',
        'danger-bg': '52 24 30',
      },
    },
  },
];

// 원본 CDN마다 Referer 요구가 정반대다. 기본은 no-referrer 이고, 여기 적힌 호스트만
// 예외로 origin 을 보낸다. 게임을 추가하다 이미지가 403 으로 깨지면 여기를 확인한다.
//   cdn.donmai.us            : Referer 없으면 403
//   static.wikia.nocookie.net: Referer 있으면 404 (그래서 기본이 no-referrer 다)
export const REFERRER_REQUIRED_HOSTS = ['donmai.us'];

export const gameById = new Map(GAMES.map((game) => [game.id, game]));

export function defaultGame() {
  return GAMES.find((game) => game.theme.default) || GAMES[0];
}

/** 프런트엔드로 넘길 최소 형태. 빌드 전용 필드(genderFilter 등)는 뺀다. */
export function clientGames() {
  return GAMES.map((game) => ({
    id: game.id,
    name: game.name,
    description: game.description,
    dataFile: game.dataFile,
    collection: game.collection,
    features: game.features,
    labels: game.labels,
    sort: game.sort,
    themeColor: game.theme.themeColor,
    darkThemeColor: game.theme.darkThemeColor || null,
    variant: game.theme.variant || null,
  }));
}
