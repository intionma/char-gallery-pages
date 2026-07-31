// 레지스트리로부터 프런트엔드가 읽는 games.js 와 테마 CSS 를 생성한다.
// 게임을 추가할 때 손으로 고칠 파일이 registry.mjs 하나로 끝나게 하는 것이 목적이다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, clientGames, defaultGame, REFERRER_REQUIRED_HOSTS } from './games/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.argv[2] || 'dist');

function tokenBlock(tokens, indent = '  ') {
  return Object.entries(tokens)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join('\n');
}

function themeCss() {
  const blocks = [];
  const fallback = defaultGame();

  for (const game of GAMES) {
    // 기본 게임은 :root 에도 걸어 두어야 테마가 정해지기 전에도 색이 나온다.
    const selector = game.theme.default
      ? `:root,\n[data-theme="${game.id}"]`
      : `[data-theme="${game.id}"]`;
    blocks.push(`${selector} {\n  color-scheme: ${game.theme.scheme};\n${tokenBlock(game.theme.tokens)}\n}`);
  }

  for (const game of GAMES) {
    if (!game.theme.dark) continue;
    blocks.push(`[data-theme="${game.id}"][data-mode="dark"] {\n  color-scheme: dark;\n${tokenBlock(game.theme.dark)}\n}`);
  }

  // 테마 변형: 값은 게임별 토큰이 정하고, 구조는 여기서 한 번만 정의한다.
  const neon = GAMES.filter((game) => game.theme.variant === 'neon');
  if (neon.length) {
    const sel = neon.map((game) => `[data-theme="${game.id}"]`);
    blocks.push(`${sel.map((s) => `${s} body`).join(',\n')} {\n  background-image: var(--surface-image);\n}`);
    blocks.push(`${sel.map((s) => `${s} .topbar`).join(',\n')} {\n  border-bottom-color: rgb(var(--accent) / .25);\n  box-shadow: var(--topbar-glow);\n}`);
    blocks.push(`${sel.flatMap((s) => [`${s} .brand-mark::before`, `${s} .section-title h2::before`]).join(',\n')} {\n  box-shadow: 0 0 10px rgb(var(--accent) / .85), 0 0 4px rgb(var(--accent) / .9);\n}`);
    blocks.push(`${sel.flatMap((s) => [
      `${s} .character-card:hover .art`,
      `${s} .standing-card:hover`,
      `${s} .jacket-card:hover`,
      `${s} .skin-card:hover`,
    ]).join(',\n')} {\n  box-shadow:\n    inset 0 0 0 1px rgb(var(--accent) / .55),\n    0 0 20px -3px rgb(var(--accent) / .45),\n    0 0 34px -6px rgb(var(--accent-soft) / .32);\n}`);
  }

  return `/* scripts/build-registry.mjs 가 생성한 파일입니다. 직접 고치지 말고\n   scripts/games/registry.mjs 를 수정하세요. 기본 테마: ${fallback.id} */\n\n${blocks.join('\n\n')}\n`;
}

function gamesJs() {
  const payload = {
    games: clientGames(),
    defaultGameId: defaultGame().id,
    referrerRequiredHosts: REFERRER_REQUIRED_HOSTS,
  };
  return `/* scripts/build-registry.mjs 가 생성한 파일입니다. 직접 고치지 마세요. */\n`
    + `window.CharGalleryGames = ${JSON.stringify(payload, null, 2)};\n`;
}

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'themes.css'), themeCss(), 'utf8');
await fs.writeFile(path.join(outDir, 'games.js'), gamesJs(), 'utf8');
console.log(`Registry generated: ${GAMES.length} games → themes.css, games.js`);
