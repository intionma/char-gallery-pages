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

  const app = document.getElementById('app');
  const status = document.getElementById('status');
  const homeButton = document.getElementById('homeButton');
  const backButton = document.getElementById('backButton');
  const headerTitle = document.getElementById('headerTitle');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxMeta = document.getElementById('lightboxMeta');
  const openSource = document.getElementById('openSource');
  const copyImageUrl = document.getElementById('copyImageUrl');
  const variantButtons = document.getElementById('variantButtons');
  const cache = new Map();
  let currentLightboxItem = null;
  let currentVariant = null;
  let backPath = '';

  homeButton.addEventListener('click', () => navigate(''));
  backButton.addEventListener('click', () => navigate(backPath));
  document.getElementById('lightboxClose').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) lightbox.close();
  });
  copyImageUrl.addEventListener('click', async () => {
    const url = currentVariant?.url || currentLightboxItem?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copyImageUrl.textContent = '복사됨';
      setTimeout(() => { copyImageUrl.textContent = '이미지 주소 복사'; }, 1200);
    } catch {
      window.prompt('이미지 주소를 복사하세요.', url);
    }
  });
  window.addEventListener('hashchange', renderRoute);

  function navigate(path) {
    const next = path ? `#/${path.replace(/^\/+/, '')}` : '#/';
    if (location.hash === next) renderRoute();
    else location.hash = next;
  }

  function setTheme(gameId = 'blue-archive') {
    const theme = DATA_FILES[gameId] ? gameId : 'blue-archive';
    document.documentElement.dataset.theme = theme;
    if (themeColor) themeColor.content = THEME_COLORS[theme] || THEME_COLORS['blue-archive'];
  }

  function setHeader({ title, subtitle = '', back = null }) {
    headerTitle.textContent = title || '캐릭터 아트 갤러리';
    headerSubtitle.textContent = subtitle || '';
    headerSubtitle.hidden = !subtitle;
    backPath = back || '';
    backButton.hidden = !back;
    homeButton.hidden = Boolean(back);
  }

  function setStatus(value = '') {
    status.textContent = value;
  }

  window.CharGalleryUI = { navigate, setTheme, setHeader, setStatus };

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
    app.innerHTML = '<div class="skeleton"></div>';
    try {
      if (!parts.length) return renderHome();
      if (parts[0] !== 'game' || !parts[1]) return renderNotFound();
      const gameId = parts[1];
      if (!DATA_FILES[gameId]) return renderNotFound();
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
          ${game.coverImage ? `<img src="${escapeAttr(game.coverImage)}" alt="${escapeAttr(game.name)}" loading="${game.id === 'blue-archive' ? 'eager' : 'lazy'}" referrerpolicy="no-referrer">` : '<span aria-hidden="true">✦</span>'}
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
    let activeGroup = '';
    const defaultMode = defaultSort(gameId);

    setStatus(data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '');
    setHeader({ title, subtitle: `${characters.length}명`, back: '' });
    backPath = '';
    backButton.hidden = false;
    homeButton.hidden = true;

    const entry = gameId === 'sound-voltex'
      ? '<button class="feature-link" type="button" data-jackets-entry><span>모든 곡 자켓 보기</span><span aria-hidden="true">→</span></button>'
      : ['blue-archive', 'eternal-return', 'genshin'].includes(gameId)
        ? `<button class="feature-link" type="button" data-skins-entry="${escapeAttr(gameId)}"><span>전체 스킨 최신순 보기</span><span aria-hidden="true">→</span></button>`
        : '';

    app.innerHTML = `
      ${entry}
      ${data.error ? '<div class="error">일부 원본 데이터를 갱신하지 못했습니다. 마지막 생성 결과만 표시합니다.</div>' : ''}
      <div class="toolbar character-toolbar">
        <input id="search" type="search" placeholder="이름 검색 (한/영/일)" autocomplete="off">
        <select id="sort" aria-label="정렬 기준">${sortOptions(gameId, defaultMode)}</select>
      </div>
      ${groups.length > 1 ? `<div id="groupChips" class="filter-chips"><button class="filter-chip active" type="button" data-group="">전체</button>${groups.map((group) => `<button class="filter-chip" type="button" data-group="${escapeAttr(group)}">${escapeHtml(group)}</button>`).join('')}</div>` : ''}
      <div class="section-title"><h2>캐릭터</h2><span id="count"></span></div>
      <section id="characterGrid" class="character-grid"></section>
    `;

    const search = document.getElementById('search');
    const sort = document.getElementById('sort');
    const grid = document.getElementById('characterGrid');
    const count = document.getElementById('count');

    const update = () => {
      const query = search.value.trim().toLocaleLowerCase();
      let rows = characters.filter((character) => {
        const text = [character.names?.ko, character.names?.en, character.names?.ja, character.id, character.group]
          .filter(Boolean).join(' ').toLocaleLowerCase();
        return (!query || text.includes(query)) && (!activeGroup || character.group === activeGroup);
      });
      rows = sortCharacters(rows, sort.value, sourceIndex);
      count.textContent = `${rows.length}명`;
      headerSubtitle.textContent = `${rows.length}명`;
      headerSubtitle.hidden = false;
      grid.innerHTML = rows.length ? rows.map((character, index) => `
        <article class="character-card" data-id="${escapeAttr(character.id)}" tabindex="0" role="link" style="animation-delay:${Math.min(index, 20) * 18}ms">
          <div class="art">
            ${character.profileImage
              ? `<img src="${escapeAttr(character.profileImage)}" alt="${escapeAttr(displayName(character))}" loading="${index < 24 ? 'eager' : 'lazy'}" referrerpolicy="no-referrer">`
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

    search.addEventListener('input', update);
    sort.addEventListener('change', update);
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

  function defaultSort(gameId) {
    if (gameId === 'blue-archive') return 'popularity';
    if (gameId === 'eternal-return') return 'release';
    return 'source';
  }

  function sortOptions(gameId, selected) {
    const modes = gameId === 'blue-archive'
      ? [['popularity', '인기순'], ['ko', '가나다순']]
      : gameId === 'eternal-return'
        ? [['release', '출시순'], ['ko', '가나다순'], ['en', 'A–Z']]
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
        return bScore - aScore || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0);
      });
    }
    if (mode === 'release') {
      return [...rows].sort((a, b) => {
        const aOrder = Number(a.releaseOrder ?? a.additionOrder ?? sourceIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER);
        const bOrder = Number(b.releaseOrder ?? b.additionOrder ?? sourceIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER);
        return aOrder - bOrder || displayName(a).localeCompare(displayName(b), 'ko', { numeric: true });
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
    setStatus(data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '');
    setHeader({ title: name, subtitle: english, back: `game/${gameId}` });
    app.innerHTML = `
      ${data.error ? '<div class="error">일부 원본 데이터를 갱신하지 못했습니다. 마지막 생성 결과만 표시합니다.</div>' : ''}
      <div class="section-title"><h2>${gameId === 'sound-voltex' ? '공식 이미지' : '스탠딩 · 의상'}</h2><span>${images.length}종</span></div>
      <section class="standing-grid">
        ${images.length ? images.map((image, index) => detailCard(image, index)).join('') : '<div class="empty">공식 이미지를 찾지 못했어요.</div>'}
      </section>
    `;
    app.querySelectorAll('[data-image-index]').forEach((card) => {
      card.addEventListener('click', () => openLightbox(images[Number(card.dataset.imageIndex)]));
    });
  }

  function detailCard(image, index) {
    const label = image.group || image.type || '기본';
    return `
      <article class="standing-card" data-image-index="${index}">
        <span class="badge">${escapeHtml(label)}</span>
        <div class="art"><img src="${escapeAttr(image.thumbUrl || image.url)}" alt="${escapeAttr(label)}" loading="${index < 3 ? 'eager' : 'lazy'}" referrerpolicy="no-referrer"></div>
      </article>
    `;
  }

  function renderJackets(data) {
    setTheme('sound-voltex');
    const jackets = Array.isArray(data.jackets) ? data.jackets : [];
    const hasCategory = jackets.some((jacket) => jacket.category);
    const categories = [...new Set(jackets.map((jacket) => jacket.category).filter(Boolean))];
    const hasPopularity = jackets.some((jacket) => jacket.popularity != null || jacket.adultScore != null);
    let shown = PAGE_SIZE;
    let visibleRows = [];

    setStatus(data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '');
    setHeader({ title: '모든 곡 자켓', subtitle: `${jackets.length}곡`, back: 'game/sound-voltex' });
    app.innerHTML = `
      ${data.error ? '<div class="error">최신 카탈로그 생성 중 일부 원본 요청이 실패했습니다.</div>' : ''}
      <div class="toolbar jacket-toolbar${hasCategory ? ' has-category' : ''}">
        <input id="search" type="search" placeholder="곡 또는 캐릭터 검색" autocomplete="off">
        <select id="level" aria-label="레벨 필터"><option value="">모든 레벨</option>${levelOptions(jackets)}</select>
        ${hasCategory ? `<select id="category" aria-label="자켓 분류"><option value="">전체</option>${categories.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('')}</select>` : ''}
        <select id="sort" aria-label="정렬">
          ${hasPopularity ? '<option value="popular">인기순</option>' : ''}
          <option value="newest">발매일 최신순 ↓</option>
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
          return Number(b.adultScore ?? -1) - Number(a.adultScore ?? -1)
            || Number(b.popularity ?? 0) - Number(a.popularity ?? 0)
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
        card.addEventListener('click', () => openLightbox(visibleRows[Number(card.dataset.imageIndex)]));
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
          <img src="${escapeAttr(jacket.thumbUrl || jacket.url)}" alt="${escapeAttr(title)}" loading="lazy" referrerpolicy="no-referrer">
        </button>
        <div class="info">
          <strong>${escapeHtml(title)}</strong>
          <div class="meta"><span>${escapeHtml(artist)}</span>${jacket.releasedAt ? `<time datetime="${escapeAttr(jacket.releasedAt)}">${escapeHtml(jacket.releasedAt)}</time>` : ''}</div>
        </div>
      </article>
    `;
  }

  function openLightbox(item) {
    currentLightboxItem = item;
    currentVariant = null;
    lightboxTitle.textContent = item.group || item.title || '이미지';
    lightboxMeta.textContent = [item.artist, item.releasedAt, item.type].filter(Boolean).join(' · ');
    openSource.href = item.sourceUrl || item.url;
    variantButtons.innerHTML = '';
    const variants = Array.isArray(item.variants) && item.variants.length ? item.variants : null;
    if (variants) {
      variants.forEach((variant, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${variant.difficulty}${variant.level != null ? ` · Lv ${variant.level}` : ''}`;
        button.addEventListener('click', () => selectVariant(variant, button));
        variantButtons.appendChild(button);
        if (index === 0) selectVariant(variant, button);
      });
    } else {
      lightboxImage.src = item.url;
      lightboxImage.alt = item.group || item.title || '이미지';
    }
    lightbox.showModal();
  }

  function selectVariant(variant, button) {
    currentVariant = variant;
    lightboxImage.src = variant.url;
    lightboxImage.alt = `${currentLightboxItem?.group || currentLightboxItem?.title || ''} ${variant.difficulty || ''}`;
    variantButtons.querySelectorAll('button').forEach((node) => node.classList.toggle('active', node === button));
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
