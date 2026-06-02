// Vercel Serverless Function: /api/opinet-history
// 한국석유공사 Opinet API — 최근 7일간 전국 일일 평균가격
// 엔드포인트: avgRecentPrice.do
// 응답 구조: { RESULT: { OIL: [{DATE, PRODCD, PRICE}, ...] } } (7일 × 5제품 = 35개)
//
// 프론트엔드 반환 구조:
// { dates: ['2026.05.19', ...], data: [{ date, premium, regular, diesel, kerosene }, ...] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

  // ── 모든 처리를 try로 감싸 어떤 예외든 JSON으로 반환 (500 + HTML 방지) ──
  try {
    const apiKey = process.env.OPINET_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ error: 'OPINET_API_KEY 환경변수 누락', stage: 'env' });
    }

    const PRODCD_MAP = {
      B034: 'premium',
      B027: 'regular',
      D047: 'diesel',
      C004: 'kerosene',
    };

    const fmtDate = (s) => {
      if (!s || s.length !== 8) return s;
      return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
    };

    // ── fetch with timeout (AbortSignal.timeout 미지원 런타임 대비 수동 구현) ──
    const url = `https://www.opinet.co.kr/api/avgRecentPrice.do?code=${apiKey}&out=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    let r;
    try {
      r = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 OilWatch/1.0' },
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      return res.status(200).json({
        error: 'fetch 예외: ' + (fetchErr?.message || String(fetchErr)),
        stage: 'fetch',
        name: fetchErr?.name || null,
      });
    }
    clearTimeout(timer);

    if (!r.ok) {
      return res.status(200).json({ error: `Opinet HTTP ${r.status}`, stage: 'http' });
    }

    const raw = await r.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return res.status(200).json({
        error: 'Opinet JSON 파싱 실패',
        stage: 'parse',
        sample: raw.slice(0, 300),
      });
    }

    // Opinet 에러 응답 형태 처리: { RESULT: "..." } 또는 빈 결과
    const oils = json && json.RESULT ? json.RESULT.OIL : null;
    if (!Array.isArray(oils) || oils.length === 0) {
      return res.status(200).json({
        error: 'OIL 배열 없음 (키 권한 또는 빈 결과)',
        stage: 'empty',
        rawKeys: json && typeof json === 'object' ? Object.keys(json) : null,
        sample: JSON.stringify(json).slice(0, 300),
      });
    }

    const dateGroups = {};
    for (const row of oils) {
      const date  = String(row.DATE || '').trim();
      const code  = String(row.PRODCD || '').trim();
      const price = parseFloat(String(row.PRICE || '').replace(/,/g, ''));
      if (!date || isNaN(price)) continue;
      const key = PRODCD_MAP[code];
      if (!key) continue;
      if (!dateGroups[date]) dateGroups[date] = { date: fmtDate(date) };
      dateGroups[date][key] = price;
    }

    const sortedDates = Object.keys(dateGroups).sort();
    if (sortedDates.length === 0) {
      return res.status(200).json({ error: '유효한 날짜 데이터 없음', stage: 'group' });
    }

    const dates = sortedDates.map(fmtDate);
    const data  = sortedDates.map(d => dateGroups[d]);

    return res.status(200).json({ dates, data, source: 'opinet:avgRecentPrice' });
  } catch (e) {
    // 최후의 방어 — 어떤 예외든 200 + JSON으로 (Vercel 기본 500 HTML 페이지 방지)
    return res.status(200).json({
      error: '핸들러 예외: ' + (e?.message || String(e)),
      stage: 'handler',
      name: e?.name || null,
      stack: (e?.stack || '').split('\n').slice(0, 3).join(' | '),
    });
  }
}
