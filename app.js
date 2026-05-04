/**
 * OILWATCH — Oil Price Dashboard
 * Data source: samhwa.biz (via CORS proxy)
 * Falls back to last known data embedded from scrape if proxy fails.
 */

/* ────────────────────────────────────────────
   STATIC SEED DATA (from samhwa.biz scrape)
   Used as fallback / initial render
──────────────────────────────────────────── */
const FX_ITEMS = [
  { id: 'usd', label: 'USD' },
  { id: 'eur', label: 'EUR' },
  { id: 'jpy', label: 'JPY' },
  { id: 'cny', label: 'CNY' },
];

const SEED = {
  international: {
    wti:   { val:  99.93, chg: +3.56, rate: '3.69%', date: '2026.04.28' },
    brent: { val: 104.40, chg: +2.71, rate: '2.66%', date: '2026.04.28' },
    dubai: { val: 101.45, chg: +1.10, rate: '1.10%', date: '2026.04.28' },
  },
  domestic: {
    today: { gasoline: 122.19, kerosene: 208.79, diesel: 170.31 },
    prev:  { gasoline: 118.68, kerosene: 186.54, diesel: 155.07 },
  },
  product: {
    premium:  { val: 2395.05, chg: -2.72 },
    regular:  { val: 2003.81, chg: -0.95 },
    kerosene: { val: 1608.15, chg: -1.23 },
    diesel:   { val: 1997.69, chg: -1.19 },
  },
  station: {
    gasoline: { val: 2009.08, chg: +0.43, rate: '0.02%', date: '2026.04.29' },
    premium:  { val: 2417.79, chg: +2.02, rate: '0.08%', date: '2026.04.29' },
    diesel:   { val: 2003.28, chg: +0.33, rate: '0.02%', date: '2026.04.29' },
  },
  factory: {
    sk:      { gasoline: 2311, kerosene: 2277, diesel: 2485 },
    gs:      { gasoline: 2189, kerosene: 2231, diesel: 2397 },
    hyundai: { gasoline: 2288, kerosene: 2231, diesel: 2529 },
    soil:    { gasoline: null, kerosene: null,  diesel: null  },
    hanwha:  { gasoline: null, kerosene: null,  diesel: null  },
  },
  week: '2026년 4월 5주차',
  forex: {
    usd: { val: 1478.40, chg: +3.90 },
    eur: { val: 1730.50, chg: +2.75 },
    jpy: { val:  924.83, chg: +0.78 },
    cny: { val:  216.25, chg: +0.63 },
  },
};

/* ────────────────────────────────────────────
   STATE
──────────────────────────────────────────── */
let state = JSON.parse(JSON.stringify(SEED)); // deep copy
let activeCompany = 'sk';
let fetchAttempted = false;
let forexDate = null; // 하나은행 기준 시각 문자열

/* ────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const fmt = (n, dec = 2) =>
  n != null ? Number(n).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

function chgClass(v) {
  if (v == null) return 'flat';
  return v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
}

function chgStr(v, prefix = '') {
  if (v == null) return '—';
  const sign = v > 0 ? '▲' : v < 0 ? '▼' : '—';
  return `${sign} ${prefix}${Math.abs(v).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

function setEl(id, text, cls = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  if (cls) {
    el.className = el.className.replace(/\b(up|down|flat)\b/g, '').trim();
    el.classList.add(cls);
  }
}

function removeSkeleton(el) {
  if (el) el.classList.remove('skeleton', 'skeleton-row');
}

/* ────────────────────────────────────────────
   RENDER FUNCTIONS
──────────────────────────────────────────── */
function renderInternational() {
  const d = state.international;
  const entries = [
    { key: 'wti',   label: 'wti'   },
    { key: 'brent', label: 'brent' },
    { key: 'dubai', label: 'dubai' },
  ];
  entries.forEach(({ key, label }) => {
    const o = d[key];
    const cls = chgClass(o.chg);
    setEl(`${label}-val`,  fmt(o.val, 2));
    setEl(`${label}-chg`,  chgStr(o.chg), cls);
    setEl(`${label}-rate`, o.rate ? (o.chg >= 0 ? '+' : '') + o.rate : '—');
    setEl(`${label}-date`, o.date ? o.date + ' 기준' : '—');
    $(label + '-val')?.closest('.price-block')?.classList.remove('skeleton');
  });

  // Ticker
  $('t-wti').textContent   = fmt(d.wti.val, 2);
  $('t-brent').textContent = fmt(d.brent.val, 2);
  $('t-dubai').textContent = fmt(d.dubai.val, 2);
}

function renderDomestic() {
  const { today, prev } = state.domestic;
  setEl('dom-gas-today',    fmt(today.gasoline, 2));
  setEl('dom-kero-today',   fmt(today.kerosene, 2));
  setEl('dom-diesel-today', fmt(today.diesel, 2));
  setEl('dom-gas-prev',     fmt(prev.gasoline, 2));
  setEl('dom-kero-prev',    fmt(prev.kerosene, 2));
  setEl('dom-diesel-prev',  fmt(prev.diesel, 2));
  document.querySelectorAll('.skeleton-row').forEach(r => r.classList.remove('skeleton-row'));
}

function renderProduct() {
  const d = state.product;
  const items = ['premium','regular','kerosene','diesel'];
  items.forEach(k => {
    const o = d[k];
    const cls = chgClass(o.chg);
    setEl(`prod-${k}`,     fmt(o.val, 2));
    setEl(`prod-${k}-chg`, chgStr(o.chg), cls);
    $(`prod-${k}`)?.closest('.product-card')?.classList.remove('skeleton');
  });

  // Ticker
  $('t-gasoline').textContent = fmt(d.regular.val, 2) + '원';
  $('t-kerosene').textContent  = fmt(d.kerosene.val, 2) + '원';
  $('t-diesel').textContent    = fmt(d.diesel.val, 2) + '원';
}

function renderStation() {
  const d = state.station;
  const items = [
    { key: 'gasoline', id: 'sta-gas'     },
    { key: 'premium',  id: 'sta-premium' },
    { key: 'diesel',   id: 'sta-diesel'  },
  ];
  items.forEach(({ key, id }) => {
    const o = d[key];
    const cls = chgClass(o.chg);
    setEl(`${id}`,        fmt(o.val, 2));
    setEl(`${id}-chg`,    chgStr(o.chg), cls);
    setEl(`${id}-rate`,   o.rate ? (o.chg >= 0 ? '+' : '') + o.rate : '—');
    setEl(`${id}-date`,   o.date ? o.date + ' 기준' : '—');
    $(`${id}`)?.closest('.station-block')?.classList.remove('skeleton');
  });

  ['sta-gas','sta-premium','sta-diesel'].forEach(id => {
    const chgEl = $(id + '-chg');
    if (!chgEl) return;
    const valEl = $(id);
    if (chgEl.classList.contains('up'))   valEl?.classList.add('up');
    if (chgEl.classList.contains('down')) valEl?.classList.add('down');
  });
}


function renderForex() {
  const d = state.forex;
  FX_ITEMS.forEach(({ id }) => {
    const o = d[id];
    if (!o || o.val == null) return;
    const cls = chgClass(o.chg);
    setEl(`fx-${id}-val`, fmt(o.val, 2));
    setEl(`fx-${id}-chg`, chgStr(o.chg), cls);
    document.getElementById(`fx-${id}-val`)
      ?.closest('.forex-row')?.classList.remove('skeleton');
  });
  if (forexDate) setEl('fx-date', forexDate);
}

function renderFactory(company) {
  const d = state.factory[company];
  if (!d) return;
  const g = d.gasoline != null ? d.gasoline.toLocaleString('ko-KR') : '미공개';
  const k = d.kerosene  != null ? d.kerosene.toLocaleString('ko-KR')  : '미공개';
  const di = d.diesel   != null ? d.diesel.toLocaleString('ko-KR')   : '미공개';
  setEl('fact-gasoline', g);
  setEl('fact-kerosene', k);
  setEl('fact-diesel', di);
  setEl('factoryWeek', state.week);
}

function renderAll() {
  renderInternational();
  renderDomestic();
  renderProduct();
  renderStation();
  renderFactory(activeCompany);
  renderForex();
  updateTimestamp();
  duplicateTicker();
}

function updateTimestamp() {
  const now = new Date();
  $('lastUpdated').textContent = now.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/* Duplicate ticker content so it scrolls seamlessly */
function duplicateTicker() {
  const inner = $('tickerInner');
  if (!inner) return;
  // avoid double-duplication
  if (inner.dataset.duped) return;
  inner.dataset.duped = '1';
  inner.innerHTML += inner.innerHTML;
}

/* ────────────────────────────────────────────
   FETCH — 네이버 금융 유가 크롤링 (국내 + 국제)
   finance.naver.com/marketindex/ → 유가 탭
   국내: 휘발유/고급휘발유/경유 (원/리터)
   국제: WTI/Brent/Dubai (달러/배럴)
──────────────────────────────────────────── */
async function fetchNaverStation() {
  const naverUrl = 'https://finance.naver.com/marketindex/';
  for (const makeProxy of FX_PROXIES) {
    const proxyUrl = makeProxy(naverUrl);
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await proxyText(res);
      const { domestic, intl } = parseNaverOilPrices(html);
      if (domestic > 0) { renderStation();        console.log('[OilWatch] 국내유가 갱신:', domestic, '건'); }
      if (intl     > 0) { renderInternational();  console.log('[OilWatch] 국제유가 갱신:', intl, '건'); }
      if (domestic > 0 || intl > 0) return;
      console.warn('[OilWatch] 유가 파싱 결과 없음 — 다음 proxy');
    } catch (e) {
      console.warn('[OilWatch] 유가 fetch 실패:', e.message);
    }
  }
  console.warn('[OilWatch] 유가 전체 실패 — seed 유지');
}

function parseNaverOilPrices(html) {
  if (!html || typeof html !== 'string') return { domestic: 0, intl: 0 };
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 국내 유종 (원/리터)
  const DOMESTIC_MAP = {
    'OIL_GSL':  'gasoline', 'OIL%5FGSL':  'gasoline',
    'OIL_HGSL': 'premium',  'OIL%5FHGSL': 'premium',
    'OIL_LO':   'diesel',   'OIL%5FLO':   'diesel',
  };
  // 국제 유종 (달러/배럴)
  const INTL_MAP = {
    'OIL_CL':  'wti',   'OIL%5FCL':  'wti',    // WTI 서부텍사스유
    'OIL_BRT': 'brent', 'OIL%5FBRT': 'brent',  // 브렌트유
    'OIL_DU':  'dubai', 'OIL%5FDU':  'dubai',  // 두바이유
  };

  let domestic = 0, intl = 0;

  doc.querySelectorAll('a[href*="OIL"]').forEach(anchor => {
    const href = anchor.getAttribute('href') || '';
    const row  = anchor.closest('tr');
    if (!row) return;
    const cells = [...row.querySelectorAll('td')];
    if (cells.length < 4) return;

    const unitText = cells[1]?.textContent || '';
    const val = parseFloat((cells[2]?.textContent || '').replace(/,/g, '').trim());
    if (isNaN(val)) return;

    const chgCell = cells[3];
    const chgNum  = parseFloat((chgCell?.textContent || '').replace(/,/g, '').replace(/[^\d.]/g, ''));
    const imgAlt  = chgCell?.querySelector('img')?.getAttribute('alt') ?? '';
    const isDown  = imgAlt.includes('하락') || imgAlt.includes('down');
    const chg     = isNaN(chgNum) ? null : (isDown ? -chgNum : chgNum);
    const rate    = (cells[4]?.textContent || '').trim().replace('%', '');
    const date    = (cells[5]?.textContent || '').trim();
    const entry   = { val, chg, rate: rate ? rate + '%' : null, date };

    // 국내 (원/리터)
    if (unitText.includes('원')) {
      for (const [code, key] of Object.entries(DOMESTIC_MAP)) {
        if (href.includes(code)) { state.station[key] = entry; domestic++; break; }
      }
    }
    // 국제 (달러/배럴)
    if (unitText.includes('달러')) {
      for (const [code, key] of Object.entries(INTL_MAP)) {
        if (href.includes(code)) { state.international[key] = entry; intl++; break; }
      }
    }
  });

  return { domestic, intl };
}

/* ────────────────────────────────────────────
   FETCH — 네이버 금융 환율 크롤링
   메인 페이지는 서버사이드 렌더링으로 환율 포함
   proxy 2개 순차 시도
──────────────────────────────────────────── */
// 프록시 우선순위:
// 1. /api/proxy  — 자체 Vercel 서버리스 (raw 응답, 가장 안정적)
// 2. allorigins  — JSON {contents:"..."} 래퍼
// 3. corsproxy   — raw 응답 (폴백)
const FX_PROXIES = [
  (u) => `/api/proxy?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

// 프록시 응답에서 실제 HTML/텍스트를 추출
// - /api/proxy, corsproxy.io → raw body (content-type 그대로)
// - allorigins.win           → JSON { contents: "..." }
async function proxyText(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await res.json();
    return typeof j.contents === 'string' ? j.contents : JSON.stringify(j);
  }
  return res.text();
}

/* ────────────────────────────────────────────
   FETCH — 환율 (jsDelivr CDN currency-api, CORS 허용, API키 불필요)
   오늘/전일 두 번 호출 → 전일 대비 등락 계산
──────────────────────────────────────────── */
async function fetchForexAPI() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // CDN 미러 2개 순차 시도 (jsDelivr → Cloudflare Pages)
  const CDN_MIRRORS = [
    (tag) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.min.json`,
    (tag) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.json`,
    (tag) => `https://latest.currency-api.pages.dev/v1/currencies/usd.min.json`.replace('latest', tag === 'latest' ? 'latest' : tag),
  ];

  for (const makeCdnUrl of CDN_MIRRORS) {
    try {
      const [todayRes, yestRes] = await Promise.all([
        fetch(makeCdnUrl('latest'),    { signal: AbortSignal.timeout(10000) }),
        fetch(makeCdnUrl(yesterday),   { signal: AbortSignal.timeout(10000) }),
      ]);
      if (!todayRes.ok) throw new Error('today HTTP ' + todayRes.status);

      const todayData = await todayRes.json();
      const yestData  = yestRes.ok ? await yestRes.json() : null;

      const t = todayData.usd;
      if (!t?.krw) throw new Error('no KRW data in response');
      const y = yestData?.usd;

      const calc = (todayVal, yestVal) => ({
        val: round2(todayVal),
        chg: (y && yestVal) ? round2(todayVal - yestVal) : null,
      });

      state.forex = {
        usd: calc(t.krw,                   y?.krw),
        eur: calc(t.krw / t.eur,           y ? y.krw / y.eur  : null),
        jpy: calc((t.krw / t.jpy) * 100,  y ? (y.krw / y.jpy) * 100 : null),
        cny: calc(t.krw / t.cny,          y ? y.krw / y.cny  : null),
      };

      forexDate = (todayData.date || '').replace(/-/g, '.') + ' currency-api 기준';
      renderForex();
      console.log('[OilWatch] 환율 API 갱신 (currency-api)');
      return true;
    } catch (e) {
      console.warn('[OilWatch] 환율 API 실패:', e.message);
    }
  }
  return false;
}

/* ────────────────────────────────────────────
   FETCH — 국제유가 (Yahoo Finance JSON, CORS 프록시 경유)
   HTML 스크래핑보다 JSON 파싱이 훨씬 안정적
──────────────────────────────────────────── */
async function fetchOilYahoo() {
  const TICKERS = [
    { symbol: 'CL=F', key: 'wti',   label: 'WTI'   },
    { symbol: 'BZ=F', key: 'brent', label: 'Brent' },
  ];

  let updated = 0;

  for (const { symbol, key, label } of TICKERS) {
    const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

    for (const makeProxy of FX_PROXIES) {
      try {
        const res = await fetch(makeProxy(yahooUrl), { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        // proxyText로 문자열을 받은 뒤 JSON 파싱
        // allorigins 래퍼({contents:"..."}) 처리는 proxyText 내부에서 완료
        const rawText = await proxyText(res);
        let chartData;
        try { chartData = JSON.parse(rawText); }
        catch { throw new Error('JSON parse failed'); }

        const result = chartData?.chart?.result?.[0];
        if (!result?.meta) throw new Error('no chart result');

        const price    = result.meta.regularMarketPrice;
        const prevClose = result.meta.previousClose ?? result.meta.chartPreviousClose;
        if (!price) throw new Error('no price');

        const chg  = prevClose ? round2(price - prevClose) : null;
        const rate = prevClose ? (((price - prevClose) / prevClose) * 100).toFixed(2) + '%' : null;
        const ts   = result.meta.regularMarketTime;
        const date = ts
          ? new Date(ts * 1000).toLocaleDateString('ko-KR', {
              year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
            }).replace(/\.\s*/g, '.').replace(/\.$/, '')
          : null;

        state.international[key] = { val: round2(price), chg, rate, date };
        updated++;
        console.log(`[OilWatch] ${label} Yahoo 갱신: $${price}`);
        break;
      } catch (e) {
        console.warn(`[OilWatch] ${label} Yahoo 실패:`, e.message);
      }
    }
  }

  if (updated > 0) renderInternational();
  return updated;
}

async function fetchForex() {
  // finance.naver.com/ 메인 페이지는 환율 테이블이 SSR로 포함됨
  const naverUrl = 'https://finance.naver.com/';

  for (const makeProxy of FX_PROXIES) {
    const proxyUrl = makeProxy(naverUrl);
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await proxyText(res);
      const found = parseNaverForex(html);
      if (found) {
        renderForex();
        console.log('[OilWatch] 네이버 환율 갱신 (' + proxyUrl.slice(0, 40) + '...)');
        return;
      }
      console.warn('[OilWatch] 파싱 결과 없음 — 다음 proxy 시도');
    } catch (e) {
      console.warn('[OilWatch] 환율 fetch 실패:', e.message);
    }
  }
  console.warn('[OilWatch] 환율 전체 실패 — seed 값 유지');
}

function parseNaverForex(html) {
  if (!html || typeof html !== 'string') return false;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const TARGETS = [
    { kw: 'USD', id: 'usd' },
    { kw: 'EUR', id: 'eur' },
    { kw: 'JPY', id: 'jpy' },
    { kw: 'CNY', id: 'cny' },
  ];

  // 로컬 수집 객체 사용 — seed/이전 값에 의한 skip 방지
  const collected = {};
  let found = 0;

  // ── 전략 A: <a href*=exchange> 포함 행 ──────────────
  doc.querySelectorAll('a[href*="exchange"], a[href*="Exchange"]').forEach(a => {
    const txt = a.textContent.trim();
    const row = a.closest('tr');
    if (!row) return;
    tryExtractRow(row, txt, TARGETS, collected, () => { found++; });
  });

  // ── 전략 B: 모든 <tr> brute-force ────────────────────
  if (found === 0) {
    doc.querySelectorAll('tr').forEach(row => {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 2) return;
      const txt = cells[0].textContent.trim();
      tryExtractRow(row, txt, TARGETS, collected, () => { found++; });
    });
  }

  // ── 수집된 값을 state에 반영 ─────────────────────────
  if (found > 0) {
    Object.assign(state.forex, collected);
    const bt = doc.body?.textContent || '';
    const m  = bt.match(/(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2})\s*하나은행\s*기준/);
    forexDate = m ? m[1] + ' 하나은행 기준' : null;
    console.log('[OilWatch] 파싱 완료 — found:', found, '/ date:', forexDate);
  }
  return found > 0;
}

function tryExtractRow(row, nameText, TARGETS, collected, onFound) {
  const cells = [...row.querySelectorAll('td')];
  if (cells.length < 2) return;

  for (const { kw, id } of TARGETS) {
    if (!nameText.includes(kw)) continue;
    if (collected[id] != null) continue; // 같은 통화 중복 처리 방지

    // 값: 첫 번째 숫자셀 찾기
    let val = null, valIdx = -1;
    for (let i = 1; i < cells.length; i++) {
      const n = parseFloat(cells[i].textContent.replace(/,/g, '').trim());
      if (!isNaN(n) && n > 0) { val = n; valIdx = i; break; }
    }
    if (val === null) continue;

    // 등락: 다음 셀
    let chg = null;
    const chgCell = valIdx + 1 < cells.length ? cells[valIdx + 1] : null;
    if (chgCell) {
      const rawTxt  = chgCell.textContent.replace(/,/g, '').trim();
      const chgNum  = parseFloat(rawTxt.replace(/[^\d.]/g, ''));
      const imgAlt  = chgCell.querySelector('img')?.getAttribute('alt') ?? '';
      const spanCls = chgCell.querySelector('span')?.className ?? '';
      const isDown  = imgAlt.includes('하락') || spanCls.includes('down') || spanCls.includes('minus');
      if (!isNaN(chgNum)) chg = isDown ? -chgNum : chgNum;
    }

    collected[id] = { val, chg };
    onFound();
    break;
  }
}

/* ────────────────────────────────────────────
   FETCH — samhwa.biz (CORS proxy 순차 시도)
──────────────────────────────────────────── */
async function fetchSamhwa() {
  const samhwaUrl = 'https://www.samhwa.biz/';
  for (const makeProxy of FX_PROXIES) {
    const proxyUrl = makeProxy(samhwaUrl);
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error('proxy ' + res.status);
      const html = await proxyText(res);
      parseAndApply(html);
      console.log('[OilWatch] samhwa 갱신 (' + proxyUrl.slice(0, 40) + '...)');
      return true;
    } catch (e) {
      console.warn('[OilWatch] samhwa fetch 실패:', e.message);
    }
  }
  console.warn('[OilWatch] samhwa 전체 실패 — seed 유지');
  return false;
}

/* ────────────────────────────────────────────
   PARSE HTML response from samhwa.biz
──────────────────────────────────────────── */
function parseAndApply(html) {
  if (!html) return;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = [...doc.querySelectorAll('table')];

  let changed = false;

  tables.forEach(tbl => {
    const rows = [...tbl.querySelectorAll('tr')];
    rows.forEach(row => {
      const cells = [...row.querySelectorAll('td')].map(c => c.textContent.trim());
      if (!cells.length) return;
      // 국제유가(international)·국내유가(station)는 네이버 금융에서 전담 —
      // samhwa 데이터로 덮어쓰지 않음
    });

    // Domestic oil: table with 일자/당일/전일 columns
    const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim());
    if (headers.includes('일자') && headers.includes('휘발유 (92RON)')) {
      rows.forEach(row => {
        const cells = [...row.querySelectorAll('td')].map(c => c.textContent.trim());
        if (cells[0] === '당일') {
          state.domestic.today = parseDomesticRow(cells);
          changed = true;
        }
        if (cells[0] === '전일') {
          state.domestic.prev = parseDomesticRow(cells);
          changed = true;
        }
      });
    }

    // Product price: 고급휘발유 / 보통휘발유 / 실내등유 / 자동차용경유
    if (headers.includes('고급휘발유') && headers.includes('보통휘발유')) {
      const dataRow = rows.find(r => [...r.querySelectorAll('td')][0]?.textContent.trim() === '당일');
      const diffRow = rows.find(r => [...r.querySelectorAll('td')][0]?.textContent.trim() === '전일대비');
      if (dataRow && diffRow) {
        const vals = [...dataRow.querySelectorAll('td')].map(c => parseFloat(c.textContent.replace(/,/g, '').trim()));
        const diffs = [...diffRow.querySelectorAll('td')].map(c => parseFloat(c.textContent.replace(/,/g, '').trim()));
        state.product.premium  = { val: vals[1], chg: diffs[1] };
        state.product.regular  = { val: vals[2], chg: diffs[2] };
        state.product.kerosene = { val: vals[3], chg: diffs[3] };
        state.product.diesel   = { val: vals[4], chg: diffs[4] };
        changed = true;
      }
    }

    // Factory price — detect SK 공장도가 block
    if (headers.length === 3 && headers[0] === '휘발유' && headers[1] === '등유' && headers[2] === '경유') {
      // Find which company this belongs to
      // heuristic: look for a preceding <h4> or .card-header text
      let companyEl = tbl.closest('div')?.previousElementSibling;
      // Try to find a tab identifier from surrounding context
      const parent = tbl.closest('[class*="tab"]') || tbl.closest('div');
      const r = rows.find(r2 => r2.querySelectorAll('td').length === 3);
      if (r) {
        const vals = [...r.querySelectorAll('td')].map(c => parseFloat(c.textContent.replace(/,/g, '').trim()));
        // We'll map by order of appearance in the HTML
        // fallback: just update SK (first detected)
        if (!changed) {
          state.factory.sk = { gasoline: vals[0] || null, kerosene: vals[1] || null, diesel: vals[2] || null };
          changed = true;
        }
      }
    }
  });

  if (changed) {
    renderDomestic();
    renderProduct();
    renderFactory(activeCompany);
    console.log('[OilWatch] Data refreshed from samhwa.biz');
  }
}

function parseOilRow(cells) {
  const val  = parseFloat((cells[1] || '').replace(/,/g, ''));
  const chg  = parseFloat((cells[2] || '').replace(/,/g, ''));
  const rate = cells[3] || '';
  return { val: isNaN(val) ? null : val, chg: isNaN(chg) ? null : chg, rate };
}

function parseStationRow(cells) {
  const val  = parseFloat((cells[1] || '').replace(/,/g, ''));
  const chg  = parseFloat((cells[2] || '').replace(/,/g, ''));
  const rate = cells[3] || '';
  return { val: isNaN(val) ? null : val, chg: isNaN(chg) ? null : chg, rate };
}

function parseDomesticRow(cells) {
  // cells: [구분, 휘발유, 등유, 경유]
  return {
    gasoline: parseFloat((cells[1] || '').replace(/,/g, '')) || null,
    kerosene: parseFloat((cells[2] || '').replace(/,/g, '')) || null,
    diesel:   parseFloat((cells[3] || '').replace(/,/g, '')) || null,
  };
}

/* ────────────────────────────────────────────
   FACTORY TABS
──────────────────────────────────────────── */
document.querySelectorAll('.ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCompany = btn.dataset.company;
    renderFactory(activeCompany);
  });
});

/* ────────────────────────────────────────────
   REFRESH BUTTON
──────────────────────────────────────────── */
const refreshBtn = $('refreshBtn');
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning');
  refreshBtn.disabled = true;
  await Promise.all([
    fetchSamhwa(),
    fetchForexAPI().then(ok => ok ? null : fetchForex()),
    fetchOilYahoo().then(n => n < 2 ? fetchNaverStation() : null),
  ]);
  renderAll();
  setTimeout(() => {
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
  }, 1000);
});

/* ────────────────────────────────────────────
   AUTO REFRESH (every 5 minutes)
──────────────────────────────────────────── */
async function autoRefresh() {
  await Promise.all([
    fetchSamhwa(),
    // 환율: CDN API 우선, 실패 시 네이버 스크래핑 폴백
    fetchForexAPI().then(ok => ok ? null : fetchForex()),
    // 국제유가: Yahoo Finance JSON 우선, 실패 시 네이버 스크래핑 폴백
    fetchOilYahoo().then(n => n < 2 ? fetchNaverStation() : null),
  ]);
  renderAll();
}

/* ────────────────────────────────────────────
   INIT
──────────────────────────────────────────── */
(async () => {
  // 1. Render seed data immediately (no flicker)
  renderAll();

  // 2. Live fetch: 공개 API 우선, 실패 시 CORS 프록시 스크래핑 폴백
  fetchAttempted = true;
  await Promise.all([
    fetchSamhwa(),
    fetchForexAPI().then(ok => ok ? null : fetchForex()),
    fetchOilYahoo().then(n => n < 2 ? fetchNaverStation() : null),
  ]);
  renderAll();

  // 3. Auto refresh every 5 min
  setInterval(autoRefresh, 5 * 60 * 1000);
})();
