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
  const variantButtons = document.getElementById('variantButtons');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxPrevMobile = document.getElementById('lightboxPrevMobile');
  const lightboxNextMobile = document.getElementById('lightboxNextMobile');
  const cache = new Map();
  const imageViewer = createImageViewer();
  window.CharGalleryViewer = imageViewer;

  homeButton.addEventListener('click', () => navigate(''));
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
      card.addEventListener('click', () => imageViewer.open(images, Number(card.dataset.imageIndex)));
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
        card.addEventListener('click', () => imageViewer.open(rows, Number(card.dataset.imageIndex)));
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
        image.referrerPolicy = 'no-referrer';
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
