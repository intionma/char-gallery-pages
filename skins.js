(() => {
  'use strict';

  const PAGE_SIZE = 60;
  const CATALOGS = [
    {
      gameId: 'blue-archive',
      gameName: '블루 아카이브',
      dataFile: 'blue-archive.json',
      description: '기본 스탠딩과 의상을 최신 추가순으로 한 번에 봅니다.',
    },
    {
      gameId: 'eternal-return',
      gameName: '이터널 리턴',
      dataFile: 'eternal-return.json',
      description: '기본 스탠딩과 스킨을 출시·추가 최신순으로 한 번에 봅니다.',
    },
    {
      gameId: 'genshin',
      gameName: '원신',
      dataFile: 'genshin.json',
      description: '기본 일러스트와 의상을 게임 버전 최신순으로 한 번에 봅니다.',
    },
  ].map((catalog) => ({
    ...catalog,
    gameRoute: `game/${catalog.gameId}`,
    route: `game/${catalog.gameId}/skins`,
  }));

  const app = document.getElementById('app');
  const status = document.getElementById('status');
  const lightbox = document.getElementById('lightbox');
  const copyImageUrl = document.getElementById('copyImageUrl');
  const ui = window.CharGalleryUI;
  let renderToken = 0;
  let scheduled = false;
  let currentSkinUrl = '';

  function route() {
    return location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  }

  function skinCatalogForRoute() {
    const current = route();
    return CATALOGS.find((catalog) => catalog.route === current);
  }

  function gameCatalogForRoute() {
    const current = route();
    return CATALOGS.find((catalog) => catalog.gameRoute === current);
  }

  function navigate(path) {
    if (ui?.navigate) ui.navigate(path);
    else location.hash = `#/${path.replace(/^\/+/, '')}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function displayName(skin) {
    return skin.character?.names?.ko || skin.character?.names?.en || skin.character?.names?.ja || skin.characterId;
  }

  function shortDate(value) {
    const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : value || '';
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '';
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }

  function openSkin(skin) {
    const image = document.getElementById('lightboxImage');
    const title = document.getElementById('lightboxTitle');
    const meta = document.getElementById('lightboxMeta');
    const source = document.getElementById('openSource');
    const variants = document.getElementById('variantButtons');
    currentSkinUrl = skin.url;
    lightbox.dataset.skinMode = '1';
    image.src = skin.url;
    image.alt = `${displayName(skin)} ${skin.skinName}`;
    title.textContent = `${displayName(skin)} · ${skin.skinName}`;
    meta.textContent = skin.upcoming
      ? `출시 예정${skin.releaseDate ? ` · ${shortDate(skin.releaseDate)}` : ''}`
      : skin.releaseVersion
        ? `버전 ${skin.releaseVersion}`
        : skin.releasedAt
          ? `출시 ${shortDate(skin.releasedAt)}`
          : skin.sourceType === 'official_standing' ? '기본 스탠딩' : '공식 의상';
    source.href = skin.sourceUrl || skin.url;
    variants.innerHTML = '';
    lightbox.showModal();
  }

  async function copySkinUrl(event) {
    if (lightbox.dataset.skinMode !== '1' || !currentSkinUrl) return;
    event.stopImmediatePropagation();
    try {
      await navigator.clipboard.writeText(currentSkinUrl);
      copyImageUrl.textContent = '복사됨';
      setTimeout(() => { copyImageUrl.textContent = '이미지 주소 복사'; }, 1200);
    } catch {
      window.prompt('이미지 주소를 복사하세요.', currentSkinUrl);
    }
  }

  function card(skin, index) {
    const baseSkin = skin.sourceType === 'official_standing';
    const badge = skin.upcoming
      ? `출시 예정${skin.releaseDate ? ` · ${shortDate(skin.releaseDate)}` : ''}`
      : baseSkin ? '기본' : '';
    return `
      <article class="skin-card" data-skin-id="${escapeHtml(skin.id)}">
        <button class="skin-art" type="button" aria-label="${escapeHtml(`${displayName(skin)} ${skin.skinName} 크게 보기`)}">
          ${badge ? `<span class="skin-badge${skin.upcoming ? ' upcoming' : ''}">${escapeHtml(badge)}</span>` : ''}
          ${skin.announcementOnly ? '<span class="skin-waiting">공식 발표됨 · 전신 데이터 대기</span>' : ''}
          <img src="${escapeHtml(skin.url)}" alt="${escapeHtml(`${displayName(skin)} ${skin.skinName}`)}" loading="${index < 12 ? 'eager' : 'lazy'}" referrerpolicy="no-referrer">
        </button>
        <div class="skin-info">
          <strong>${escapeHtml(skin.skinName)}</strong>
          <button class="skin-character" type="button" data-character-id="${escapeHtml(skin.characterId)}">${escapeHtml(displayName(skin))}</button>
        </div>
      </article>`;
  }

  async function renderSkins(catalog) {
    const token = ++renderToken;
    ui?.setTheme?.(catalog.gameId);
    ui?.setHeader?.({ title: `${catalog.gameName} · 전체 스킨`, subtitle: '불러오는 중…', back: catalog.gameRoute });
    app.innerHTML = '<section class="skins-view"><div class="skeleton"></div></section>';
    try {
      const response = await fetch(new URL(`./data/${catalog.dataFile}`, document.baseURI), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (token !== renderToken || skinCatalogForRoute()?.gameId !== catalog.gameId) return;
      const skins = Array.isArray(data.skins) ? data.skins : [];
      if (!skins.length) throw new Error('스킨 데이터가 없습니다.');
      const generated = data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '';
      if (ui?.setStatus) ui.setStatus(generated);
      else status.textContent = generated;
      app.innerHTML = `
        <section class="skins-view" data-skins-view="${escapeHtml(catalog.gameId)}">
          <div class="toolbar skin-toolbar">
            <input id="skinSearch" type="search" placeholder="스킨 또는 캐릭터 검색" autocomplete="off">
            <select id="skinSort" aria-label="정렬"><option value="newest">최신 추가순 ↓</option><option value="oldest">오래된 추가순 ↑</option><option value="name">이름순</option></select>
          </div>
          <div class="section-title"><h2>전체 스킨</h2><span id="skinCount"></span></div>
          <section id="skinGrid" class="skin-grid"></section>
          <button id="skinMore" class="button skin-more" type="button" hidden></button>
        </section>`;

      const search = document.getElementById('skinSearch');
      const sort = document.getElementById('skinSort');
      const grid = document.getElementById('skinGrid');
      const count = document.getElementById('skinCount');
      const more = document.getElementById('skinMore');
      let shown = PAGE_SIZE;
      let visible = [];
      const byId = new Map(skins.map((skin) => [skin.id, skin]));

      const update = (reset = false) => {
        if (reset) shown = PAGE_SIZE;
        const query = search.value.trim().toLocaleLowerCase();
        visible = skins.filter((skin) => {
          const text = [skin.skinName, skin.group, displayName(skin), skin.character?.names?.en, skin.character?.names?.ja]
            .filter(Boolean).join(' ').toLocaleLowerCase();
          return !query || text.includes(query);
        });
        visible = [...visible].sort((a, b) => {
          if (sort.value === 'name') {
            const bySkin = String(a.skinName).localeCompare(String(b.skinName), 'ko', { numeric: true });
            return bySkin || displayName(a).localeCompare(displayName(b), 'ko', { numeric: true });
          }
          return sort.value === 'oldest'
            ? Number(a.additionOrder) - Number(b.additionOrder)
            : Number(b.additionOrder) - Number(a.additionOrder);
        });
        count.textContent = `${visible.length}종`;
        ui?.setHeader?.({ title: `${catalog.gameName} · 전체 스킨`, subtitle: `${visible.length}종`, back: catalog.gameRoute });
        grid.innerHTML = visible.slice(0, shown).map(card).join('');
        const remaining = visible.length - shown;
        more.hidden = remaining <= 0;
        more.textContent = remaining > 0 ? `더 보기 · ${remaining}종` : '';
      };

      search.addEventListener('input', () => update(true));
      sort.addEventListener('change', () => update(true));
      more.addEventListener('click', () => { shown += PAGE_SIZE; update(); });
      grid.addEventListener('click', (event) => {
        const character = event.target.closest('[data-character-id]');
        if (character) {
          navigate(`${catalog.gameRoute}/character/${encodeURIComponent(character.dataset.characterId)}`);
          return;
        }
        const article = event.target.closest('[data-skin-id]');
        const skin = article ? byId.get(article.dataset.skinId) : null;
        if (skin) openSkin(skin);
      });
      update();
    } catch (error) {
      if (token !== renderToken || skinCatalogForRoute()?.gameId !== catalog.gameId) return;
      app.innerHTML = `<section class="skins-view" data-skins-view="${escapeHtml(catalog.gameId)}"><div class="error">스킨 목록을 불러오지 못했어요.<br><small>${escapeHtml(error.message || String(error))}</small><br><button class="button" type="button" data-skins-retry>다시 시도</button></div></section>`;
      ui?.setHeader?.({ title: `${catalog.gameName} · 전체 스킨`, subtitle: '불러오기 실패', back: catalog.gameRoute });
      if (ui?.setStatus) ui.setStatus('스킨 데이터 로드 실패');
      else status.textContent = '스킨 데이터 로드 실패';
      app.querySelector('[data-skins-retry]')?.addEventListener('click', () => renderSkins(catalog));
    }
  }

  function ensureEntryLink() {
    const catalog = gameCatalogForRoute();
    if (!catalog) return;
    if (app.querySelector(`[data-skins-entry="${catalog.gameId}"]`)) return;
    const first = app.firstElementChild;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.skinsEntry = catalog.gameId;
    button.className = 'feature-link';
    button.innerHTML = '<span>전체 스킨 최신순 보기</span><span aria-hidden="true">→</span>';
    button.addEventListener('click', () => navigate(catalog.route));
    if (first) app.insertBefore(button, first);
    else app.appendChild(button);
  }

  function syncRoute(event) {
    renderToken += 1;
    const catalog = skinCatalogForRoute();
    if (catalog) {
      event?.stopImmediatePropagation();
      renderSkins(catalog);
    } else {
      queueMicrotask(ensureEntryLink);
    }
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const catalog = skinCatalogForRoute();
      if (catalog) {
        if (app.querySelector('[data-skins-view]')?.dataset.skinsView !== catalog.gameId) renderSkins(catalog);
      } else {
        ensureEntryLink();
      }
    });
  }

  copyImageUrl.addEventListener('click', copySkinUrl, { capture: true });
  lightbox.addEventListener('close', () => {
    delete lightbox.dataset.skinMode;
    currentSkinUrl = '';
  });
  window.addEventListener('hashchange', syncRoute, { capture: true });
  new MutationObserver(scheduleSync).observe(app, { childList: true, subtree: true });
  syncRoute();
})();
