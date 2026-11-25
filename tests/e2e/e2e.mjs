import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const DIST_DIR = path.resolve('dist');
const BASE = '/omni-budget/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // fallback to NODE_PATH
  }
  const nodePath = process.env.NODE_PATH || '';
  for (const dir of nodePath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, 'playwright', 'index.mjs');
    if (fs.existsSync(candidate)) {
      return await import(pathToFileURL(candidate).href);
    }
  }
  const req = createRequire(import.meta.url);
  return req('playwright');
}

function startStaticServer() {
  const stats = { requests: [], swRequests: 0 };

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = reqUrl.pathname;
    stats.requests.push(`${req.method} ${pathname}`);

    if (pathname === '/omni-budget') {
      res.writeHead(301, { Location: BASE });
      res.end();
      return;
    }

    if (!pathname.startsWith(BASE)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    let rel = pathname.slice(BASE.length);
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    if (rel === 'sw.js') stats.swRequests += 1;

    const filePath = path.resolve(DIST_DIR, rel);
    if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}`, stats });
    });
  });
}

async function enterPin(page, digits, confirmLabel) {
  for (const d of digits) {
    await page.locator(`.touche-pin:has-text("${d}")`).first().click();
  }
  await page.getByRole('button', { name: confirmLabel }).click();
}

async function run() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error('dist/index.html missing — run npm run build first');
  }

  const { chromium } = await loadPlaywright();
  const { server, origin, stats } = await startStaticServer();
  const baseUrl = `${origin}${BASE}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const cspViolations = [];
    const externalRequests = [];
    let allowOfflineNetworkErrors = false;
    let mainFrameNavigations = 0;

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        if (!allowOfflineNetworkErrors) consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(`${origin}/`) && !url.startsWith('data:') && !url.startsWith('blob:')) {
        externalRequests.push(url);
      }
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) mainFrameNavigations += 1;
    });

    await page.addInitScript(() => {
      window.__cspEvents = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspEvents.push(`${e.violatedDirective}:${e.blockedURI}`);
      });

      // Capture anti-FOUC timing: record every synchronous data-theme write on <html>
      window.__antiFoucEvents = [];
      const origSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (this === document.documentElement && name === 'data-theme') {
          const racine = document.getElementById('racine');
          const reactMounted = racine
            ? !racine.querySelector('.chargement-initial') && racine.children.length > 0
            : false;
          window.__antiFoucEvents.push({
            dt: value,
            reactMounted,
            hasRacine: Boolean(racine),
            readyState: document.readyState,
          });
        }
        return origSetAttr.apply(this, arguments);
      };
    });

    // -----------------------------------------------------------------------
    // 1. Initial load, SW registration, updateViaCache: 'none', cache key, no claim reload
    // -----------------------------------------------------------------------
    console.log('1. Loading app and verifying SW registration...');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');

    // Wait for SW controller to be claimed on first load
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
    // Give controllerchange a moment to prove it does NOT trigger a reload
    await page.waitForTimeout(400);
    assert.equal(mainFrameNavigations, 1, `Expected 1 main-frame navigation (no reload on initial clients.claim), got ${mainFrameNavigations}`);

    const swInfo = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const activeKey = keys.find((k) => k.startsWith('omni-budget-2.0.1-'));
      let cachedUrls = [];
      if (activeKey) {
        const cache = await caches.open(activeKey);
        cachedUrls = (await cache.keys()).map((r) => new URL(r.url).pathname);
      }
      return {
        scope: reg.scope,
        updateViaCache: reg.updateViaCache,
        keys,
        activeKey,
        cachedUrls,
      };
    });

    assert.ok(swInfo.scope.endsWith('/omni-budget/'), `Unexpected SW scope: ${swInfo.scope}`);
    assert.equal(swInfo.updateViaCache, 'none', 'SW updateViaCache must be "none"');
    assert.ok(swInfo.activeKey, `Expected cache starting with omni-budget-2.0.1-, got ${JSON.stringify(swInfo.keys)}`);
    assert.ok(swInfo.cachedUrls.includes('/omni-budget/licences-tierces.txt'), 'licences-tierces.txt must be precached');
    assert.ok(swInfo.cachedUrls.includes('/omni-budget/theme-init.js'), 'theme-init.js must be precached');

    // -----------------------------------------------------------------------
    // 2. visibilitychange update check
    // -----------------------------------------------------------------------
    console.log('2. Testing visibilitychange SW update check...');
    const swReqBefore = stats.swRequests;
    const secondTab = await context.newPage();
    await secondTab.goto('about:blank');
    await secondTab.bringToFront();
    await page.waitForTimeout(150);
    await page.bringToFront();
    await page.evaluate(() => {
      // Headless Chromium does not toggle document.visibilityState on tab switch,
      // so dispatch visibilitychange while visible to exercise useServiceWorker's listener.
      if (document.visibilityState === 'visible') {
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
    await page.waitForTimeout(500);
    await secondTab.close();
    assert.ok(
      stats.swRequests > swReqBefore,
      `Expected /omni-budget/sw.js fetch after visibilitychange (before=${swReqBefore}, after=${stats.swRequests})`
    );

    // -----------------------------------------------------------------------
    // 3. PIN creation & tutoiement check
    // -----------------------------------------------------------------------
    console.log('3. Testing PIN setup and tutoiement...');
    const onboardingText = await page.locator('main').innerText();
    assert.ok(onboardingText.includes('Protège tes données'), 'Expected tutoiement heading "Protège tes données"');
    const vouvoiementRe = /\b(vous|votre|vos|protégez|saisissez|reconnectez|évitez|appuyez|confirmez)\b/i;
    assert.equal(vouvoiementRe.test(onboardingText), false, `Found vouvoiement in onboarding: ${onboardingText}`);

    await page.getByRole('button', { name: 'Choisir mon code' }).click();
    await enterPin(page, ['2', '4', '6', '8'], 'Continuer');
    await enterPin(page, ['2', '4', '6', '8'], 'Confirmer');
    await page.waitForSelector('#contenu-principal');

    // -----------------------------------------------------------------------
    // 4. Omni theme selection, WCAG AA >= 4.5:1 contrast, anti-FOUC & persistence
    // -----------------------------------------------------------------------
    console.log('4. Testing Omni theme, WCAG AA contrast, and anti-FOUC...');
    await page.getByRole('button', { name: /Réglages/ }).click();
    await page.waitForSelector('#titre-apparence');

    await page.locator('label', { has: page.locator('input[name="theme"][value="omni"]') }).click();

    const themeState = await page.evaluate(() => ({
      dataTheme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('budget-theme'),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }));
    assert.equal(themeState.dataTheme, 'omni');
    assert.equal(themeState.stored, 'omni');
    assert.equal(themeState.themeColor, '#0e0d12');

    // Real browser-computed WCAG AA contrast checks
    const contrastReport = await page.evaluate(() => {
      function parseRgb(str) {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      function lum([r, g, b]) {
        const f = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      }
      function ratio(fgStr, bgStr) {
        const l1 = lum(parseRgb(fgStr));
        const l2 = lum(parseRgb(bgStr));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      const bodyCs = getComputedStyle(document.body);
      const carte = document.querySelector('section.carte[aria-labelledby="titre-apparence"]');
      const carteCs = getComputedStyle(carte);
      const aide = carte.querySelector('.champ-aide');
      const aideCs = getComputedStyle(aide);
      const navActive = document.querySelector('.navigation-bouton[aria-current="page"]');
      const navContainer = document.querySelector('.navigation');
      const btn = document.querySelector('.carte .bouton');

      return {
        bodyText: ratio(bodyCs.color, bodyCs.backgroundColor),
        carteText: ratio(carteCs.color, carteCs.backgroundColor),
        mutedHelpOnCarte: ratio(aideCs.color, carteCs.backgroundColor),
        activeNavOnNav: ratio(getComputedStyle(navActive).color, getComputedStyle(navContainer).backgroundColor),
        cardButtonText: ratio(getComputedStyle(btn).color, getComputedStyle(btn).backgroundColor),
      };
    });

    console.log('   Computed Omni contrast ratios (Reglages):', contrastReport);
    for (const [key, val] of Object.entries(contrastReport)) {
      assert.ok(val >= 4.5, `WCAG AA contrast failed for ${key}: ${val.toFixed(2)} < 4.5`);
    }

    // Also measure .bouton-principal & .bouton-flottant on TableauDeBord / Budgets
    await page.getByRole('button', { name: /Budgets/ }).click();
    await page.waitForSelector('.bouton-principal');
    const primaryContrast = await page.evaluate(() => {
      function parseRgb(str) {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      function lum([r, g, b]) {
        const f = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      }
      function ratio(fgStr, bgStr) {
        const l1 = lum(parseRgb(fgStr));
        const l2 = lum(parseRgb(bgStr));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      const btn = document.querySelector('.bouton-principal');
      const label = document.querySelector('.champ-etiquette');
      const carte = document.querySelector('.carte');
      return {
        primaryBtnText: ratio(getComputedStyle(btn).color, getComputedStyle(btn).backgroundColor),
        labelOnCarte: ratio(getComputedStyle(label).color, getComputedStyle(carte).backgroundColor),
      };
    });
    console.log('   Computed Omni contrast ratios (Budgets):', primaryContrast);
    for (const [key, val] of Object.entries(primaryContrast)) {
      assert.ok(val >= 4.5, `WCAG AA contrast failed for ${key}: ${val.toFixed(2)} < 4.5`);
    }
    await page.getByRole('button', { name: /Réglages/ }).click();
    await page.waitForSelector('#titre-apparence');

    // Reload and verify anti-FOUC theme-init.js sets data-theme="omni" synchronously before React mounts
    await page.reload({ waitUntil: 'networkidle' });
    const antiFouc = await page.evaluate(() => window.__antiFoucEvents);
    console.log('   Anti-FOUC events on reload:', antiFouc);
    assert.ok(
      antiFouc.some((e) => e.dt === 'omni' && e.reactMounted === false && e.readyState === 'loading'),
      `Expected theme-init.js to set data-theme="omni" while loading before React mounted: ${JSON.stringify(antiFouc)}`
    );

    // Unlock after reload
    await enterPin(page, ['2', '4', '6', '8'], 'Déverrouiller');
    await page.waitForSelector('#contenu-principal');

    // Verify theme options clair, sombre, auto
    await page.getByRole('button', { name: /Réglages/ }).click();
    await page.locator('label', { has: page.locator('input[name="theme"][value="clair"]') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'clair');
    await page.locator('label', { has: page.locator('input[name="theme"][value="sombre"]') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'sombre');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('label', { has: page.locator('input[name="theme"][value="auto"]') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'sombre');
    await page.locator('label', { has: page.locator('input[name="theme"][value="omni"]') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'omni');

    // -----------------------------------------------------------------------
    // 5. Version 2.0.1, Omni-Système SVG logo, licences-tierces.txt & SKILL.md mentions
    // -----------------------------------------------------------------------
    console.log('5. Verifying PageReglages À propos, version 2.0.1, logo, and licences link...');
    const reglagesText = await page.locator('#contenu-principal').innerText();
    assert.ok(reglagesText.includes('Omni-Budget — version 2.0.1'), 'Expected "Omni-Budget — version 2.0.1"');
    assert.ok(reglagesText.includes('CC BY-NC-ND 4.0'), 'Expected CC BY-NC-ND 4.0');
    assert.ok(reglagesText.includes('Ferrus Dantioch'), 'Expected Ferrus Dantioch');
    assert.ok(reglagesText.includes('omni-systeme.choking513@passmail.net'), 'Expected official contact email');
    assert.equal(vouvoiementRe.test(reglagesText), false, 'Found vouvoiement in PageReglages');

    const logoBox = await page.locator('svg.logo-omni').boundingBox();
    assert.ok(logoBox && logoBox.width >= 40 && logoBox.height >= 40, `Expected visible Omni SVG logo, got ${JSON.stringify(logoBox)}`);

    const licHref = await page.locator('a[href$="licences-tierces.txt"]').getAttribute('href');
    assert.equal(licHref, '/omni-budget/licences-tierces.txt');

    // -----------------------------------------------------------------------
    // 6. .bandeau .bouton >= 44px on mobile viewport (using genuine recurring banner)
    // -----------------------------------------------------------------------
    console.log('6. Verifying .bandeau .bouton height >= 44px on mobile...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Dépenses/ }).click();
    await page.getByRole('button', { name: /Récurrentes/ }).click();
    await page.getByRole('button', { name: '+ Ajouter' }).click();
    await page.locator('#champ-libelle').fill('Loyer test');
    await page.locator('#champ-montant-recurrence').fill('500');
    const tomorrow = new Date(Date.now() + 86400000);
    const tomorrowDay = String(tomorrow.getDate());
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    await page.locator('#champ-jour').selectOption(tomorrowDay);
    await page.locator('#champ-date-debut').fill(tomorrowIso);
    await page.getByRole('button', { name: 'Créer la récurrence' }).click();
    await page.waitForSelector('text=Loyer test');

    // Lock and unlock so startup reminder check triggers the real .bandeau with "J’ai vu" button
    await page.getByRole('button', { name: 'Verrouiller l’application maintenant' }).click();
    await enterPin(page, ['2', '4', '6', '8'], 'Déverrouiller');
    await page.waitForSelector('.bandeau .bouton');

    const bandeauBtnBox = await page.locator('.bandeau .bouton').first().boundingBox();
    console.log('   Mobile .bandeau .bouton boundingBox:', bandeauBtnBox);
    assert.ok(
      bandeauBtnBox && bandeauBtnBox.height >= 44,
      `Expected .bandeau .bouton height >= 44px, got ${JSON.stringify(bandeauBtnBox)}`
    );

    // Check zero CSP / console / external errors across all online flows
    const collectedCsp = await page.evaluate(() => window.__cspEvents || []);
    cspViolations.push(...collectedCsp);
    assert.deepEqual(cspViolations, [], `CSP violations detected: ${JSON.stringify(cspViolations)}`);
    assert.deepEqual(consoleErrors, [], `Console errors detected: ${JSON.stringify(consoleErrors)}`);
    assert.deepEqual(pageErrors, [], `Page errors detected: ${JSON.stringify(pageErrors)}`);
    assert.deepEqual(externalRequests, [], `External network requests detected: ${JSON.stringify(externalRequests)}`);

    // -----------------------------------------------------------------------
    // 7. Offline PWA behavior: cached app, licences-tierces.txt (200), uncached (503)
    // -----------------------------------------------------------------------
    console.log('7. Testing offline mode (app, licences-tierces.txt -> 200, uncached -> 503)...');
    allowOfflineNetworkErrors = true;
    await context.setOffline(true);

    const offlineHomeRes = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    assert.equal(offlineHomeRes.status(), 200, 'Offline app root should return 200 from SW cache');
    await page.waitForSelector('h1');

    const offlineLicRes = await page.goto(`${baseUrl}licences-tierces.txt`, { waitUntil: 'domcontentloaded' });
    assert.equal(offlineLicRes.status(), 200, 'Offline licences-tierces.txt should return 200 from SW cache');
    const offlineLicText = await offlineLicRes.text();
    assert.ok(
      offlineLicText.includes('Licences des bibliotheques tierces'),
      'Offline licences-tierces.txt must serve the actual license text, not index.html'
    );

    const offlineMissingNavRes = await page.goto(`${baseUrl}inexistant-test.txt`, { waitUntil: 'domcontentloaded' });
    assert.equal(offlineMissingNavRes.status(), 503, 'Offline navigation to uncached .txt must return 503');

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const offlineMissingFetchStatus = await page.evaluate(async () => {
      const res = await fetch('/omni-budget/inexistant-test.txt');
      return res.status;
    });
    assert.equal(offlineMissingFetchStatus, 503, 'Offline fetch to uncached resource must return 503');

    console.log('ALL E2E CHECKS PASSED.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
