// D-22 — 아이콘 원본 SVG(스케치 004 `#app-a`) + 「GH Trade」 워드마크 → @capacitor/assets 입력 PNG 5종.
//
// 렌더러는 webapp 의 devDependency @playwright/test(chromium)를 webapp 기준 require 로 빌려 쓴다 —
// mobile/ 에 새 의존성(sharp·playwright)을 들이지 않는다(D-05 · Vercel 워크스페이스 설치 오염 방지).
// 네트워크 요청 0: SVG 는 인라인, Pretendard 는 base64 data: URL 로 넣는다(T-21-41).
//
// 실행: `node scripts/render-resources.mjs` (mobile/ 에서 — `native:assets`) 또는 저장소 루트에서
// `node mobile/scripts/render-resources.mjs`. 경로는 모두 import.meta.url 기준.
import nodeModule from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const requireFromWebapp = nodeModule.createRequire(new URL('../../webapp/package.json', import.meta.url));
const { chromium } = requireFromWebapp('@playwright/test');

const resourcesDir = new URL('../resources/', import.meta.url);
const iconSvgUrl = new URL('icon.svg', resourcesDir);
const fontUrl = new URL('../../webapp/public/fonts/PretendardVariable.woff2', import.meta.url);

const ICON = 1024;
const SPLASH = 2732;
const DARK_BG = '#17171c';

const iconSvg = (await readFile(iconSvgUrl, 'utf8')).trim();
const fontBase64 = (await readFile(fontUrl)).toString('base64');

// 원본 SVG 의 안쪽(바탕 rect 제외)만 뽑아 어댑티브 전경으로 쓴다.
const inner = iconSvg
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<rect width="1024" height="1024"[^>]*\/>/, '');
if (inner.includes('<rect')) throw new Error('icon.svg 바탕 rect 제거 실패');

// Pitfall 19: 외곽 링(지름 ≈ 65%)이 어댑티브 원형 마스크 안전영역(≈ 61%)을 넘으므로 중심 기준 0.88배.
const foregroundSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
  `<g transform="translate(512 512) scale(0.88) translate(-512 -512)">${inner}</g></svg>`;

const baseCss = `
  @font-face { font-family: 'Pretendard'; src: url(data:font/woff2;base64,${fontBase64}) format('woff2'); font-weight: 45 920; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  svg { display: block; width: 100%; height: 100%; }
`;

const page = (body, bg = 'transparent') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss} body { background: ${bg}; }</style></head><body>${body}</body></html>`;

const splashHtml = (bg, fg) =>
  page(
    `<main style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
       <div style="width:320px;height:320px;border-radius:22.37%;overflow:hidden">${iconSvg}</div>
       <div style="font:800 96px 'Pretendard';letter-spacing:-0.02em;line-height:1;color:${fg}">GH Trade</div>
     </main>`,
    bg,
  );

const targets = [
  { file: 'icon-only.png', size: ICON, html: page(iconSvg) },
  { file: 'icon-foreground.png', size: ICON, html: page(foregroundSvg), omitBackground: true },
  { file: 'icon-background.png', size: ICON, html: page('', DARK_BG) },
  { file: 'splash.png', size: SPLASH, html: splashHtml('#ffffff', '#191f28'), needsFont: true },
  { file: 'splash-dark.png', size: SPLASH, html: splashHtml(DARK_BG, '#ffffff'), needsFont: true },
];

// PNG IHDR(오프셋 16/20)에서 실제 픽셀 크기를 읽어 결과를 확인한다.
const pngSize = (buf) => `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const tab = await context.newPage();
  // 인라인 문서 밖으로 나가는 요청은 모두 막는다(네트워크 0 보장).
  await tab.route('**/*', (route) => route.abort());
  for (const t of targets) {
    await tab.setViewportSize({ width: t.size, height: t.size });
    await tab.setContent(t.html, { waitUntil: 'load' });
    if (t.needsFont) {
      const ok = await tab.evaluate(async () => {
        await document.fonts.load("800 96px 'Pretendard'");
        await document.fonts.ready;
        return document.fonts.check("800 96px 'Pretendard'");
      });
      if (!ok) throw new Error(`${t.file}: Pretendard 로드 실패`);
    }
    const out = fileURLToPath(new URL(t.file, resourcesDir));
    const buf = await tab.screenshot({ path: out, omitBackground: Boolean(t.omitBackground) });
    if (pngSize(buf) !== `${t.size}x${t.size}`) throw new Error(`${t.file}: 크기 ${pngSize(buf)} ≠ ${t.size}`);
    console.log(`${t.file} ${pngSize(buf)} ${buf.length}B`);
  }
} finally {
  await browser.close();
}
console.log(`RENDER OK ${targets.length}`);
