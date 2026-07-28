(() => {
  'use strict';

  const DATA_FILES = {
    'blue-archive': 'blue-archive.json',
    'eternal-return': 'eternal-return.json',
    genshin: 'genshin.json',
    'sound-voltex': 'sound-voltex.json',
    djmax: 'djmax.json',
  };
  const PAGE_SIZE = 60;
  const THEME_COLORS = {
    'blue-archive': '#eaf1fa',
    'eternal-return': '#0d0f15',
    genshin: '#f0e9da',
    'sound-voltex': '#080a12',
    djmax: '#0a0810',
  };
  // SDVX 자켓 민감도 분류. 기준: docs/SDVX_JACKET_MODERATION.md
  const JACKET_CATEGORIES = ['●', '○', '□', '■'];

  // 원본 CDN마다 Referer 요구가 정반대라 호스트별로 정해야 한다.
  //  - cdn.donmai.us: Referer 없는 요청을 403으로 차단한다.
  //  - static.wikia.nocookie.net: Referer가 붙으면 404를 준다.
  // 따라서 기본은 no-referrer로 두고, Referer가 필요한 호스트만 예외로 origin을 보낸다.
  const REFERRER_REQUIRED_HOSTS = ['donmai.us'];
  function referrerPolicyFor(url) {
    try {
      const { hostname } = new URL(url, location.href);
      const needsReferrer = REFERRER_REQUIRED_HOSTS
        .some((host) => hostname === host || hostname.endsWith(`.${host}`));
      return needsReferrer ? 'strict-origin-when-cross-origin' : 'no-referrer';
    } catch {
      return 'no-referrer';
    }
  }

  const app = document.getElementById('app');
  const status = document.getElementById('status');
  const homeButton = document.getElementById('homeButton');
  const backButton = document.getElementById('backButton');
  const colorModeToggle = document.getElementById('colorModeToggle');
  const headerTitle = document.getElementById('headerTitle');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const routeActions = document.getElementById('routeActions');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxImageWrap = document.getElementById('lightboxImageWrap');
  const lightboxImageError = document.getElementById('lightboxImageError');
  const lightboxErrorSource = document.getElementById('lightboxErrorSource');
  const lightboxStage = document.getElementById('lightboxStage');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxMeta = document.getElementById('lightboxMeta');
  const lightboxSourceLabel = document.getElementById('lightboxSourceLabel');
  const lightboxTopMeta = document.getElementById('lightboxTopMeta');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const lightboxCounterMobile = document.getElementById('lightboxCounterMobile');
  const openSource = document.getElementById('openSource');
  const copyImageUrl = document.getElementById('copyImageUrl');
  const copyImageCrop = document.getElementById('copyImageCrop');
  const variantButtons = document.getElementById('variantButtons');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxPrevMobile = document.getElementById('lightboxPrevMobile');
  const lightboxNextMobile = document.getElementById('lightboxNextMobile');
  const cache = new Map();
  // 목록에서 보고 있던 순서(정렬·검색·그룹 필터 반영)를 상세로 넘겨 이전/다음 이동에 쓴다.
  let browseOrder = { gameId: '', ids: [] };
  let characterNav = null;
  const imageViewer = createImageViewer();
  window.CharGalleryViewer = imageViewer;
  let backPath = '';

  homeButton.addEventListener('click', () => navigate(''));
  backButton.addEventListener('click', () => navigate(backPath));
  colorModeToggle.addEventListener('click', toggleColorMode);
  window.addEventListener('hashchange', renderRoute);
  // 상세 화면에서 좌우 방향키로 캐릭터를 넘긴다. 라이트박스가 열려 있을 때는
  // 방향키가 이미지 이동에 쓰이므로 건드리지 않는다.
  document.addEventListener('keydown', (event) => {
    if (!characterNav || lightbox.open || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(characterNav.previous);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigate(characterNav.next);
    }
  });
  syncColorModeButton();

  function navigate(path) {
    const next = path ? `#/${path.replace(/^\/+/, '')}` : '#/';
    if (location.hash === next) renderRoute();
    else location.hash = next;
  }

  function setTheme(gameId = 'blue-archive') {
    const theme = DATA_FILES[gameId] ? gameId : 'blue-archive';
    document.documentElement.dataset.theme = theme;
    updateThemeColor();
  }

  function colorMode() {
    return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
  }

  function toggleColorMode() {
    const next = colorMode() === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.mode = 'dark';
    else delete document.documentElement.dataset.mode;
    try {
      localStorage.setItem('cg-mode', next);
    } catch {
      // Private browsing may make localStorage unavailable.
    }
    syncColorModeButton();
    updateThemeColor();
  }

  function syncColorModeButton() {
    const dark = colorMode() === 'dark';
    const label = dark ? '라이트 모드로' : '다크 모드로';
    colorModeToggle.setAttribute('aria-label', label);
    colorModeToggle.title = label;
  }

  function updateThemeColor() {
    if (!themeColor) return;
    const theme = document.documentElement.dataset.theme || 'blue-archive';
    const darkSurface = theme === 'blue-archive' ? '#0c111a' : '#121411';
    themeColor.content = colorMode() === 'dark' && ['blue-archive', 'genshin'].includes(theme)
      ? darkSurface
      : THEME_COLORS[theme] || THEME_COLORS['blue-archive'];
  }

  function setHeader({ title, subtitle = '', back = null }) {
    headerTitle.textContent = title || '캐릭터 아트 갤러리';
    headerSubtitle.textContent = subtitle || '';
    headerSubtitle.hidden = !subtitle;
    backPath = back ?? '';
    const hasBack = back !== null;
    backButton.hidden = !hasBack;
    homeButton.hidden = hasBack;
  }

  function setStatus(value = '') {
    status.textContent = value;
  }

  function setRouteActions(content = '') {
    routeActions.innerHTML = content;
    routeActions.hidden = !content;
    routeActions.parentElement.classList.toggle('has-route-actions', Boolean(content));
  }

  window.CharGalleryUI = { navigate, setTheme, setHeader, setStatus, setRouteActions, referrerPolicyFor };

  async function loadJson(name) {
    if (cache.has(name)) return cache.get(name);
    const promise = fetch(new URL(`./data/${name}`, document.baseURI), { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
    cache.set(name, promise);
    return promise;
  }

  function routeParts() {
    return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  }

  async function renderRoute() {
    window.scrollTo({ top: 0, behavior: 'auto' });
    const parts = routeParts();
    characterNav = null;
    setRouteActions('');
    app.innerHTML = '<div class="skeleton"></div>';
    try {
      if (!parts.length) return renderHome();
      if (parts[0] !== 'game' || !parts[1]) return renderNotFound();
      const gameId = parts[1];
      if (!DATA_FILES[gameId]) return renderNotFound();
      if (parts[2] === 'skins') return;
      if (parts[2] === 'character' && parts[3]) return renderCharacter(gameId, parts[3]);
      if (gameId === 'sound-voltex' && parts[2] === 'jackets') {
        const data = await loadJson(DATA_FILES[gameId]);
        return renderJackets(data);
      }
      return renderGame(gameId);
    } catch (error) {
      console.error(error);
      renderLoadError(error);
    }
  }

  async function renderHome() {
    setTheme('blue-archive');
    setHeader({ title: '캐릭터 아트 갤러리', subtitle: '공식 일러부터 팬아트까지' });
    const manifest = await loadJson('manifest.json');
    setStatus(manifest.generatedAt ? `갱신 ${formatDate(manifest.generatedAt)}` : '');
    const cards = manifest.games.map((game) => `
      <article class="game-card" data-game="${escapeAttr(game.id)}" tabindex="0" role="link">
        <div class="game-card-bg"></div>
        <div class="game-card-glow"></div>
        <div class="game-card-vignette"></div>
        <div class="game-card-art">
          ${game.coverImage ? `<img src="${escapeAttr(game.coverImage)}" alt="${escapeAttr(game.name)}" loading="${game.id === 'blue-archive' ? 'eager' : 'lazy'}" referrerpolicy="${referrerPolicyFor(game.coverImage)}">` : '<span aria-hidden="true">✦</span>'}
        </div>
        <div class="game-card-content">
          <h2>${escapeHtml(game.name)}</h2>
          <p>${escapeHtml(game.description || '')}</p>
        </div>
      </article>
    `).join('');
    app.innerHTML = `
      <section class="hero">
        <h1>게임을 선택하세요</h1>
        <p>썸네일로 캐릭터를 고르고 · 의상별 스탠딩과 일러를 감상하세요.</p>
      </section>
      <section class="game-grid">${cards}</section>
    `;
    app.querySelectorAll('[data-game]').forEach((card) => {
      const go = () => navigate(`game/${card.dataset.game}`);
      card.addEventListener('click', go);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
    });
  }

  async function renderGame(gameId) {
    setTheme(gameId);
    const data = await loadJson(DATA_FILES[gameId]);
    const title = data.game?.name || gameId;
    const characters = Array.isArray(data.characters) ? data.characters : [];
    const groups = [...new Set(characters.map((character) => character.group).filter(Boolean))];
    const sourceIndex = new Map(characters.map((character, index) => [character.id, index]));
    const capabilities = sortCapabilities(data, characters);
    let activeGroup = '';
    let query = '';
    const defaultMode = defaultSort(gameId, capabilities);
    let sortMode = defaultMode;

    setStatus(data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '');
    setHeader({ title, subtitle: `${characters.length}명`, back: '' });
    setRouteActions(`
      <label class="header-search">
        <span class="search-icon" aria-hidden="true">${searchIcon()}</span>
        <input id="headerSearch" type="search" placeholder="이름 검색 (한/영/일)" autocomplete="off">
      </label>
      <label class="header-sort">
        <span aria-hidden="true">⇅</span>
        <select id="headerSort" aria-label="정렬 기준">${sortOptions(gameId, defaultMode, capabilities)}</select>
        <span aria-hidden="true">▾</span>
      </label>
    `);

    const entry = gameId === 'sound-voltex'
      ? '<button class="feature-link" type="button" data-jackets-entry><span>모든 곡 자켓 보기</span><span aria-hidden="true">→</span></button>'
      : ['blue-archive', 'eternal-return', 'genshin'].includes(gameId)
        ? `<button class="feature-link" type="button" data-skins-entry="${escapeAttr(gameId)}"><span>전체 스킨 최신순 보기</span><span aria-hidden="true">→</span></button>`
        : '';

    app.innerHTML = `
      ${entry}
      ${data.stale
        ? '<div class="notice">원본 갱신이 지연되어 마지막 정상 데이터를 표시합니다.</div>'
        : data.error ? '<div class="error">일부 원본 데이터를 갱신하지 못했습니다. 마지막 생성 결과만 표시합니다.</div>' : ''}
      <div class="mobile-character-controls">
        <label class="mobile-search">
          <span class="search-icon" aria-hidden="true">${searchIcon()}</span>
          <input id="mobileSearch" type="search" placeholder="이름 검색 (한/영/일)" autocomplete="off">
        </label>
        <select id="mobileSort" aria-label="정렬 기준">${sortOptions(gameId, defaultMode, capabilities)}</select>
      </div>
      ${groups.length > 1 ? `<div id="groupChips" class="filter-chips"><button class="filter-chip active" type="button" data-group="">전체</button>${groups.map((group) => `<button class="filter-chip" type="button" data-group="${escapeAttr(group)}">${escapeHtml(group)}</button>`).join('')}</div>` : ''}
      <div class="section-title"><h2>캐릭터</h2><span id="count"></span></div>
      <section id="characterGrid" class="character-grid"></section>
    `;

    const searchInputs = [document.getElementById('headerSearch'), document.getElementById('mobileSearch')].filter(Boolean);
    const sortInputs = [document.getElementById('headerSort'), document.getElementById('mobileSort')].filter(Boolean);
    const grid = document.getElementById('characterGrid');
    const count = document.getElementById('count');

    const update = () => {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      let rows = characters.filter((character) => {
        const text = [character.names?.ko, character.names?.en, character.names?.ja, character.id, character.group]
          .filter(Boolean).join(' ').toLocaleLowerCase();
        return (!normalizedQuery || text.includes(normalizedQuery)) && (!activeGroup || character.group === activeGroup);
      });
      rows = sortCharacters(rows, sortMode, sourceIndex);
      // 상세에서 이전/다음이 지금 보고 있는 목록 순서를 그대로 따르게 한다.
      browseOrder = { gameId, ids: rows.map((character) => character.id) };
      count.textContent = `${rows.length}명`;
      headerSubtitle.textContent = `${rows.length}명`;
      headerSubtitle.hidden = false;
      grid.innerHTML = rows.length ? rows.map((character, index) => `
        <article class="character-card" data-id="${escapeAttr(character.id)}" tabindex="0" role="link" style="animation-delay:${Math.min(index, 20) * 18}ms">
          <div class="art">
            ${character.profileImage
              ? `<img src="${escapeAttr(character.profileImage)}" alt="${escapeAttr(displayName(character))}" loading="${index < 24 ? 'eager' : 'lazy'}" referrerpolicy="${referrerPolicyFor(character.profileImage)}">`
              : `<div class="empty">${escapeHtml(displayName(character))}</div>`}
          </div>
          <div class="info"><strong>${escapeHtml(displayName(character))}</strong><small>${escapeHtml(character.group || character.names?.en || '')}</small></div>
        </article>
      `).join('') : `<div class="empty">${characters.length ? '검색 결과가 없어요.' : gameId === 'sound-voltex' ? 'SDVX 캐릭터 데이터가 준비되면 이 화면에 기존과 같은 목록으로 표시됩니다.' : '표시할 캐릭터가 없습니다.'}</div>`;
      grid.querySelectorAll('[data-id]').forEach((card) => {
        const go = () => navigate(`game/${gameId}/character/${encodeURIComponent(card.dataset.id)}`);
        card.addEventListener('click', go);
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            go();
          }
        });
      });
    };

    searchInputs.forEach((input) => {
      input.addEventListener('input', () => {
        query = input.value;
        searchInputs.forEach((other) => {
          if (other !== input && other.value !== query) other.value = query;
        });
        update();
      });
    });
    sortInputs.forEach((select) => {
      select.addEventListener('change', () => {
        sortMode = select.value;
        sortInputs.forEach((other) => {
          if (other !== select && other.value !== sortMode) other.value = sortMode;
        });
        update();
      });
    });
    app.querySelectorAll('[data-group]').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeGroup = chip.dataset.group || '';
        app.querySelectorAll('[data-group]').forEach((node) => node.classList.toggle('active', node === chip));
        update();
      });
    });
    app.querySelector('[data-jackets-entry]')?.addEventListener('click', () => navigate('game/sound-voltex/jackets'));
    app.querySelector('[data-skins-entry]')?.addEventListener('click', () => navigate(`game/${gameId}/skins`));
    update();
  }

  function searchIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle><path d="M20 20l-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>';
  }

  function sortCapabilities(data, characters) {
    return {
      popularity: Boolean(data.sortMetadata?.popularity?.available)
        || characters.some((character) => Number(character.popularityScore) > 0),
      release: Boolean(data.sortMetadata?.release?.available)
        || characters.some((character) => Boolean(character.releasedAt)),
    };
  }

  // 상세 화면의 이전/다음 대상. 목록을 거쳐 들어왔으면 그때 보던 순서를,
  // 링크로 바로 들어왔으면 그 게임의 기본 정렬 순서를 쓴다.
  function characterNeighbors(gameId, data, characterId) {
    const characters = Array.isArray(data.characters) ? data.characters : [];
    let ids = browseOrder.gameId === gameId ? browseOrder.ids : [];
    if (!ids.includes(characterId)) {
      const sourceIndex = new Map(characters.map((character, index) => [character.id, index]));
      const mode = defaultSort(gameId, sortCapabilities(data, characters));
      ids = sortCharacters(characters, mode, sourceIndex).map((character) => character.id);
    }
    const index = ids.indexOf(characterId);
    if (index < 0 || ids.length < 2) return null;
    const byId = new Map(characters.map((character) => [character.id, character]));
    const at = (offset) => byId.get(ids[(index + offset + ids.length) % ids.length]);
    return { previous: at(-1), next: at(1), position: index + 1, total: ids.length };
  }

  function characterNavBar(gameId, neighbors) {
    if (!neighbors) return '';
    const link = (character, direction, label) => `
      <button class="character-nav-button ${direction}" type="button" data-character-nav="${escapeAttr(character.id)}">
        <span class="character-nav-arrow" aria-hidden="true">${direction === 'prev' ? '‹' : '›'}</span>
        <span class="character-nav-text">
          <small>${label}</small>
          <strong>${escapeHtml(displayName(character))}</strong>
        </span>
      </button>`;
    return `
      <nav class="character-nav" aria-label="캐릭터 이동">
        ${link(neighbors.previous, 'prev', '이전')}
        <span class="character-nav-count">${neighbors.position} / ${neighbors.total}</span>
        ${link(neighbors.next, 'next', '다음')}
      </nav>`;
  }

  function defaultSort(gameId, capabilities) {
    if (gameId === 'blue-archive' && capabilities.popularity) return 'popularity';
    if (gameId === 'eternal-return' && capabilities.release) return 'release';
    return 'source';
  }

  function sortOptions(gameId, selected, capabilities) {
    const modes = gameId === 'blue-archive'
      ? capabilities.popularity
        ? [['popularity', '인기순'], ['ko', '가나다순']]
        : [['source', '기본순'], ['ko', '가나다순']]
      : gameId === 'eternal-return'
        ? capabilities.release
          ? [['release', '출시순'], ['ko', '가나다순'], ['en', 'A–Z']]
          : [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']]
        : [['source', '기본순'], ['ko', '가나다순'], ['en', 'A–Z']];
    return modes.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
  }

  function sortCharacters(rows, mode, sourceIndex) {
    if (mode === 'source') return [...rows].sort((a, b) => (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0));
    if (mode === 'ko') return [...rows].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ko', { numeric: true }));
    if (mode === 'en') {
      return [...rows].sort((a, b) => (a.names?.en || displayName(a)).localeCompare(b.names?.en || displayName(b), 'en', { numeric: true }));
    }
    if (mode === 'popularity') {
      return [...rows].sort((a, b) => {
        const aScore = Number(a.popularityScore ?? a.popularity ?? 0);
        const bScore = Number(b.popularityScore ?? b.popularity ?? 0);
        return bScore - aScore
          || displayName(a).localeCompare(displayName(b), 'ko', { numeric: true })
          || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0);
      });
    }
    if (mode === 'release') {
      return [...rows].sort((a, b) => {
        const aOrder = Number(a.releaseOrder ?? a.additionOrder);
        const bOrder = Number(b.releaseOrder ?? b.additionOrder);
        const safeA = Number.isFinite(aOrder) ? aOrder : Number.MAX_SAFE_INTEGER;
        const safeB = Number.isFinite(bOrder) ? bOrder : Number.MAX_SAFE_INTEGER;
        return safeA - safeB
          || displayName(a).localeCompare(displayName(b), 'ko', { numeric: true })
          || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0);
      });
    }
    return rows;
  }

  async function renderCharacter(gameId, characterId) {
    setTheme(gameId);
    const data = await loadJson(DATA_FILES[gameId]);
    const character = (data.characters || []).find((item) => item.id === characterId);
    if (!character) return renderNotFound();
    const images = Array.isArray(character.images) ? character.images.filter((image) => image.url) : [];
    const name = displayName(character);
    const english = character.names?.en && character.names.en !== name ? character.names.en : '';
    const neighbors = characterNeighbors(gameId, data, characterId);
    const navBar = characterNavBar(gameId, neighbors);
    setStatus(data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '');
    setHeader({ title: name, subtitle: english, back: `game/${gameId}` });
    app.innerHTML = `
      ${data.stale
        ? '<div class="notice">원본 갱신이 지연되어 마지막 정상 데이터를 표시합니다.</div>'
        : data.error ? '<div class="error">일부 원본 데이터를 갱신하지 못했습니다. 마지막 생성 결과만 표시합니다.</div>' : ''}
      ${navBar}
      <div class="section-title"><h2>${gameId === 'sound-voltex' ? '공식 이미지' : '스탠딩 · 의상'}</h2><span>${images.length}종</span></div>
      <section class="standing-grid">
        ${images.length ? images.map((image, index) => detailCard(image, index)).join('') : '<div class="empty">공식 이미지를 찾지 못했어요.</div>'}
      </section>
      ${navBar}
    `;
    app.querySelectorAll('[data-image-index]').forEach((card) => {
      card.addEventListener('click', () => imageViewer.open(images, Number(card.dataset.imageIndex)));
    });
    app.querySelectorAll('[data-character-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        navigate(`game/${gameId}/character/${encodeURIComponent(button.dataset.characterNav)}`);
      });
    });
    characterNav = neighbors ? {
      previous: `game/${gameId}/character/${encodeURIComponent(neighbors.previous.id)}`,
      next: `game/${gameId}/character/${encodeURIComponent(neighbors.next.id)}`,
    } : null;
  }

  function detailCard(image, index) {
    const label = image.group || image.type || '기본';
    const landscape = Number(image.width) > Number(image.height) * 1.15;
    return `
      <button class="standing-card${landscape ? ' landscape' : ''}" type="button" data-image-index="${index}" aria-label="${escapeAttr(`${label} 크게 보기`)}">
        <span class="badge">${escapeHtml(label)}</span>
        <div class="art"><img src="${escapeAttr(image.thumbUrl || image.url)}" alt="${escapeAttr(label)}" loading="${index < 3 ? 'eager' : 'lazy'}" referrerpolicy="${referrerPolicyFor(image.thumbUrl || image.url)}"></div>
      </button>
    `;
  }

  function renderJackets(data) {
    setTheme('sound-voltex');
    const jackets = Array.isArray(data.jackets) ? data.jackets : [];
    const hasCategory = jackets.some((jacket) => jacket.category);
    const categories = JACKET_CATEGORIES.filter((value) => jackets.some((jacket) => jacket.category === value));
    const hasPopularity = jackets.some((jacket) => jacket.popularity != null);
    let shown = PAGE_SIZE;
    let visibleRows = [];

    setStatus(data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '');
    setHeader({ title: '모든 곡 자켓', subtitle: `${jackets.length}곡`, back: 'game/sound-voltex' });
    app.innerHTML = `
      ${data.stale
        ? '<div class="notice">원본 갱신이 지연되어 마지막 정상 자켓 데이터를 표시합니다.</div>'
        : data.error ? '<div class="error">최신 카탈로그 생성 중 일부 원본 요청이 실패했습니다.</div>' : ''}
      <div class="toolbar jacket-toolbar${hasCategory ? ' has-category' : ''}">
        <input id="search" type="search" placeholder="곡 또는 캐릭터 검색" autocomplete="off">
        <select id="level" aria-label="레벨 필터"><option value="">모든 레벨</option>${levelOptions(jackets)}</select>
        ${hasCategory ? `<select id="category" aria-label="자켓 분류"><option value="">전체</option>${categories.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('')}</select>` : ''}
        <select id="sort" aria-label="정렬">
          ${hasPopularity ? '<option value="popular">인기순</option>' : ''}
          <option value="newest" selected>발매일 최신순 ↓</option>
          <option value="oldest">발매일 오래된순 ↑</option>
          <option value="name">이름순</option>
          <option value="level-high">레벨 높은순</option>
          <option value="level-low">레벨 낮은순</option>
        </select>
      </div>
      <div class="section-title"><h2>모든 곡 자켓</h2><span id="count"></span></div>
      <section id="jacketGrid" class="jacket-grid"></section>
      <button id="jacketMore" class="button load-more" type="button" hidden></button>
    `;

    const search = document.getElementById('search');
    const level = document.getElementById('level');
    const category = document.getElementById('category');
    const sort = document.getElementById('sort');
    const grid = document.getElementById('jacketGrid');
    const count = document.getElementById('count');
    const more = document.getElementById('jacketMore');

    const update = (reset = false) => {
      if (reset) shown = PAGE_SIZE;
      const query = search.value.trim().toLocaleLowerCase();
      const selectedLevel = level.value ? Number(level.value) : null;
      let rows = jackets.filter((jacket) => {
        const text = `${jacket.title || jacket.group || ''} ${jacket.artist || ''} ${jacket.character?.names?.ko || ''} ${jacket.character?.names?.en || ''}`.toLocaleLowerCase();
        const levels = (jacket.variants || []).flatMap((variant) => variant.levels || (variant.level == null ? [] : [variant.level]));
        return (!query || text.includes(query))
          && (selectedLevel == null || levels.includes(selectedLevel))
          && (!category || !category.value || jacket.category === category.value);
      });
      rows = rows.map((jacket) => {
        if (selectedLevel == null) return jacket;
        const matched = (jacket.variants || []).find((variant) => (variant.levels || (variant.level == null ? [] : [variant.level])).includes(selectedLevel));
        return matched ? { ...jacket, url: matched.url } : jacket;
      });
      rows = [...rows].sort((a, b) => {
        if (sort.value === 'name') return (a.title || a.group || '').localeCompare(b.title || b.group || '', 'ko');
        if (sort.value === 'oldest') return (a.releasedAt || '9999').localeCompare(b.releasedAt || '9999');
        if (sort.value === 'level-high') return maxLevel(b) - maxLevel(a);
        if (sort.value === 'level-low') return maxLevel(a) - maxLevel(b);
        if (sort.value === 'popular') {
          return Number(b.popularity ?? 0) - Number(a.popularity ?? 0)
            || (b.releasedAt || '0000').localeCompare(a.releasedAt || '0000');
        }
        return (b.releasedAt || '0000').localeCompare(a.releasedAt || '0000');
      });
      visibleRows = rows.slice(0, shown);
      count.textContent = `${rows.length}곡`;
      headerSubtitle.textContent = `${rows.length}곡`;
      headerSubtitle.hidden = false;
      grid.innerHTML = visibleRows.length ? visibleRows.map((jacket, index) => jacketCard(jacket, index, selectedLevel)).join('') : '<div class="empty">조건에 맞는 자켓이 없어요.</div>';
      grid.querySelectorAll('[data-image-index]').forEach((card) => {
        card.addEventListener('click', () => imageViewer.open(visibleRows, Number(card.dataset.imageIndex)));
      });
      const remaining = rows.length - shown;
      more.hidden = remaining <= 0;
      more.textContent = remaining > 0 ? `더 보기 · ${remaining}곡` : '';
    };

    search.addEventListener('input', () => update(true));
    level.addEventListener('change', () => update(true));
    category?.addEventListener('change', () => update(true));
    sort.addEventListener('change', () => update(true));
    more.addEventListener('click', () => { shown += PAGE_SIZE; update(); });
    update();
  }

  function jacketCard(jacket, index, selectedLevel) {
    const title = jacket.title || jacket.group || '곡 자켓';
    const artist = jacket.character?.names?.ko || jacket.character?.names?.en || jacket.artist || '';
    const level = selectedLevel ?? maxLevel(jacket);
    return `
      <article class="jacket-card">
        <button class="art" type="button" data-image-index="${index}" aria-label="${escapeAttr(`${title} 크게 보기`)}">
          ${level > 0 ? `<span class="badge">Lv ${escapeHtml(level)}</span>` : ''}
          ${jacket.category ? `<span class="category" aria-label="분류 ${escapeAttr(jacket.category)}">${escapeHtml(jacket.category)}</span>` : ''}
          <img src="${escapeAttr(jacket.thumbUrl || jacket.url)}" alt="${escapeAttr(title)}" loading="lazy" referrerpolicy="${referrerPolicyFor(jacket.thumbUrl || jacket.url)}">
        </button>
        <div class="info">
          <strong>${escapeHtml(title)}</strong>
          <div class="meta"><span>${escapeHtml(artist)}</span>${jacket.releasedAt ? `<time datetime="${escapeAttr(jacket.releasedAt)}">${escapeHtml(jacket.releasedAt)}</time>` : ''}</div>
        </div>
      </article>
    `;
  }

  function createImageViewer() {
    const SOURCE_LABELS = {
      official_standing: '공식 · 스탠딩',
      official_skin: '공식 · 코스튬',
      official_misc: '공식 이미지',
      fanart: '팬아트',
    };
    const DIFF_COLORS = {
      NOV: '#8b5cf6',
      ADV: '#f5c518',
      EXH: '#ff4757',
      MXM: '#d7dee6',
      INF: '#ff3da5',
      GRV: '#ff7a18',
      HVN: '#3dd8ff',
      VVD: '#ff5fa2',
      XCD: '#3d7bff',
      기본: '#9aa4b2',
    };
    const LIGHT_VARIANTS = new Set(['MXM', '기본']);
    const pointers = new Map();
    let items = [];
    let itemIndex = 0;
    let variantIndex = 0;
    let scale = 1;
    let offset = { x: 0, y: 0 };
    let segment = null;
    let dragging = false;
    let historyEntryActive = false;
    let returnFocus = null;
    let bodyStyle = null;
    let copyResetTimer = 0;
    let cropResetTimer = 0;
    // 좁은 화면에서는 액션 바가 4칸이라 긴 라벨이 들어가지 않는다.
    const cropLabel = () => (window.matchMedia('(max-width: 639px)').matches ? '영역 복사' : '보이는 영역 복사');
    const CROP_HINT = '확대·이동한 상태로 화면에 보이는 부분만 이미지로 복사합니다';
    const CROP_BLOCKED_HINT = '이 이미지의 원본 서버가 브라우저의 이미지 추출을 허용하지 않습니다. 주소 복사를 사용하세요.';

    function variantsFor(item = items[itemIndex]) {
      return Array.isArray(item?.variants) ? item.variants.filter((variant) => variant?.url) : [];
    }

    function shownUrl() {
      const item = items[itemIndex];
      const variants = variantsFor(item);
      return variants[variantIndex]?.url || item?.url || '';
    }

    function characterName(item) {
      return item?.character?.names?.ko
        || item?.character?.names?.en
        || item?.character?.names?.ja
        || item?.characterId
        || '';
    }

    function viewerTitle(item) {
      if (item?.viewerTitle) return item.viewerTitle;
      if (item?.skinName) {
        return [characterName(item), item.skinName].filter(Boolean).join(' · ');
      }
      return item?.group || item?.title || item?.artist || '이미지';
    }

    function viewerMeta(item) {
      if (item?.viewerMeta) return item.viewerMeta;
      if (item?.upcoming) {
        return `출시 예정${item.releaseDate ? ` · ${shortDate(item.releaseDate)}` : ''}`;
      }
      if (item?.releaseVersion) return `버전 ${item.releaseVersion}`;
      if (item?.releasedAt && item?.skinName) return `출시 ${shortDate(item.releasedAt)}`;
      if (item?.sourceType === 'official_standing' && item?.skinName) return '기본 스탠딩';
      if (item?.sourceType === 'official_skin' && item?.skinName) return '공식 의상';
      return [item?.artist, item?.releasedAt, item?.type].filter(Boolean).join(' · ');
    }

    function sourceLabel(item) {
      if (SOURCE_LABELS[item?.sourceType]) return SOURCE_LABELS[item.sourceType];
      if (variantsFor(item).length) return 'SOUND VOLTEX · 자켓';
      if (item?.type === '기본') return SOURCE_LABELS.official_standing;
      if (item?.type === '의상') return SOURCE_LABELS.official_skin;
      return '공식 이미지';
    }

    function shortDate(value) {
      const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
      return match ? `${Number(match[1])}/${Number(match[2])}` : value || '';
    }

    function variantLabel(variant) {
      const levels = Array.isArray(variant.levels)
        ? variant.levels
        : variant.level == null ? [] : [variant.level];
      const numericLevels = levels.map(Number).filter(Number.isFinite);
      const level = numericLevels.length ? ` · Lv ${Math.max(...numericLevels)}` : '';
      return `${variant.difficulty || '기본'}${level}`;
    }

    function diffColor(difficulty) {
      const key = String(difficulty || '기본').toUpperCase();
      return DIFF_COLORS[key] || DIFF_COLORS[difficulty] || DIFF_COLORS.기본;
    }

    function lockBody() {
      if (bodyStyle) return;
      bodyStyle = {
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
      };
      const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      const currentPadding = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.overflow = 'hidden';
      if (scrollbar) document.body.style.paddingRight = `${currentPadding + scrollbar}px`;
      document.body.classList.add('lightbox-open');
    }

    function unlockBody() {
      if (!bodyStyle) return;
      document.body.style.overflow = bodyStyle.overflow;
      document.body.style.paddingRight = bodyStyle.paddingRight;
      document.body.classList.remove('lightbox-open');
      bodyStyle = null;
    }

    function applyTransform(nextScale, nextOffset, animate = !dragging) {
      scale = nextScale;
      offset = nextOffset;
      lightboxImageWrap.style.transition = animate ? 'transform .18s ease-out' : 'none';
      lightboxImageWrap.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`;
      lightboxImageWrap.classList.toggle('is-zoomed', scale > 1);
      lightboxImageWrap.classList.toggle('is-dragging', dragging);
    }

    function resetTransform() {
      dragging = false;
      pointers.clear();
      segment = null;
      applyTransform(1, { x: 0, y: 0 });
    }

    function clampScale(value) {
      return Math.min(6, Math.max(1, value));
    }

    function clampOffset(x, y, nextScale) {
      const stageRect = lightboxStage.getBoundingClientRect();
      const width = lightboxImage.offsetWidth || lightboxImageWrap.offsetWidth;
      const height = lightboxImage.offsetHeight || lightboxImageWrap.offsetHeight;
      const maxX = Math.max(0, (width * nextScale - stageRect.width) / 2) + 48;
      const maxY = Math.max(0, (height * nextScale - stageRect.height) / 2) + 48;
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    }

    function centroid(points) {
      const total = points.reduce((sum, point) => ({
        x: sum.x + point.x,
        y: sum.y + point.y,
      }), { x: 0, y: 0 });
      return { x: total.x / points.length, y: total.y / points.length };
    }

    function startSegment() {
      const points = [...pointers.values()];
      if (!points.length) return;
      const rect = lightboxStage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const center = centroid(points);
      const distance = points.length >= 2
        ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1
        : 0;
      segment = {
        centerX,
        centerY,
        scale,
        distance,
        focalX: (center.x - centerX - offset.x) / scale,
        focalY: (center.y - centerY - offset.y) / scale,
        startX: center.x,
        startY: center.y,
        moved: segment?.moved || false,
      };
    }

    function zoomToPoint(clientX, clientY) {
      const rect = lightboxStage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const nextScale = 2.2;
      const focalX = (clientX - centerX - offset.x) / scale;
      const focalY = (clientY - centerY - offset.y) / scale;
      applyTransform(
        nextScale,
        clampOffset(
          clientX - centerX - nextScale * focalX,
          clientY - centerY - nextScale * focalY,
          nextScale,
        ),
      );
    }

    function onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        lightboxImageWrap.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional on older mobile browsers.
      }
      dragging = true;
      startSegment();
      applyTransform(scale, offset, false);
    }

    function onPointerMove(event) {
      if (!pointers.has(event.pointerId) || !segment) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.values()];
      const center = centroid(points);
      if (Math.hypot(center.x - segment.startX, center.y - segment.startY) > 6) {
        segment.moved = true;
      }

      let nextScale = segment.scale;
      if (points.length >= 2 && segment.distance) {
        const distance = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y,
        );
        nextScale = clampScale(segment.scale * (distance / segment.distance));
        if (Math.abs(nextScale - segment.scale) > .02) segment.moved = true;
      }
      if (points.length < 2 && scale <= 1 && nextScale <= 1) return;

      applyTransform(
        nextScale,
        clampOffset(
          center.x - segment.centerX - nextScale * segment.focalX,
          center.y - segment.centerY - nextScale * segment.focalY,
          nextScale,
        ),
        false,
      );
    }

    function finishPointer(event, cancelled = false) {
      const completed = segment;
      const before = pointers.size;
      pointers.delete(event.pointerId);
      if (pointers.size) {
        startSegment();
        return;
      }

      dragging = false;
      segment = null;
      applyTransform(scale, offset);
      if (cancelled || !completed) return;

      if (before === 1 && !completed.moved) {
        if (scale > 1) resetTransform();
        else zoomToPoint(event.clientX, event.clientY);
      } else if (before === 1 && scale <= 1) {
        const dx = event.clientX - completed.startX;
        const dy = event.clientY - completed.startY;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          move(dx > 0 ? -1 : 1);
        }
      }
      if (scale <= 1) resetTransform();
    }

    function showImage() {
      const item = items[itemIndex];
      const url = shownUrl();
      resetTransform();
      lightboxImageError.hidden = true;
      lightboxImage.hidden = false;
      lightboxImage.classList.remove('is-loaded');
      lightboxImage.classList.add('is-loading');
      lightboxImage.alt = `${viewerTitle(item)}${variantsFor(item)[variantIndex]?.difficulty ? ` ${variantsFor(item)[variantIndex].difficulty}` : ''}`;
      lightboxImage.referrerPolicy = referrerPolicyFor(url);
      lightboxImage.src = url;
      lightboxErrorSource.href = item?.sourceUrl || url;
      openSource.href = item?.sourceUrl || url;
      resetCopyButton();
      requestAnimationFrame(() => {
        if (!lightboxImage.complete) return;
        if (lightboxImage.naturalWidth > 0) markImageLoaded();
        else markImageFailed();
      });
    }

    function markImageLoaded() {
      lightboxImage.classList.remove('is-loading');
      lightboxImage.classList.add('is-loaded');
      lightboxImageError.hidden = true;
      lightboxImage.hidden = false;
    }

    function markImageFailed() {
      lightboxImage.classList.remove('is-loading', 'is-loaded');
      lightboxImage.hidden = true;
      lightboxImageError.hidden = false;
    }

    function updateVariantButtons() {
      const variants = variantsFor();
      variantButtons.querySelectorAll('button').forEach((button, index) => {
        const variant = variants[index];
        const active = index === variantIndex;
        const difficulty = String(variant?.difficulty || '기본').toUpperCase();
        const color = diffColor(difficulty);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.style.borderColor = color;
        button.style.background = active ? color : `${color}1f`;
        button.style.color = active && LIGHT_VARIANTS.has(difficulty) ? '#0a0e16' : color;
        button.style.boxShadow = active ? `0 0 16px ${color}, 0 0 4px ${color}` : 'none';
      });
    }

    function renderVariants() {
      const variants = variantsFor();
      variantButtons.replaceChildren();
      variantButtons.hidden = variants.length <= 1;
      if (variants.length <= 1) return;
      variants.forEach((variant, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lightbox-variant';
        button.textContent = variantLabel(variant);
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          variantIndex = index;
          updateVariantButtons();
          showImage();
        });
        variantButtons.appendChild(button);
      });
      updateVariantButtons();
    }

    function updateNavigation() {
      const canNavigate = items.length > 1 || variantsFor().length > 1;
      [lightboxPrev, lightboxNext, lightboxPrevMobile, lightboxNextMobile].forEach((button) => {
        button.disabled = !canNavigate;
      });
    }

    function preloadAround() {
      if (!items.length) return;
      const urls = new Set(variantsFor().map((variant) => variant.url));
      const previous = items[(itemIndex - 1 + items.length) % items.length];
      const next = items[(itemIndex + 1) % items.length];
      [previous, next].forEach((item) => {
        const variants = variantsFor(item);
        const url = variants[0]?.url || item?.url;
        if (url) urls.add(url);
      });
      urls.delete(shownUrl());
      urls.forEach((url) => {
        const image = new Image();
        image.referrerPolicy = referrerPolicyFor(url);
        image.src = url;
      });
    }

    function renderItem() {
      const item = items[itemIndex];
      if (!item) return;
      variantIndex = Math.min(variantIndex, Math.max(0, variantsFor(item).length - 1));
      const count = `${itemIndex + 1} / ${items.length}`;
      lightboxTitle.textContent = viewerTitle(item);
      lightboxMeta.textContent = viewerMeta(item);
      lightboxMeta.hidden = !lightboxMeta.textContent;
      lightboxSourceLabel.textContent = sourceLabel(item);
      lightboxTopMeta.textContent = item.artist ? `by ${item.artist}` : '';
      lightboxTopMeta.hidden = !lightboxTopMeta.textContent;
      lightboxCounter.textContent = count;
      lightboxCounterMobile.textContent = count;
      renderVariants();
      updateNavigation();
      showImage();
      preloadAround();
    }

    function move(direction) {
      if (!items.length) return;
      const variants = variantsFor();
      if (items.length === 1 && variants.length <= 1) return;
      resetTransform();
      if (direction > 0 && variantIndex < variants.length - 1) {
        variantIndex += 1;
        updateVariantButtons();
        showImage();
        return;
      }
      if (direction < 0 && variantIndex > 0) {
        variantIndex -= 1;
        updateVariantButtons();
        showImage();
        return;
      }
      itemIndex = (itemIndex + direction + items.length) % items.length;
      variantIndex = 0;
      renderItem();
    }

    function resetCopyButton() {
      window.clearTimeout(copyResetTimer);
      copyImageUrl.textContent = '주소 복사';
      copyImageUrl.classList.remove('is-success', 'is-error');
      window.clearTimeout(cropResetTimer);
      copyImageCrop.textContent = cropLabel();
      copyImageCrop.classList.remove('is-success', 'is-error');
      copyImageCrop.title = CROP_HINT;
    }

    // 확대·이동한 상태에서 화면에 실제로 보이는 영역만 잘라 PNG로 복사한다.
    // stage 는 overflow: hidden 이라 이미지 사각형과 stage 사각형의 교집합이 보이는 부분이다.
    function visibleCropBox() {
      const imageRect = lightboxImage.getBoundingClientRect();
      const stageRect = lightboxStage.getBoundingClientRect();
      const left = Math.max(imageRect.left, stageRect.left);
      const top = Math.max(imageRect.top, stageRect.top);
      const right = Math.min(imageRect.right, stageRect.right);
      const bottom = Math.min(imageRect.bottom, stageRect.bottom);
      if (right - left < 2 || bottom - top < 2) return null;
      return { imageRect, left, top, right, bottom };
    }

    // 캔버스에서 픽셀을 읽으려면 CORS 모드로 받은 원본이어야 한다. 서버 프록시가 없으므로
    // 원본 CDN이 Access-Control-Allow-Origin 을 주지 않으면 이 기능은 쓸 수 없다.
    function loadCorsImage(url) {
      return new Promise((resolve, reject) => {
        const source = new Image();
        source.crossOrigin = 'anonymous';
        source.referrerPolicy = referrerPolicyFor(url);
        source.onload = () => resolve(source);
        source.onerror = () => reject(new Error('cors'));
        source.src = url;
      });
    }

    async function renderCropBlob(url, box) {
      const source = await loadCorsImage(url);
      const scaleX = source.naturalWidth / box.imageRect.width;
      const scaleY = source.naturalHeight / box.imageRect.height;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((box.right - box.left) * scaleX));
      canvas.height = Math.max(1, Math.round((box.bottom - box.top) * scaleY));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.drawImage(
        source,
        (box.left - box.imageRect.left) * scaleX,
        (box.top - box.imageRect.top) * scaleY,
        (box.right - box.left) * scaleX,
        (box.bottom - box.top) * scaleY,
        0, 0, canvas.width, canvas.height,
      );
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('blob');
      return blob;
    }

    async function copyVisibleCrop() {
      const url = shownUrl();
      const box = visibleCropBox();
      if (!url || !box) return;
      resetCopyButton();
      copyImageCrop.textContent = '복사 중…';
      try {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
          throw new Error('unsupported');
        }
        // Safari는 사용자 제스처 안에서 ClipboardItem이 만들어져야 하므로,
        // Blob을 await 하지 않고 Promise 상태로 그대로 넘긴다.
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': renderCropBlob(url, box) }),
        ]);
        copyImageCrop.textContent = '복사됨 ✓';
        copyImageCrop.classList.add('is-success');
      } catch {
        copyImageCrop.textContent = '복사 불가';
        copyImageCrop.classList.add('is-error');
        copyImageCrop.title = CROP_BLOCKED_HINT;
      }
      cropResetTimer = window.setTimeout(resetCopyButton, 2000);
    }

    async function copyCurrentUrl() {
      const url = shownUrl();
      if (!url) return;
      resetCopyButton();
      try {
        await navigator.clipboard.writeText(url);
        copyImageUrl.textContent = '복사됨 ✓';
        copyImageUrl.classList.add('is-success');
      } catch {
        window.prompt('이미지 주소를 복사하세요.', url);
        copyImageUrl.textContent = '직접 복사';
        copyImageUrl.classList.add('is-error');
      }
      copyResetTimer = window.setTimeout(resetCopyButton, 1600);
    }

    function open(nextItems, nextIndex = 0) {
      if (!Array.isArray(nextItems) || !nextItems.length) return;
      items = nextItems;
      itemIndex = Math.min(Math.max(Number(nextIndex) || 0, 0), items.length - 1);
      variantIndex = 0;
      if (!lightbox.open) {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        lockBody();
        if (typeof lightbox.showModal === 'function') lightbox.showModal();
        else lightbox.setAttribute('open', '');
        window.history.pushState({
          ...(window.history.state || {}),
          __charGalleryLightbox: true,
        }, '', window.location.href);
        historyEntryActive = true;
      }
      renderItem();
      document.getElementById('lightboxClose').focus({ preventScroll: true });
    }

    function close({ fromHistory = false } = {}) {
      if (!lightbox.open) return;
      if (typeof lightbox.close === 'function') lightbox.close();
      else lightbox.removeAttribute('open');
      unlockBody();
      resetTransform();
      items = [];
      itemIndex = 0;
      variantIndex = 0;
      lightboxImage.removeAttribute('src');
      if (historyEntryActive && !fromHistory) {
        historyEntryActive = false;
        window.history.back();
      } else if (fromHistory) {
        historyEntryActive = false;
      }
      returnFocus?.focus?.({ preventScroll: true });
      returnFocus = null;
    }

    document.getElementById('lightboxClose').addEventListener('click', () => close());
    lightboxPrev.addEventListener('click', () => move(-1));
    lightboxNext.addEventListener('click', () => move(1));
    lightboxPrevMobile.addEventListener('click', () => move(-1));
    lightboxNextMobile.addEventListener('click', () => move(1));
    copyImageUrl.addEventListener('click', copyCurrentUrl);
    copyImageCrop.addEventListener('click', copyVisibleCrop);
    lightboxImage.addEventListener('load', markImageLoaded);
    lightboxImage.addEventListener('error', markImageFailed);
    lightbox.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox || event.target === lightboxStage) close();
    });
    lightboxImageWrap.addEventListener('pointerdown', onPointerDown);
    lightboxImageWrap.addEventListener('pointermove', onPointerMove);
    lightboxImageWrap.addEventListener('pointerup', (event) => finishPointer(event));
    lightboxImageWrap.addEventListener('pointercancel', (event) => finishPointer(event, true));
    lightboxImageWrap.addEventListener('wheel', (event) => {
      if (!lightbox.open) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = lightboxStage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const nextScale = clampScale(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
      if (nextScale === 1) {
        resetTransform();
        return;
      }
      const focalX = (event.clientX - centerX - offset.x) / scale;
      const focalY = (event.clientY - centerY - offset.y) / scale;
      applyTransform(
        nextScale,
        clampOffset(
          event.clientX - centerX - nextScale * focalX,
          event.clientY - centerY - nextScale * focalY,
          nextScale,
        ),
      );
    }, { passive: false });
    document.addEventListener('keydown', (event) => {
      if (!lightbox.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      }
    });
    window.addEventListener('popstate', () => {
      if (lightbox.open) close({ fromHistory: true });
    });

    return { open, close, next: () => move(1), previous: () => move(-1) };
  }

  function renderLoadError(error) {
    setHeader({ title: '불러오기 실패', subtitle: '데이터를 확인할 수 없어요', back: '' });
    setStatus('데이터 로드 실패');
    app.innerHTML = `<div class="error">데이터를 불러오지 못했어요.<br><small>${escapeHtml(error.message || String(error))}</small><br><button class="button" type="button" data-retry>다시 시도</button></div>`;
    app.querySelector('[data-retry]').addEventListener('click', () => {
      cache.clear();
      renderRoute();
    });
  }

  function renderNotFound() {
    setTheme('blue-archive');
    setHeader({ title: '페이지를 찾을 수 없어요', subtitle: '', back: '' });
    setStatus('');
    app.innerHTML = '<div class="error">페이지를 찾을 수 없습니다.<br><button class="button" type="button" data-home>게임 목록으로</button></div>';
  }

  function displayName(character) {
    return character.names?.ko || character.names?.en || character.names?.ja || character.id;
  }
  function maxLevel(item) {
    return Math.max(0, ...(item.variants || []).flatMap((variant) => variant.levels || (variant.level == null ? [] : [variant.level])));
  }
  function levelOptions(jackets) {
    const levels = [...new Set(jackets.flatMap((jacket) => (jacket.variants || []).flatMap((variant) => variant.levels || (variant.level == null ? [] : [variant.level]))))].sort((a, b) => b - a);
    return levels.map((value) => `<option value="${value}">레벨 ${value}</option>`).join('');
  }
  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  document.addEventListener('click', (event) => {
    const home = event.target.closest('[data-home]');
    if (home) navigate('');
  });

  if (!location.hash) location.hash = '#/';
  else renderRoute();
})();
