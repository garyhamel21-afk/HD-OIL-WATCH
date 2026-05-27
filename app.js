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
  stationHistory: {
    dates: ['2026.05.19','2026.05.20','2026.05.21','2026.05.22','2026.05.23','2026.05.24','2026.05.25'],
    data: [
      { date:'2026.05.19', premium:2436.05, regular:2006.44, diesel:2001.20, kerosene:1609.80 },
      { date:'2026.05.20', premium:2437.10, regular:2006.90, diesel:2001.60, kerosene:1609.40 },
      { date:'2026.05.21', premium:2438.20, regular:2007.30, diesel:2002.10, kerosene:1609.10 },
      { date:'2026.05.22', premium:2439.00, regular:2007.80, diesel:2002.50, kerosene:1608.80 },
      { date:'2026.05.23', premium:2439.50, regular:2008.20, diesel:2003.00, kerosene:1608.60 },
      { date:'2026.05.24', premium:2440.43, regular:2008.65, diesel:2003.46, kerosene:1608.38 },
      { date:'2026.05.25', premium:2440.99, regular:2011.24, diesel:2005.79, kerosene:1608.15 },
    ],
  },
  factory: {
    sk:      { gasoline: 2311, kerosene: 2277, diesel: 2485 },
    gs:      { gasoline: 2189, kerosene: 2231, diesel: 2397 },
    hyundai: { gasoline: 2288, kerosene: 2231, diesel: 2529 },
  },
  week: '2026년 4월 5주차',
  chartMode: 'absolute',  // 'absolute' | 'relative' — 차트 표시 모드
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

// 각 데이터 소스의 fetch 상태 추적 (UI에 표시용)
const fetchStatus = {
  international: 'pending', // pending | live | stale
  station:       'pending',
  forex:         'pending',
  domestic:      'pending',
  product:       'pending',
  factory:       'pending',
  history:       'pending',
};

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

/* ────────────────────────────────────────────
   RENDER — 주유소 평균판매가 7일 추이 SVG 차트
──────────────────────────────────────────── */
function renderHistoryChart() {
  const wrap = $('stationChartWrap');
  if (!wrap) return;

  const histData = state.stationHistory;
  const { dates, data } = histData;
  if (!dates?.length || !data?.length) return;

  const SERIES = [
    { key: 'premium',  label: '고급휘발유', color: '#002878' },
    { key: 'regular',  label: '보통휘발유', color: '#00B140' },
    { key: 'diesel',   label: '자동차경유', color: '#C88000' },
    { key: 'kerosene', label: '실내등유',   color: '#9333EA' },
  ];

  // 모드별 데이터 변환
  // absolute: 원본 값(원/L) 그대로
  // relative: 첫 날 대비 변화율(%) — (val - base) / base * 100
  const mode = state.chartMode || 'absolute';
  const transformed = data.map((d, i) => {
    const row = { date: d.date };
    SERIES.forEach(s => {
      const v = d[s.key];
      if (v == null) { row[s.key] = null; return; }
      if (mode === 'relative') {
        const base = data[0][s.key];
        if (base == null || base === 0) { row[s.key] = null; return; }
        row[s.key] = ((v - base) / base) * 100;
      } else {
        row[s.key] = v;
      }
    });
    return row;
  });

  // SVG viewport
  const W = 900, H = 280;
  const PAD = { top: 24, right: 24, bottom: 54, left: 72 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n  = transformed.length;

  // 전체 값 범위 계산
  const allVals = transformed.flatMap(d => SERIES.map(s => d[s.key]).filter(v => v != null));
  if (allVals.length === 0) { wrap.innerHTML = '<p style="text-align:center;color:#7A90AA;padding:2rem">데이터 없음</p>'; return; }
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);

  // 모드별 Y축 스케일 처리
  // absolute: 50원 단위 라운딩 + 12% 패딩
  // relative: 0%이 항상 보이도록 0을 포함시키고, 0.1% 단위 라운딩 + 25% 패딩
  //          (변동폭이 매우 작을 때(±0.05% 등) 최소 ±0.1% 범위 보장)
  let yMin, yMax;
  if (mode === 'relative') {
    const includeZero = (lo, hi) => [Math.min(lo, 0), Math.max(hi, 0)];
    const [lo0, hi0] = includeZero(rawMin, rawMax);
    const span0 = Math.max(hi0 - lo0, 0.2); // 최소 0.2%p 보장
    const pad   = span0 * 0.25;
    yMin = Math.floor((lo0 - pad) * 10) / 10;
    yMax = Math.ceil ((hi0 + pad) * 10) / 10;
  } else {
    const pad = Math.max((rawMax - rawMin) * 0.12, 30);
    yMin = Math.floor((rawMin - pad) / 50) * 50;
    yMax = Math.ceil ((rawMax + pad) / 50) * 50;
  }
  const yRange = yMax - yMin || 1;

  const xOf = (i) => PAD.left + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yOf = (v) => PAD.top + cH - ((v - yMin) / yRange) * cH;

  // 값 포맷 헬퍼
  const fmtY = (v) => {
    if (mode === 'relative') {
      const sign = v > 0 ? '+' : '';
      return `${sign}${v.toFixed(2)}%`;
    }
    return Math.round(v).toLocaleString('ko-KR');
  };

  // Y 그리드 & 레이블 (5칸)
  let gridLines = '', yLabels = '';
  const yTickCount = 5;
  for (let t = 0; t <= yTickCount; t++) {
    const v = yMin + (yRange / yTickCount) * t;
    const y = yOf(v);
    gridLines += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${W - PAD.right}" y2="${y.toFixed(1)}" stroke="#E4ECF4" stroke-width="1"/>`;
    yLabels   += `<text x="${PAD.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#7A90AA" font-family="'Noto Sans KR',sans-serif">${fmtY(v)}</text>`;
  }

  // 변화율 모드에서 0% 기준선 강조
  let zeroLine = '';
  if (mode === 'relative' && yMin <= 0 && yMax >= 0) {
    const y0 = yOf(0);
    zeroLine = `<line x1="${PAD.left}" y1="${y0.toFixed(1)}" x2="${W - PAD.right}" y2="${y0.toFixed(1)}" stroke="#7A90AA" stroke-width="1" stroke-dasharray="4,3"/>`;
  }

  // X 레이블 (날짜)
  let xLabels = '';
  transformed.forEach((d, i) => {
    const x = xOf(i);
    const label = d.date.slice(5).replace('.', '/'); // MM/DD
    xLabels += `<text x="${x.toFixed(1)}" y="${(H - PAD.bottom + 18).toFixed(1)}" text-anchor="middle" font-size="10" fill="#7A90AA" font-family="'Noto Sans KR',sans-serif">${label}</text>`;
  });

  // 라인 & 점
  let paths = '', dotElems = '';
  SERIES.forEach(s => {
    const pts = transformed
      .map((d, i) => (d[s.key] != null ? [xOf(i), yOf(d[s.key])] : null))
      .filter(Boolean);
    if (pts.length < 2) return;

    // 부드러운 곡선 (monotone cubic 근사 — 단순 catmull-rom)
    let dAttr = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      dAttr += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    paths += `<path d="${dAttr}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

    // 데이터 포인트 점
    pts.forEach(([px, py], pi) => {
      const isLast = pi === pts.length - 1;
      const r = isLast ? 5 : 3.5;
      const sw = isLast ? 2 : 1.5;
      dotElems += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${s.color}" stroke="white" stroke-width="${sw}"/>`;
    });
  });

  // 범례 (하단)
  const legendY = H - 14;
  const legendItemW = cW / SERIES.length;
  let legend = '';
  SERIES.forEach((s, i) => {
    const lx = PAD.left + i * legendItemW;
    legend += `<circle cx="${(lx + 7).toFixed(1)}" cy="${legendY}" r="5" fill="${s.color}"/>`;
    legend += `<text x="${(lx + 16).toFixed(1)}" y="${(legendY + 4)}" font-size="11" fill="#3A5880" font-family="'Noto Sans KR',sans-serif">${s.label}</text>`;
  });

  // 경계 박스
  const border = `<rect x="${PAD.left}" y="${PAD.top}" width="${cW}" height="${cH}" fill="none" stroke="#E4ECF4" stroke-width="1"/>`;

  // 변화율 모드 안내 (X축 첫 날짜 위에 기준 표시)
  let baselineLabel = '';
  if (mode === 'relative' && transformed[0]) {
    baselineLabel = `<text x="${(PAD.left + 4).toFixed(1)}" y="${(PAD.top + 14).toFixed(1)}" font-size="10" fill="#7A90AA" font-family="'Noto Sans KR',sans-serif">기준일: ${transformed[0].date}</text>`;
  }

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="주유소 7일 가격 추이 차트">
      ${gridLines}
      ${zeroLine}
      ${border}
      ${baselineLabel}
      ${paths}
      ${dotElems}
      ${xLabels}
      ${yLabels}
      ${legend}
    </svg>
  `;
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
  renderHistoryChart();
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
      if (domestic > 0) {
        renderStation();
        markLive(['station']);
        console.log('[OilWatch] 국내유가 갱신:', domestic, '건');
      }
      if (intl > 0) {
        renderInternational();
        markLive(['international']);
        console.log('[OilWatch] 국제유가 갱신:', intl, '건');
      }
      if (domestic > 0 || intl > 0) return true;
      console.warn('[OilWatch] 유가 파싱 결과 없음 — 다음 proxy');
    } catch (e) {
      console.warn('[OilWatch] 유가 fetch 실패:', e.message);
    }
  }
  console.warn('[OilWatch] 네이버 유가 전체 실패');
  return false;
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
  // 국제 유종 (달러/배럴) — Dubai는 FRED API 전담이므로 여기서 제외
  const INTL_MAP = {
    'OIL_CL':  'wti',   'OIL%5FCL':  'wti',    // WTI 서부텍사스유
    'OIL_BRT': 'brent', 'OIL%5FBRT': 'brent',  // 브렌트유
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
// FRED API 키는 클라이언트에 노출되지 않습니다.
// Vercel 환경변수(FRED_API_KEY)를 읽는 /api/fred 서버리스 함수를 경유합니다.

// Opinet API 키는 클라이언트에 노출되지 않습니다.
// Vercel 환경변수(OPINET_API_KEY)를 읽는 /api/opinet 서버리스 함수를 경유합니다.

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
   FETCH — 환율 (한국은행 ECOS API)
   /api/forex 서버리스 함수 경유 (API 키는 Vercel 환경변수에만 보관)
   통계표: 731Y001 (주요국 통화의 대원화환율, 일별)
──────────────────────────────────────────── */
async function fetchForexAPI() {
  try {
    const res = await fetch('/api/forex', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // data: { usd:{val,chg}, eur:{val,chg}, jpy:{val,chg}, cny:{val,chg}, date:"2026.05.05" }
    const ids = ['usd', 'eur', 'jpy', 'cny'];
    if (!ids.every(id => data[id]?.val != null)) throw new Error('필수 통화 데이터 누락');

    ids.forEach(id => { state.forex[id] = { val: data[id].val, chg: data[id].chg }; });
    forexDate = (data.date || '') + ' 한국은행 기준';
    renderForex();
    markLive(['forex']);
    console.log('[OilWatch] 환율 갱신 (한국은행 ECOS)', data.date);
    return true;
  } catch (e) {
    console.warn('[OilWatch] 환율 /api/forex 실패:', e.message);
    return false;
  }
}

/* ────────────────────────────────────────────
   FETCH — 국제유가 (FRED API 1차, Stooq 2차, Yahoo 3차)
   ─ FRED: 미 EIA 원천 데이터 + 가장 신뢰성 높음 (1~3일 영업일 지연)
   ─ Stooq: 실시간 선물값 (당일/T+1)
   ─ Yahoo: 마지막 폴백
──────────────────────────────────────────── */
async function fetchOilFRED() {
  try {
    const res = await fetch('/api/fred-oil', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    let updated = 0;
    if (data.wti?.val) {
      state.international.wti = data.wti;
      updated++;
      console.log(`[OilWatch] WTI FRED 갱신: $${data.wti.val} (${data.wti.date})`);
    }
    if (data.brent?.val) {
      state.international.brent = data.brent;
      updated++;
      console.log(`[OilWatch] Brent FRED 갱신: $${data.brent.val} (${data.brent.date})`);
    }
    if (data.errors?.length) {
      console.warn('[OilWatch] FRED 부분 실패:', data.errors);
    }
    if (updated > 0) {
      renderInternational();
      if (updated >= 2) markLive(['international']);
    }
    return updated;
  } catch (e) {
    console.warn('[OilWatch] FRED /api/fred-oil 실패:', e.message);
    return 0;
  }
}

async function fetchOilStooq() {
  // Stooq 심볼: CL.F = WTI, BZ.F = Brent (모두 CORS 허용)
  const TICKERS = [
    { symbol: 'cl.f', key: 'wti',   label: 'WTI' },
    { symbol: 'bz.f', key: 'brent', label: 'Brent' },
  ];
  let updated = 0;
  for (const { symbol, key, label } of TICKERS) {
    try {
      const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const csv = await res.text();
      const lines = csv.trim().split('\n');
      if (lines.length < 2) throw new Error('empty CSV');
      const cols = lines[1].split(',');
      // Symbol,Date,Time,Open,High,Low,Close,Volume
      const date  = cols[1];
      const open  = parseFloat(cols[3]);
      const close = parseFloat(cols[6]);
      if (isNaN(close)) throw new Error('parse failed');
      const chg  = !isNaN(open) ? round2(close - open) : null;
      const rate = !isNaN(open) && open ? (((close - open) / open) * 100).toFixed(2) + '%' : null;
      state.international[key] = {
        val: round2(close), chg, rate,
        date: date ? date.replace(/-/g, '.') : null,
      };
      updated++;
      console.log(`[OilWatch] ${label} Stooq 갱신: $${close}`);
    } catch (e) {
      console.warn(`[OilWatch] ${label} Stooq 실패:`, e.message);
    }
  }
  if (updated > 0) {
    renderInternational();
    if (updated >= 2) markLive(['international']);
  }
  return updated;
}

/* ────────────────────────────────────────────
   Yahoo Finance 본체 — 실시간 선물 시세 (CORS 프록시 필요)
   단점: 401/Crumb 이슈가 잦아 폴백 필요
──────────────────────────────────────────── */
async function fetchOilYahooCore() {
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
        break; // 이 ticker는 성공했으니 다음 ticker로
      } catch (e) {
        console.warn(`[OilWatch] ${label} Yahoo 실패:`, e.message);
        // 다음 프록시 시도
      }
    }
  }

  if (updated > 0) {
    renderInternational();
    if (updated >= 2) markLive(['international']);
  }
  return updated;
}

/* ────────────────────────────────────────────
   FETCH 진입점 — 국제유가 (WTI/Brent)
   우선순위: Yahoo(실시간) → Stooq(15분 지연) → FRED(1-3일 지연)
   각 단계에서 둘 다 채워지면 다음 단계는 스킵
──────────────────────────────────────────── */
async function fetchOilAll() {
  // ① Yahoo 1차 (실시간 NYMEX/ICE 선물 — 시세 정확도 최고)
  const yahooCount = await fetchOilYahooCore();
  if (yahooCount >= 2) return yahooCount;

  // ② Stooq 2차 (CORS 허용 CSV, 15~20분 지연 선물)
  // ※ Yahoo가 한 쪽만 채워진 경우에도 Stooq가 보완할 수 있도록 항상 시도
  const stooqCount = await fetchOilStooq();
  if (yahooCount + stooqCount >= 2) return yahooCount + stooqCount;

  // ③ FRED 3차 (EIA 공식 현물, 1~3 영업일 지연 — 마지막 안전망)
  const fredCount = await fetchOilFRED();
  return yahooCount + stooqCount + fredCount;
}

/* 하위 호환 — fetchAll에서 기존 이름으로 호출되는 경우 대비 */
const fetchOilYahoo = fetchOilAll;

/* ────────────────────────────────────────────
   FETCH — 두바이유 (오피넷 gloptotSelect.do 스크래핑)
   /api/dubai 서버리스 함수 경유
   소스: https://www.opinet.co.kr/gloptotSelect.do
   조사주기: 화~토(T+1일 조사), 단위: USD/Barrel
──────────────────────────────────────────── */
async function fetchDubaiFRED() {
  try {
    const res = await fetch('/api/dubai', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const { val, chg, rate, date } = data;
    if (!val || isNaN(val)) throw new Error('가격 파싱 실패');

    state.international.dubai = { val: round2(val), chg, rate, date };
    renderInternational();
    markLive(['international']);
    console.log(`[OilWatch] Dubai 오피넷 갱신: $${val} (${date})`);
    return true;
  } catch (e) {
    console.warn('[OilWatch] Dubai 오피넷 /api/dubai 실패:', e.message);
    return false;
  }
}

/* ────────────────────────────────────────────
   FETCH — 오피넷 최근 7일 이력 (avgRecentMonthAllPri)
   /api/opinet-history 서버리스 함수 경유
──────────────────────────────────────────── */
async function fetchOpinetHistory() {
  try {
    const res = await fetch('/api/opinet-history', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.dates?.length || !data.data?.length) throw new Error('Empty history');

    state.stationHistory = data;
    renderHistoryChart();
    markLive(['history']);
    console.log('[OilWatch] 주유소 7일 이력 갱신:', data.dates.length, '일치');
    return true;
  } catch (e) {
    console.warn('[OilWatch] 주유소 이력 /api/opinet-history 실패:', e.message);
    return false;
  }
}

/* ────────────────────────────────────────────
   FETCH — 오피넷 API (한국석유공사)
   /api/opinet 서버리스 함수 경유 (API 키는 Vercel 환경변수에만 보관)
   ─ 국내유가(station): 휘발유, 고급휘발유, 경유
   ─ 주유소 평균판매가(product): 고급휘발유, 보통휘발유, 실내등유, 자동차경유
──────────────────────────────────────────── */
async function fetchOpinet() {
  // /api/opinet → Vercel 서버리스 (키 노출 없음)
  // 로컬 개발 시 vercel dev 또는 CORS 프록시 직접 호출 불가 → false 반환
  let data = null;

  try {
    const res = await fetch('/api/opinet', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (e) {
    console.warn('[OilWatch] Opinet /api/opinet 실패:', e.message);
    return false;
  }

  const oils = data?.RESULT?.OIL;
  if (!Array.isArray(oils) || oils.length === 0) {
    console.warn('[OilWatch] Opinet 응답에 OIL 배열 없음');
    return false;
  }

  // PRODCD 기반 매핑 (한글 인코딩 이슈 없음)
  // B034: 고급휘발유 / B027: 보통휘발유(휘발유) / D047: 자동차경유 / C004: 실내등유
  const PRODCD_MAP = {
    'B034': { stationKey: 'premium',  productKey: 'premium'  },
    'B027': { stationKey: 'gasoline', productKey: 'regular'  },
    'D047': { stationKey: 'diesel',   productKey: 'diesel'   },
    'C004': { stationKey: null,       productKey: 'kerosene' },
  };

  let stationCount = 0, productCount = 0;

  oils.forEach(oil => {
    const map = PRODCD_MAP[oil.PRODCD];
    if (!map) return;

    const val = parseFloat((oil.PRICE || '').replace(/,/g, ''));
    const chg = parseFloat((oil.DIFF  || '').replace(/,/g, ''));
    if (isNaN(val)) return;

    const safeChg   = isNaN(chg) ? null : round2(chg);
    const prevPrice = (safeChg != null) ? val - safeChg : null;
    const rate = (prevPrice != null && prevPrice > 0)
      ? (Math.abs(safeChg / prevPrice) * 100).toFixed(2) + '%'
      : null;
    const tradeDate = (oil.TRADE_DT || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');

    if (map.stationKey) {
      state.station[map.stationKey] = { val: round2(val), chg: safeChg, rate, date: tradeDate };
      stationCount++;
    }
    if (map.productKey) {
      state.product[map.productKey] = { val: round2(val), chg: safeChg };
      productCount++;
    }
  });

  if (stationCount > 0) {
    renderStation();
    markLive(['station']);
    console.log('[OilWatch] Opinet 국내유가 갱신:', stationCount, '건');
  }
  if (productCount > 0) {
    renderProduct();
    markLive(['product']);
    console.log('[OilWatch] Opinet 주유소 평균판매가 갱신:', productCount, '건');
  }

  if (stationCount === 0 && productCount === 0) {
    console.warn('[OilWatch] Opinet 매칭 품목 없음');
  }
  return stationCount > 0 || productCount > 0;
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
        markLive(['forex']);
        console.log('[OilWatch] 네이버 환율 갱신 (' + proxyUrl.slice(0, 40) + '...)');
        return true;
      }
      console.warn('[OilWatch] 파싱 결과 없음 — 다음 proxy 시도');
    } catch (e) {
      console.warn('[OilWatch] 환율 fetch 실패:', e.message);
    }
  }
  console.warn('[OilWatch] 환율 전체 실패 — seed 값 유지');
  return false;
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
      const flags = parseAndApply(html);
      if (flags.domestic) markLive(['domestic']);
      if (flags.product)  markLive(['product']);
      if (flags.factory)  markLive(['factory']);
      // 하나라도 갱신되면 성공으로 간주
      if (flags.domestic || flags.product || flags.factory) {
        console.log('[OilWatch] samhwa 갱신 (' + proxyUrl.slice(0, 40) + '...)', flags);
        return true;
      }
      console.warn('[OilWatch] samhwa 파싱 결과 없음 — 다음 proxy');
    } catch (e) {
      console.warn('[OilWatch] samhwa fetch 실패:', e.message);
    }
  }
  console.warn('[OilWatch] samhwa 전체 실패 — seed 유지');
  return false;
}

/* ────────────────────────────────────────────
   PARSE HTML response from samhwa.biz
   수정 내역:
   ① 주차 레이블(state.week) 본문 텍스트에서 추출
   ② 공장도가 파서: 공유 changed 변수 제거 → domestic이 먼저 파싱돼도 factory가 차단되던 버그 수정
   ③ 5개 정유사 모두 업데이트 (기존엔 SK만 1회 업데이트하고 중단)
   ④ 헤더 매칭 유연화: 정확한 3-열 일치 → '휘발유' & '경유' 포함 여부
──────────────────────────────────────────── */
function parseAndApply(html) {
  const flags = { domestic: false, product: false, factory: false };
  if (!html) return flags;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = [...doc.querySelectorAll('table')];

  // ① 주차 레이블 추출 (예: "2026년 5월 4주차")
  const bodyText = doc.body?.textContent || '';
  const wkMatch = bodyText.match(/(\d{4}년\s*\d{1,2}월\s*\d{1,2}주차)/);
  if (wkMatch) state.week = wkMatch[1].replace(/\s+/g, ' ');

  // ①-B 두바이유 보조 파싱 (samhwa.biz 국제유가 테이블의 "Dubai유" 행)
  //     /api/dubai 가 차단되거나 실패할 때 fallback으로 활용
  //     ※ 우선순위: /api/dubai 가 먼저 성공하면 그 값이 유지되므로,
  //       여기서는 dubai가 SEED 그대로(예: 한 달 전 날짜) 일 때만 덮어쓰기
  for (const tbl of tables) {
    const rows = [...tbl.querySelectorAll('tr')];
    for (const row of rows) {
      const cells = [...row.querySelectorAll('td')].map(c => c.textContent.trim());
      if (cells[0] === 'Dubai유' && cells.length >= 4) {
        const val  = parseFloat((cells[1] || '').replace(/,/g, ''));
        const chg  = parseFloat((cells[2] || '').replace(/,/g, ''));
        const rate = (cells[3] || '').trim();
        if (!isNaN(val) && val > 0) {
          // /api/dubai 성공 시 markLive(['international'])가 호출되어 있을 가능성.
          // fetchStatus 검사로 중복 갱신 방지 — pending/stale 일 때만 적용
          if (fetchStatus.international !== 'live') {
            const today = new Date();
            const dateStr = today.toLocaleDateString('ko-KR', {
              year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
            }).replace(/\.\s*/g, '.').replace(/\.$/, '');
            state.international.dubai = {
              val, chg: isNaN(chg) ? null : chg,
              rate: rate || null,
              date: dateStr,
            };
            renderInternational();
            console.log(`[OilWatch] Dubai samhwa fallback 갱신: $${val} (${dateStr})`);
          } else {
            console.log('[OilWatch] Dubai samhwa fallback 무시 (이미 /api/dubai 갱신됨)');
          }
        }
        break;
      }
    }
  }

  // ③ 정유사 순서 (samhwa.biz DOM 출현 순서 — S-OIL/한화토탈은 공장도가 미공개로 제외)
  const COMPANY_ORDER = ['sk', 'gs', 'hyundai'];
  // 회사명 키워드 → 컨텍스트 우선 매핑
  const COMPANY_KW = [
    { kw: 'SK에너지',      key: 'sk'      },
    { kw: 'GS칼텍스',     key: 'gs'      },
    { kw: '현대오일뱅크',  key: 'hyundai' },
  ];
  let factoryCount = 0;

  tables.forEach(tbl => {
    const rows    = [...tbl.querySelectorAll('tr')];
    const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim());

    // ── 석유제품가(domestic): '일자' + '휘발유(92RON/RON)' 헤더 ──────
    const hasDateHdr     = headers.some(h => h.includes('일자'));
    const hasGasolineHdr = headers.some(h => h.includes('휘발유') && (h.includes('92') || h.includes('RON')));
    if (hasDateHdr && hasGasolineHdr) {
      rows.forEach(row => {
        const cells = [...row.querySelectorAll('td')].map(c => c.textContent.trim());
        if (cells[0] === '당일') { state.domestic.today = parseDomesticRow(cells); flags.domestic = true; }
        if (cells[0] === '전일') { state.domestic.prev  = parseDomesticRow(cells); flags.domestic = true; }
      });
      return; // domestic 테이블 → factory 처리 불필요
    }

    // ── 공장도가: 헤더가 정확히 ['휘발유','등유','경유'] 3개인 테이블 ─────────
    // ⚠️ 중요: '휘발유'/'경유'를 포함하는 헤더(고급휘발유, 자동차용경유 등)는
    //   주유소평균판매가 테이블에도 있으므로 정확 일치로 제한
    const isFactoryHdr =
      headers.length === 3 &&
      headers[0] === '휘발유' &&
      headers[1] === '등유' &&
      headers[2] === '경유';
    if (!isFactoryHdr) return;
    if (factoryCount >= COMPANY_ORDER.length) return;

    // 가격 행 탐색: 원/L 기준 숫자(1000~5000) 3개 이상
    // ※ 빈 셀(미공개사)이 있어도 "공장도가 테이블 1개"로 카운트해야
    //   다음 테이블이 올바른 회사 슬롯에 들어감
    let priceVals = null;
    let hasAnyDataRow = false;
    for (const row of rows) {
      const tds = [...row.querySelectorAll('td')];
      if (tds.length >= 3) hasAnyDataRow = true;
      const nums = tds
        .map(c => parseFloat(c.textContent.replace(/,/g, '').trim()))
        .filter(n => !isNaN(n) && n >= 1000 && n <= 5000);
      if (nums.length >= 3) { priceVals = nums.slice(0, 3); break; }
    }
    // 헤더만 있고 데이터 행이 전혀 없으면 공장도가 테이블 아님
    if (!hasAnyDataRow) return;

    // ⚠️ 회사 식별: 순서 우선 (DOM 노출 순서: SK→GS→현대→S-OIL→한화)
    // 기존 버그 — 부모 6단계 textContent 검색 → 항상 'SK에너지'가 최상위 텍스트에
    // 등장해 모든 테이블이 SK로 매핑되고 마지막 값이 SK 슬롯을 덮어쓰기 함
    let companyKey = COMPANY_ORDER[factoryCount];

    // 보조 검증: 현재 테이블 "근처" 짧은 텍스트만 확인 (탭 라벨/h3 등)
    const nearbyText = findNearbyCompanyText(tbl);
    if (nearbyText) {
      for (const { kw, key } of COMPANY_KW) {
        if (nearbyText.includes(kw)) {
          if (key !== companyKey) {
            console.log(`[OilWatch] 회사 매칭 조정: ${companyKey} → ${key} (근접: "${nearbyText.slice(0, 40)}")`);
            companyKey = key;
          }
          break;
        }
      }
    }

    // 가격 적용 (미공개사는 null 슬롯으로 유지하되 카운트는 증가시켜야 순서가 안 어긋남)
    if (priceVals) {
      state.factory[companyKey] = {
        gasoline: priceVals[0],
        kerosene: priceVals[1],
        diesel:   priceVals[2],
      };
      flags.factory = true;
      console.log(`[OilWatch] 공장도가 [${companyKey}]: 휘발유 ${priceVals[0]} 등유 ${priceVals[1]} 경유 ${priceVals[2]}`);
    } else {
      state.factory[companyKey] = { gasoline: null, kerosene: null, diesel: null };
      console.log(`[OilWatch] 공장도가 [${companyKey}]: 미공개`);
    }
    factoryCount++;
  });

  // 주차 레이블 갱신 로그
  if (wkMatch) console.log('[OilWatch] 공장도가 주차:', state.week);

  if (flags.domestic || flags.factory) {
    renderDomestic();
    renderFactory(activeCompany);
    console.log('[OilWatch] samhwa.biz 갱신 완료:', flags, `/ 공장도가 ${factoryCount}개사`);
  }
  return flags;
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
   공장도가 테이블 근처의 회사명 텍스트만 좁게 탐색
   (parseAndApply 헬퍼 — 부모 textContent 전체 검색으로 인한 잘못된 매칭 방지)
──────────────────────────────────────────── */
function findNearbyCompanyText(tbl) {
  // ① 직전 형제 노드 (최대 3홉) — 일반적으로 탭 라벨/h3가 여기에 위치
  let sib = tbl.previousElementSibling;
  let hops = 0;
  while (sib && hops < 3) {
    const t = (sib.textContent || '').trim();
    if (t && t.length < 80) return t;
    sib = sib.previousElementSibling;
    hops++;
  }
  // ② 부모 내 첫 헤더 요소
  const parent = tbl.parentElement;
  if (parent) {
    const firstHeader = parent.querySelector('h2, h3, h4, .tab-title, .company-name, strong, b');
    if (firstHeader) {
      const t = (firstHeader.textContent || '').trim();
      if (t.length < 80) return t;
    }
  }
  return null;
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
   CHART MODE TOGGLE (절대값 / 변화율)
──────────────────────────────────────────── */
document.querySelectorAll('.chart-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (!mode || state.chartMode === mode) return;
    document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.chartMode = mode;
    renderHistoryChart();
  });
});

/* ────────────────────────────────────────────
   FETCH ORCHESTRATOR
   우선순위:
   ① Opinet API → 국내유가(station) + 주유소 평균판매가(product)
      실패 시 → Naver 스크래핑으로 station 폴백 / product는 STALE
   ② samhwa.biz → 석유제품가(domestic) + 공장도가(factory)
   ③ currency-api / Naver → 환율(forex)
   ④ 국제유가 WTI/Brent: Yahoo(실시간) → Stooq(15분 지연) → FRED(1-3일 지연)
   ⑤ Opinet gloptotSelect → Dubai유 (일별)
──────────────────────────────────────────── */
async function fetchAll() {
  const tasks = [
    // ① Opinet: 국내유가 + 주유소 평균판매가 (1차)
    fetchOpinet()
      .then(ok => {
        if (ok) return;
        // Opinet 실패 시 Naver로 station 폴백
        return fetchNaverStation()
          .then(navOk => {
            if (!navOk) markStale(['station']);
          });
        // product는 Opinet만 지원 — 실패 시 STALE
      })
      .then(() => {
        if (fetchStatus.product === 'pending') markStale(['product']);
      }),

    // ② samhwa: 석유제품가(domestic) + 공장도가(factory)
    fetchSamhwa()
      .then(ok => { if (!ok) markStale(['domestic', 'factory']); }),

    // ③ 환율
    fetchForexAPI()
      .then(ok => ok ? null : fetchForex())
      .then(() => { if (fetchStatus.forex === 'pending') markStale(['forex']); }),

    // ④ 국제유가 WTI/Brent: Yahoo → Stooq → FRED 폴백 체인
    fetchOilAll(),

    // ⑤ Dubai유: Opinet gloptotSelect 스크래핑 (서버리스 함수 경유)
    fetchDubaiFRED()
      .then(ok => { if (!ok && fetchStatus.international === 'pending') markStale(['international']); }),

    // ⑥ Opinet: 주유소 평균판매가 7일 이력
    fetchOpinetHistory()
      .then(ok => { if (!ok) markStale(['history']); }),
  ];
  await Promise.allSettled(tasks);

  if (fetchStatus.international === 'pending') markStale(['international']);
  if (fetchStatus.station       === 'pending') markStale(['station']);
  if (fetchStatus.product       === 'pending') markStale(['product']);
  if (fetchStatus.history       === 'pending') markStale(['history']);
}

function markLive(keys) {
  keys.forEach(k => fetchStatus[k] = 'live');
  renderStatusBadges();
}
function markStale(keys) {
  keys.forEach(k => { if (fetchStatus[k] !== 'live') fetchStatus[k] = 'stale'; });
  renderStatusBadges();
}

function renderStatusBadges() {
  const map = {
    'sec-international': fetchStatus.international,
    'sec-forex':         fetchStatus.forex,
    'sec-domestic':      fetchStatus.domestic,
    'sec-product':       fetchStatus.product === 'live' || fetchStatus.history === 'live' ? 'live'
                       : fetchStatus.product === 'stale' || fetchStatus.history === 'stale' ? 'stale'
                       : 'pending',
    'sec-factory':       fetchStatus.factory,
  };
  Object.entries(map).forEach(([id, status]) => {
    const card = document.getElementById(id);
    if (!card) return;
    let badge = card.querySelector('.status-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'status-badge';
      const header = card.querySelector('.card-header');
      if (header) header.appendChild(badge);
    }
    badge.classList.remove('status-live','status-stale','status-pending');
    if (status === 'live') {
      badge.classList.add('status-live');
      badge.textContent = '● LIVE';
    } else if (status === 'stale') {
      badge.classList.add('status-stale');
      badge.textContent = '● STALE';
      badge.title = '실시간 데이터 가져오기 실패 - 표시값은 최근 캐시값입니다';
    } else {
      badge.classList.add('status-pending');
      badge.textContent = '● 로딩…';
    }
  });
}

/* ────────────────────────────────────────────
   REFRESH BUTTON
──────────────────────────────────────────── */
const refreshBtn = $('refreshBtn');
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning');
  refreshBtn.disabled = true;
  // 상태 초기화
  Object.keys(fetchStatus).forEach(k => fetchStatus[k] = 'pending');
  renderStatusBadges();
  await fetchAll();
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
  Object.keys(fetchStatus).forEach(k => fetchStatus[k] = 'pending');
  renderStatusBadges();
  await fetchAll();
  renderAll();
}

/* ────────────────────────────────────────────
   INIT
──────────────────────────────────────────── */
(async () => {
  // 1. Render seed data immediately (no flicker)
  renderAll();
  renderStatusBadges();

  // 2. Live fetch: 모든 소스 병렬 실행
  fetchAttempted = true;
  await fetchAll();
  renderAll();

  // 3. Auto refresh every 5 min
  setInterval(autoRefresh, 5 * 60 * 1000);
})();