(() => {
  'use strict';

  const DATA_FILES = {
    'blue-archive': 'blue-archive.json',
    'eternal-return': 'eternal-return.json',
    genshin: 'genshin.json',
    'sound-voltex': 'sound-voltex.json',
    djmax: 'djmax.json',
  };

  const app = document.getElementById('app');
  const status = document.getElementById('status');
  const homeButton = document.getElementById('homeButton');
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

  homeButton.addEventListener('click', () => navigate(''));
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
      return renderGame(gameId);
    } catch (error) {
      console.error(error);
      app.innerHTML = `<div class="error">데이터를 불러오지 못했어요.<br><small>${escapeHtml(error.message || String(error))}</small></div>`;
      status.textContent = '데이터 로드 실패';
    }
  }

  async function renderHome() {
    const manifest = await loadJson('manifest.json');
    status.textContent = manifest.generatedAt ? `갱신 ${formatDate(manifest.generatedAt)}` : '';
    const cards = manifest.games.map((game) => `
      <article class="game-card" data-game="${escapeAttr(game.id)}" tabindex="0" role="link">
        ${game.coverImage ? `<img src="${escapeAttr(game.coverImage)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <div class="game-card-content">
          <h2>${escapeHtml(game.name)}</h2>
          <p>${escapeHtml(game.description || '')}</p>
        </div>
      </article>
    `).join('');
    app.innerHTML = `
      <section class="hero">
        <h1>게임을 선택하세요</h1>
        <p>서버 함수 없이 동작하는 정적 갤러리입니다. 원본 이미지는 각 공개 출처에서 직접 불러옵니다.</p>
      </section>
      <section class="game-grid">${cards}</section>
      <div class="notice">이 임시판은 GitHub Pages에서 동작합니다. 이미지 출처가 응답하지 않으면 일부 항목이 늦게 보이거나 표시되지 않을 수 있습니다.</div>
    `;
    app.querySelectorAll('[data-game]').forEach((card) => {
      const go = () => navigate(`game/${card.dataset.game}`);
      card.addEventListener('click', go);
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') go(); });
    });
  }

  async function renderGame(gameId) {
    const data = await loadJson(DATA_FILES[gameId]);
    status.textContent = data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '';
    if (gameId === 'sound-voltex') return renderJackets(data);
    const title = data.game?.name || gameId;
    const characters = Array.isArray(data.characters) ? data.characters : [];
    const groups = [...new Set(characters.map((character) => character.group).filter(Boolean))];

    app.innerHTML = `
      ${breadcrumb(title)}
      <section class="hero">
        <div class="hero-row"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(data.game?.description || '캐릭터를 선택하면 공식 이미지를 볼 수 있습니다.')}</p></div></div>
      </section>
      ${data.error ? `<div class="error">일부 원본 데이터를 갱신하지 못했습니다. 마지막 생성 결과만 표시합니다.</div>` : ''}
      <div class="toolbar">
        <input id="search" type="search" placeholder="캐릭터 검색" autocomplete="off">
        <select id="group"><option value="">모든 분류</option>${groups.map((group) => `<option>${escapeHtml(group)}</option>`).join('')}</select>
        <select id="sort"><option value="source">기본순</option><option value="name">이름순</option></select>
      </div>
      <div class="section-title"><h2>캐릭터</h2><span id="count"></span></div>
      <section id="characterGrid" class="character-grid"></section>
    `;

    const search = document.getElementById('search');
    const group = document.getElementById('group');
    const sort = document.getElementById('sort');
    const grid = document.getElementById('characterGrid');
    const count = document.getElementById('count');

    const update = () => {
      const query = search.value.trim().toLocaleLowerCase();
      let rows = characters.filter((character) => {
        const text = [character.names?.ko, character.names?.en, character.names?.ja, character.group].filter(Boolean).join(' ').toLocaleLowerCase();
        return (!query || text.includes(query)) && (!group.value || character.group === group.value);
      });
      if (sort.value === 'name') rows = [...rows].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ko'));
      count.textContent = `${rows.length}명`;
      grid.innerHTML = rows.length ? rows.map((character) => `
        <article class="character-card" data-id="${escapeAttr(character.id)}" tabindex="0" role="link">
          <div class="art"><img src="${escapeAttr(character.profileImage || '')}" alt="${escapeAttr(displayName(character))}" loading="lazy" referrerpolicy="no-referrer"></div>
          <div class="info"><strong>${escapeHtml(displayName(character))}</strong><small>${escapeHtml(character.group || character.names?.en || '')}</small></div>
        </article>
      `).join('') : '<div class="empty">조건에 맞는 캐릭터가 없습니다.</div>';
      grid.querySelectorAll('[data-id]').forEach((card) => {
        const go = () => navigate(`game/${gameId}/character/${encodeURIComponent(card.dataset.id)}`);
        card.addEventListener('click', go);
        card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') go(); });
      });
    };
    [search, group, sort].forEach((control) => control.addEventListener('input', update));
    update();
  }

  async function renderCharacter(gameId, characterId) {
    const data = await loadJson(DATA_FILES[gameId]);
    const character = (data.characters || []).find((item) => item.id === characterId);
    if (!character) return renderNotFound();
    const title = data.game?.name || gameId;
    const images = Array.isArray(character.images) ? character.images.filter((image) => image.url) : [];
    status.textContent = data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '';
    app.innerHTML = `
      <div class="breadcrumb"><button data-back>게임 목록</button> / <button data-game-back>${escapeHtml(title)}</button> / ${escapeHtml(displayName(character))}</div>
      <section class="hero"><h1>${escapeHtml(displayName(character))}</h1><p>${escapeHtml(character.names?.en || '')}</p></section>
      <div class="section-title"><h2>공식 이미지</h2><span>${images.length}개</span></div>
      <section class="image-grid">
        ${images.length ? images.map((image, index) => imageCard(image, index, false)).join('') : '<div class="empty">표시할 이미지가 없습니다.</div>'}
      </section>
    `;
    app.querySelector('[data-back]').addEventListener('click', () => navigate(''));
    app.querySelector('[data-game-back]').addEventListener('click', () => navigate(`game/${gameId}`));
    app.querySelectorAll('[data-image-index]').forEach((card) => {
      card.addEventListener('click', () => openLightbox(images[Number(card.dataset.imageIndex)]));
    });
  }

  function renderJackets(data) {
    const jackets = Array.isArray(data.jackets) ? data.jackets : [];
    app.innerHTML = `
      ${breadcrumb(data.game?.name || 'SOUND VOLTEX')}
      <section class="hero"><h1>${escapeHtml(data.game?.name || 'SOUND VOLTEX')}</h1><p>전체 곡 자켓을 검색하고 난이도별 이미지를 전환할 수 있습니다.</p></section>
      ${data.error ? `<div class="error">최신 카탈로그 생성 중 일부 원본 요청이 실패했습니다.</div>` : ''}
      <div class="toolbar">
        <input id="search" type="search" placeholder="곡 또는 아티스트 검색" autocomplete="off">
        <select id="level"><option value="">모든 레벨</option>${levelOptions(jackets)}</select>
        <select id="sort"><option value="newest">발매일 최신순</option><option value="oldest">발매일 오래된순</option><option value="name">이름순</option><option value="level">레벨 높은순</option></select>
      </div>
      <div class="section-title"><h2>모든 곡 자켓</h2><span id="count"></span></div>
      <section id="jacketGrid" class="image-grid"></section>
    `;
    const search = document.getElementById('search');
    const level = document.getElementById('level');
    const sort = document.getElementById('sort');
    const grid = document.getElementById('jacketGrid');
    const count = document.getElementById('count');
    const update = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const selectedLevel = level.value ? Number(level.value) : null;
      let rows = jackets.filter((jacket) => {
        const text = `${jacket.title || ''} ${jacket.artist || ''}`.toLocaleLowerCase();
        const levels = (jacket.variants || []).flatMap((variant) => variant.levels || (variant.level == null ? [] : [variant.level]));
        return (!query || text.includes(query)) && (selectedLevel == null || levels.includes(selectedLevel));
      });
      rows = [...rows].sort((a, b) => {
        if (sort.value === 'name') return (a.title || '').localeCompare(b.title || '', 'ko');
        if (sort.value === 'oldest') return (a.releasedAt || '9999').localeCompare(b.releasedAt || '9999');
        if (sort.value === 'level') return maxLevel(b) - maxLevel(a);
        return (b.releasedAt || '0000').localeCompare(a.releasedAt || '0000');
      });
      count.textContent = `${rows.length}곡`;
      grid.innerHTML = rows.length ? rows.map((jacket, index) => imageCard({ ...jacket, group: jacket.title, badge: maxLevel(jacket) ? `Lv ${maxLevel(jacket)}` : '' }, index, true)).join('') : '<div class="empty">조건에 맞는 곡이 없습니다.</div>';
      grid.querySelectorAll('[data-image-index]').forEach((card) => {
        card.addEventListener('click', () => openLightbox(rows[Number(card.dataset.imageIndex)]));
      });
    };
    [search, level, sort].forEach((control) => control.addEventListener('input', update));
    update();
  }

  function breadcrumb(title) {
    return `<div class="breadcrumb"><button data-home>게임 목록</button> / ${escapeHtml(title)}</div>`;
  }

  function imageCard(image, index, square) {
    return `
      <article class="image-card ${square ? 'square' : ''}" data-image-index="${index}">
        ${image.badge ? `<span class="badge">${escapeHtml(image.badge)}</span>` : ''}
        <div class="art"><img src="${escapeAttr(image.thumbUrl || image.url)}" alt="${escapeAttr(image.group || image.title || '이미지')}" loading="lazy" referrerpolicy="no-referrer"></div>
        <div class="info"><strong>${escapeHtml(image.group || image.title || '공식 이미지')}</strong><small>${escapeHtml(image.artist || image.type || image.releasedAt || '')}</small></div>
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

  function renderNotFound() {
    status.textContent = '';
    app.innerHTML = '<div class="error">페이지를 찾을 수 없습니다.</div>';
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
