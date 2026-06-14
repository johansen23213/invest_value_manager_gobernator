/**
 * scripts/demo-screenshots.mjs
 *
 * Captura screenshots reales de la app Vetlla y genera un PDF de demo.
 * Node ESM standalone — sin dependencias fuera de @playwright/test.
 *
 * Uso:
 *   node scripts/demo-screenshots.mjs
 *
 * Requiere la app corriendo en http://localhost:3000 con el seed de demo
 * cargado (pnpm --filter @vetlla/db run seed).
 */

import { chromium } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.DEMO_BASE_URL ?? 'http://localhost:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(REPO_ROOT, 'artifacts', 'shots');
const PDF_PATH = path.join(REPO_ROOT, 'artifacts', 'Vetlla-Demo-Real.pdf');

const VIEWPORT = { width: 1440, height: 960 };
const DEVICE_SCALE = 2;
const LOCALE = 'es-ES';

/** ms to wait after networkidle before screenshot (fonts / transitions) */
const SETTLE_MS = 400;

// ---------------------------------------------------------------------------
// Usuarios demo
// ---------------------------------------------------------------------------

const USERS = {
  director: { email: 'direccion@demo.vetlla.dev', password: 'vetlla1234', label: 'Director' },
  sanitario: { email: 'sanitario@demo.vetlla.dev', password: 'vetlla1234', label: 'Sanitario' },
  auxiliar: { email: 'auxiliar@demo.vetlla.dev', password: 'vetlla1234', label: 'Auxiliar' },
  familiar: { email: 'familiar@demo.vetlla.dev', password: 'vetlla1234', label: 'Familiar' },
};

// ---------------------------------------------------------------------------
// Rutas por rol
// Las rutas con {id} se resuelven dinámicamente (ver resolveId).
// ---------------------------------------------------------------------------

const ROUTES_BY_ROLE = {
  publico: [
    { path: '/login', label: 'Login' },
    { path: '/registro', label: 'Registro' },
  ],
  director: [
    { path: '/', label: 'Inicio' },
    { path: '/residentes', label: 'Residentes — lista' },
    { path: '/residentes/{residenteId}/resumen', label: 'Residente — Resumen' },
    { path: '/residentes/{residenteId}', label: 'Residente — Ficha' },
    { path: '/residentes/{residenteId}/pia', label: 'Residente — PIA' },
    { path: '/valoraciones', label: 'Valoraciones' },
    { path: '/calidad', label: 'Calidad' },
    { path: '/facturacion', label: 'Facturación' },
    { path: '/admisiones', label: 'Admisiones — lista' },
    { path: '/admisiones/{admisionId}', label: 'Admisión — Detalle' },
    { path: '/actividades', label: 'Actividades' },
    { path: '/comunicacion', label: 'Comunicación' },
    { path: '/comunicacion/comunicados', label: 'Comunicados' },
    { path: '/visitas', label: 'Visitas' },
    { path: '/ocupacion', label: 'Ocupación' },
    { path: '/equipo', label: 'Equipo' },
    { path: '/auditoria', label: 'Auditoría' },
    { path: '/cuenta/seguridad', label: 'Cuenta — Seguridad' },
  ],
  sanitario: [
    { path: '/', label: 'Inicio' },
    { path: '/residentes/{residenteId}/medicacion', label: 'Residente — Medicación' },
    { path: '/valoraciones', label: 'Valoraciones' },
  ],
  auxiliar: [
    { path: '/atencion', label: 'Atención directa' },
    { path: '/relevo', label: 'Relevo' },
    { path: '/actividades', label: 'Actividades' },
  ],
  familiar: [
    { path: '/portal', label: 'Portal — Inicio' },
    { path: '/portal/visitas', label: 'Portal — Visitas' },
    { path: '/portal/solicitudes', label: 'Portal — Solicitudes' },
    { path: '/portal/comunicados', label: 'Portal — Comunicados' },
    { path: '/portal/mensajes', label: 'Portal — Mensajes' },
    { path: '/portal/actividades', label: 'Portal — Actividades' },
    { path: '/portal/facturas', label: 'Portal — Facturas' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Espera networkidle + settle + fuentes antes de capturar.
 * @param {import('@playwright/test').Page} page
 */
async function waitReady(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
  } catch {
    // Si pasa el timeout, continuamos igualmente
  }
  // Espera a que el contenido principal esté presente (evita capturar en plena
  // carga, con el esqueleto/"Cargando…" todavía visible → página "en blanco").
  try {
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 10_000 });
    // Espera a que desaparezca cualquier indicador de carga residual.
    await page
      .getByText(/Cargando|Carregant/i)
      .first()
      .waitFor({ state: 'hidden', timeout: 8_000 })
      .catch(() => {});
  } catch {
    // Sin <main>: puede ser una página de error; se captura igualmente y se verá.
  }
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Login real por la UI en /login.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {{ email: string, password: string }} user
 */
async function loginContext(ctx, user) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitReady(page);

    // Rellena email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[id="email"]').first();
    await emailInput.fill(user.email);

    // Rellena password
    const pwInput = page.locator('input[type="password"], input[name="password"], input[id="password"]').first();
    await pwInput.fill(user.password);

    // Submit — busca botón de submit o el primero del form
    const submitBtn = page
      .locator('button[type="submit"], form button')
      .first();
    await submitBtn.click();

    // Espera que salga de /login
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    await waitReady(page);

    // Verifica que la sesión PERSISTE: navega a "/" y confirma que no rebota a
    // /login. Sin esto, un login que "navega" pero no fija una cookie de sesión
    // válida (Secure sobre http, host no confiable, AUTH_SECRET ausente) generaría
    // un PDF lleno de /login SIN avisar. Preferimos fallar ruidosamente (exit 1).
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/login')) {
      throw new Error(
        `[LOGIN] La sesión no persistió para ${user.email}: "/" redirige a /login. ` +
        'Revisa AUTH_URL / trustHost / cookies / AUTH_SECRET en el entorno de la app.',
      );
    }
  } finally {
    await page.close();
  }
}

/**
 * Resuelve el primer ID disponible navegando a una ruta de lista.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {string} listPath  p.ej. '/residentes'
 * @param {string} segment   segmento de la URL tras la lista, p.ej. '/residentes/'
 * @returns {Promise<string|null>}
 */
async function resolveFirstId(ctx, listPath, segment) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}${listPath}`, { waitUntil: 'domcontentloaded' });
    await waitReady(page);

    // Intenta encontrar un enlace que contenga el segmento
    const link = page.locator(`a[href*="${segment}"]`).first();
    const href = await link.getAttribute('href', { timeout: 5_000 }).catch(() => null);
    if (!href) return null;

    // Extrae el id del href: /residentes/abc123/... → abc123
    const re = new RegExp(`${segment}([^/?#]+)`);
    const m = href.match(re);
    return m ? m[1] : null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Captura full-page PNG y guarda en SHOTS_DIR.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {string} url         URL completa
 * @param {string} filename    nombre del fichero (sin .png)
 * @returns {Promise<{filename: string, label: string, url: string, skipped: boolean}>}
 */
async function captureShot(ctx, url, filename, label) {
  const page = await ctx.newPage();
  const result = { filename: `${filename}.png`, label, url, skipped: false };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Detecta redirects a /login (403 lógico) o 404
    const finalUrl = page.url();
    const statusCode = response?.status() ?? 0;

    if (statusCode === 404 || statusCode >= 500) {
      console.warn(`  [SKIP] ${url} → HTTP ${statusCode}`);
      result.skipped = true;
      return result;
    }

    // Si redirigió a login significa que el rol no tiene acceso
    if (finalUrl.includes('/login')) {
      console.warn(`  [SKIP] ${url} → redirigido a /login (sin acceso para este rol)`);
      result.skipped = true;
      return result;
    }

    await waitReady(page);

    const outPath = path.join(SHOTS_DIR, `${filename}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`  [OK]   ${url} → ${filename}.png`);
  } catch (err) {
    console.warn(`  [ERR]  ${url} → ${err.message}`);
    result.skipped = true;
  } finally {
    await page.close();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Generador de PDF via Playwright (sin deps extra)
// ---------------------------------------------------------------------------

/**
 * Construye un HTML de galería y lo exporta como PDF con Playwright.
 * @param {import('@playwright/test').Browser} browser
 * @param {Array<{filename: string, label: string, url: string, skipped: boolean, rol: string}>} shots
 */
async function buildPdf(browser, shots) {
  const captured = shots.filter((s) => !s.skipped);

  // Construye las imágenes como data URIs para que file:// funcione en page.pdf
  /** @type {Array<{dataUri: string, label: string, url: string, rol: string}>} */
  const pages = [];
  for (const shot of captured) {
    const filePath = path.join(SHOTS_DIR, shot.filename);
    try {
      const buf = await fs.readFile(filePath);
      const dataUri = `data:image/png;base64,${buf.toString('base64')}`;
      pages.push({ dataUri, label: shot.label, url: shot.url, rol: shot.rol });
    } catch {
      // Fichero no existe (captura fallida silenciosa)
    }
  }

  // ---- Paleta Vetlla (teal + coral + cream) ----
  const TEAL = '#0D9488';
  const CORAL = '#F97066';
  const CREAM = '#FAF7F2';
  const DARK = '#1C2B3A';

  // ---- HTML de portada + índice + galería ----
  const coverHtml = `
    <div class="cover">
      <div class="cover-inner">
        <div class="logo-pill">Vetlla</div>
        <h1>Demo de producto</h1>
        <p class="subtitle">UI renderizada real · ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p class="tagline">SaaS cloud-native para centros del sector de la dependencia</p>
        <div class="badges">
          <span class="badge">multitenant</span>
          <span class="badge">API-first</span>
          <span class="badge">IA agéntica</span>
          <span class="badge">RGPD · datos en la UE</span>
        </div>
      </div>
    </div>
  `;

  // Índice por rol
  const rolesOrder = ['publico', 'director', 'sanitario', 'auxiliar', 'familiar'];
  const byRol = {};
  for (const p of pages) {
    if (!byRol[p.rol]) byRol[p.rol] = [];
    byRol[p.rol].push(p);
  }

  let indexRows = '';
  let seq = 1; // Página real (portada = 1, índice = 2, luego capturas desde 3)
  const pageMap = {}; // label → número de página visual
  for (const rol of rolesOrder) {
    const group = byRol[rol] ?? [];
    for (const p of group) {
      pageMap[`${rol}::${p.label}`] = seq + 2; // +2 por portada e índice
      seq++;
    }
  }

  for (const rol of rolesOrder) {
    const group = byRol[rol] ?? [];
    if (!group.length) continue;
    indexRows += `<tr class="rol-header"><td colspan="3">${rolLabel(rol)}</td></tr>`;
    for (const p of group) {
      const pgNum = pageMap[`${rol}::${p.label}`] ?? '—';
      indexRows += `<tr><td>${p.label}</td><td class="route">${p.url.replace(BASE_URL, '')}</td><td>${pgNum}</td></tr>`;
    }
  }

  const indexHtml = `
    <div class="index-page">
      <h2>Indice de pantallas</h2>
      <table>
        <thead><tr><th>Pantalla</th><th>Ruta</th><th>Pag.</th></tr></thead>
        <tbody>${indexRows}</tbody>
      </table>
    </div>
  `;

  // Páginas de capturas
  let galleryHtml = '';
  for (const rol of rolesOrder) {
    const group = byRol[rol] ?? [];
    for (const p of group) {
      galleryHtml += `
        <div class="shot-page">
          <div class="shot-header">
            <span class="shot-role">${rolLabel(p.rol)}</span>
            <span class="shot-label">${p.label}</span>
            <span class="shot-route">${p.url.replace(BASE_URL, '')}</span>
          </div>
          <div class="shot-img-wrap">
            <img src="${p.dataUri}" alt="${p.label}" />
          </div>
        </div>
      `;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; background: ${CREAM}; color: ${DARK}; }

  /* --- Portada --- */
  .cover {
    width: 297mm; height: 210mm;
    background: linear-gradient(135deg, ${TEAL} 0%, #065F5B 100%);
    display: flex; align-items: center; justify-content: center;
    page-break-after: always;
  }
  .cover-inner { text-align: center; color: white; padding: 40px; }
  .logo-pill {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    color: white;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 6px 20px;
    margin-bottom: 32px;
    border: 1px solid rgba(255,255,255,0.3);
  }
  .cover h1 { font-size: 52px; font-weight: 800; line-height: 1.1; margin-bottom: 16px; }
  .cover .subtitle { font-size: 18px; opacity: 0.85; margin-bottom: 8px; }
  .cover .tagline { font-size: 14px; opacity: 0.65; margin-bottom: 32px; }
  .badges { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .badge {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 600;
    color: white;
  }

  /* --- Índice --- */
  .index-page {
    width: 297mm; min-height: 210mm;
    padding: 36px 48px;
    page-break-after: always;
    background: ${CREAM};
  }
  .index-page h2 {
    font-size: 28px; font-weight: 700; color: ${TEAL};
    margin-bottom: 24px; padding-bottom: 12px;
    border-bottom: 2px solid ${TEAL};
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead tr { background: ${TEAL}; color: white; }
  thead th { padding: 8px 10px; text-align: left; font-weight: 600; }
  tbody tr { border-bottom: 1px solid #E5E0D8; }
  tbody tr:hover { background: #F0EDE8; }
  .rol-header td {
    padding: 10px 10px 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${CORAL};
    background: #F5F2ED;
  }
  td { padding: 7px 10px; }
  td.route { font-family: 'Courier New', monospace; font-size: 10px; color: #666; }

  /* --- Páginas de captura --- */
  .shot-page {
    width: 297mm; height: 210mm;
    display: flex; flex-direction: column;
    page-break-after: always;
    background: ${DARK};
    overflow: hidden;
  }
  .shot-header {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 16px;
    background: ${DARK};
    flex-shrink: 0;
  }
  .shot-role {
    background: ${TEAL}; color: white;
    font-size: 10px; font-weight: 700;
    border-radius: 4px; padding: 2px 8px;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .shot-label { color: white; font-size: 13px; font-weight: 600; flex: 1; }
  .shot-route { color: #8A9BB0; font-size: 10px; font-family: 'Courier New', monospace; }
  .shot-img-wrap {
    flex: 1; overflow: hidden;
    display: flex; align-items: flex-start; justify-content: center;
    background: white;
  }
  .shot-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
</style>
</head>
<body>
${coverHtml}
${indexHtml}
${galleryHtml}
</body>
</html>`;

  const pdfPage = await browser.newPage();
  try {
    await pdfPage.setContent(html, { waitUntil: 'networkidle' });
    await pdfPage.waitForTimeout(500);
    await pdfPage.pdf({
      path: PDF_PATH,
      format: 'A4',
      landscape: true,
      printBackground: true,
    });
    console.log(`\nPDF generado: ${PDF_PATH}`);
  } finally {
    await pdfPage.close();
  }
}

/** @param {string} rol */
function rolLabel(rol) {
  return { publico: 'Publico', director: 'Director', sanitario: 'Sanitario', auxiliar: 'Auxiliar', familiar: 'Familiar' }[rol] ?? rol;
}

// ---------------------------------------------------------------------------
// Orquestación principal
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  /** @type {Array<{filename: string, label: string, url: string, skipped: boolean, rol: string}>} */
  const allShots = [];
  let counter = 0;

  function pad(n) {
    return String(n).padStart(3, '0');
  }

  try {
    // ------------------------------------------------------------------
    // 1. Páginas públicas (sin sesión)
    // ------------------------------------------------------------------
    console.log('\n=== ROL: Público ===');
    const publicCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      locale: LOCALE,
    });
    for (const route of ROUTES_BY_ROLE.publico) {
      counter++;
      const filename = `${pad(counter)}-publico-${slugify(route.label)}`;
      const shot = await captureShot(publicCtx, `${BASE_URL}${route.path}`, filename, route.label);
      allShots.push({ ...shot, rol: 'publico' });
    }
    await publicCtx.close();

    // ------------------------------------------------------------------
    // 2. Director
    // ------------------------------------------------------------------
    console.log('\n=== ROL: Director ===');
    const dirCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      locale: LOCALE,
    });
    await loginContext(dirCtx, USERS.director);

    // Resuelve IDs dinámicos
    const residenteId = await resolveFirstId(dirCtx, '/residentes', '/residentes/');
    const admisionId = await resolveFirstId(dirCtx, '/admisiones', '/admisiones/');

    for (const route of ROUTES_BY_ROLE.director) {
      counter++;
      // Salta rutas de detalle cuyo ID dinámico no se pudo resolver (evita
      // capturar páginas not-found en blanco).
      if (route.path.includes('{residenteId}') && !residenteId) {
        console.warn(`  [SKIP] ${route.label}: sin residenteId resoluble`);
        continue;
      }
      if (route.path.includes('{admisionId}') && !admisionId) {
        console.warn(`  [SKIP] ${route.label}: sin admisionId resoluble`);
        continue;
      }
      let resolvedPath = route.path
        .replace('{residenteId}', residenteId ?? 'not-found')
        .replace('{admisionId}', admisionId ?? 'not-found');
      const filename = `${pad(counter)}-director-${slugify(route.label)}`;
      const shot = await captureShot(dirCtx, `${BASE_URL}${resolvedPath}`, filename, route.label);
      allShots.push({ ...shot, rol: 'director' });
    }
    await dirCtx.close();

    // ------------------------------------------------------------------
    // 3. Sanitario
    // ------------------------------------------------------------------
    console.log('\n=== ROL: Sanitario ===');
    const sanCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      locale: LOCALE,
    });
    await loginContext(sanCtx, USERS.sanitario);

    // Sanitario también necesita residenteId — navega a la lista
    const residenteIdSan = residenteId ?? (await resolveFirstId(sanCtx, '/residentes', '/residentes/'));

    for (const route of ROUTES_BY_ROLE.sanitario) {
      counter++;
      if (route.path.includes('{residenteId}') && !residenteIdSan) {
        console.warn(`  [SKIP] ${route.label}: sin residenteId resoluble`);
        continue;
      }
      const resolvedPath = route.path.replace('{residenteId}', residenteIdSan ?? 'not-found');
      const filename = `${pad(counter)}-sanitario-${slugify(route.label)}`;
      const shot = await captureShot(sanCtx, `${BASE_URL}${resolvedPath}`, filename, route.label);
      allShots.push({ ...shot, rol: 'sanitario' });
    }
    await sanCtx.close();

    // ------------------------------------------------------------------
    // 4. Auxiliar
    // ------------------------------------------------------------------
    console.log('\n=== ROL: Auxiliar ===');
    const auxCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      locale: LOCALE,
    });
    await loginContext(auxCtx, USERS.auxiliar);

    for (const route of ROUTES_BY_ROLE.auxiliar) {
      counter++;
      const filename = `${pad(counter)}-auxiliar-${slugify(route.label)}`;
      const shot = await captureShot(auxCtx, `${BASE_URL}${route.path}`, filename, route.label);
      allShots.push({ ...shot, rol: 'auxiliar' });
    }
    await auxCtx.close();

    // ------------------------------------------------------------------
    // 5. Familiar (portal)
    // ------------------------------------------------------------------
    console.log('\n=== ROL: Familiar ===');
    const famCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      locale: LOCALE,
    });
    await loginContext(famCtx, USERS.familiar);

    for (const route of ROUTES_BY_ROLE.familiar) {
      counter++;
      const filename = `${pad(counter)}-familiar-${slugify(route.label)}`;
      const shot = await captureShot(famCtx, `${BASE_URL}${route.path}`, filename, route.label);
      allShots.push({ ...shot, rol: 'familiar' });
    }
    await famCtx.close();

    // ------------------------------------------------------------------
    // 6. Generar PDF
    // ------------------------------------------------------------------
    console.log('\n=== Generando PDF ===');
    const captured = allShots.filter((s) => !s.skipped);
    const skipped = allShots.filter((s) => s.skipped);
    console.log(`Capturas OK: ${captured.length} | Omitidas: ${skipped.length}`);
    if (skipped.length) {
      console.log('Omitidas:');
      for (const s of skipped) console.log(`  - ${s.url}`);
    }

    await buildPdf(browser, allShots);
  } finally {
    await browser.close();
  }

  console.log('\nListo. Artefactos en artifacts/');
}

/** Convierte un label en slug de fichero seguro */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
