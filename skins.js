(() => {
  'use strict';

  const ROUTE = 'game/blue-archive/skins';
  const PAGE_SIZE = 60;
  const app = document.getElementById('app');
  const status = document.getElementById('status');
  const lightbox = document.getElementById('lightbox');
  const copyImageUrl = document.getElementById('copyImageUrl');
  let renderToken = 0;
  let scheduled = false;
  let currentSkinUrl = '';

  function route() {
    return location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  }

  function isSkinsRoute() {
    return route() === ROUTE;
  }

  function navigate(path) {
    location.hash = `#/${path.replace(/^\/+/, '')}`;
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

  function card(skin) {
    const badge = skin.upcoming
      ? `출시 예정${skin.releaseDate ? ` · ${shortDate(skin.releaseDate)}` : ''}`
      : skin.sourceType === 'official_standing' ? '기본' : '';
    return `
      <article class="skin-card" data-skin-id="${escapeHtml(skin.id)}">
        <button class="skin-art" type="button" aria-label="${escapeHtml(`${displayName(skin)} ${skin.skinName} 크게 보기`)}">
          ${badge ? `<span class="skin-badge${skin.upcoming ? ' upcoming' : ''}">${escapeHtml(badge)}</span>` : ''}
          ${skin.announcementOnly ? '<span class="skin-waiting">공식 발표됨 · 전신 데이터 대기</span>' : ''}
          <img src="${escapeHtml(skin.url)}" alt="${escapeHtml(`${displayName(skin)} ${skin.skinName}`)}" loading="lazy" referrerpolicy="no-referrer">
        </button>
        <div class="skin-info">
          <strong>${escapeHtml(skin.skinName)}</strong>
          <button class="skin-character" type="button" data-character-id="${escapeHtml(skin.characterId)}">${escapeHtml(displayName(skin))}</button>
        </div>
      </article>`;
  }

  async function renderSkins() {
    const token = ++renderToken;
    app.innerHTML = '<section class="ba-skins-view"><div class="skeleton"></div></section>';
    try {
      const response = await fetch(new URL('./data/blue-archive.json', document.baseURI), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (token !== renderToken || !isSkinsRoute()) return;
      const skins = Array.isArray(data.skins) ? data.skins : [];
      if (!skins.length) throw new Error('스킨 데이터가 없습니다.');
      status.textContent = data.generatedAt ? `갱신 ${formatDate(data.generatedAt)}` : '';
      app.innerHTML = `
        <section class="ba-skins-view">
          <div class="breadcrumb"><button type="button" data-skins-home>게임 목록</button> / <button type="button" data-skins-game>블루 아카이브</button> / 전체 스킨</div>
          <section class="hero"><h1>블루 아카이브 · 전체 스킨</h1><p>기본 스탠딩과 의상을 최신 추가순으로 한 번에 봅니다.</p></section>
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
        grid.innerHTML = visible.slice(0, shown).map(card).join('');
        const remaining = visible.length - shown;
        more.hidden = remaining <= 0;
        more.textContent = remaining > 0 ? `${Math.min(PAGE_SIZE, remaining)}종 더 보기` : '';
      };

      search.addEventListener('input', () => update(true));
      sort.addEventListener('change', () => update(true));
      more.addEventListener('click', () => { shown += PAGE_SIZE; update(); });
      app.querySelector('[data-skins-home]').addEventListener('click', () => navigate(''));
      app.querySelector('[data-skins-game]').addEventListener('click', () => navigate('game/blue-archive'));
      grid.addEventListener('click', (event) => {
        const character = event.target.closest('[data-character-id]');
        if (character) {
          navigate(`game/blue-archive/character/${encodeURIComponent(character.dataset.characterId)}`);
          return;
        }
        const article = event.target.closest('[data-skin-id]');
        const skin = article ? byId.get(article.dataset.skinId) : null;
        if (skin) openSkin(skin);
      });
      update();
    } catch (error) {
      if (token !== renderToken || !isSkinsRoute()) return;
      app.innerHTML = `<section class="ba-skins-view"><div class="error">스킨 목록을 불러오지 못했어요.<br><small>${escapeHtml(error.message || String(error))}</small></div></section>`;
      status.textContent = '스킨 데이터 로드 실패';
    }
  }

  function ensureEntryLink() {
    if (route() !== 'game/blue-archive') return;
    if (app.querySelector('[data-ba-skins-entry]')) return;
    const hero = app.querySelector('.hero');
    if (!hero) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.baSkinsEntry = '';
    button.className = 'feature-link';
    button.innerHTML = '<span>전체 스킨 최신순 보기</span><span aria-hidden="true">→</span>';
    button.addEventListener('click', () => navigate(ROUTE));
    hero.insertAdjacentElement('afterend', button);
  }

  function syncRoute(event) {
    renderToken += 1;
    if (isSkinsRoute()) {
      event?.stopImmediatePropagation();
      renderSkins();
    } else {
      queueMicrotask(ensureEntryLink);
    }
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (isSkinsRoute()) {
        if (!app.querySelector('.ba-skins-view')) renderSkins();
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
