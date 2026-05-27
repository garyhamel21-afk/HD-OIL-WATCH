/**
 * Vercel Serverless — Opinet 최근 7일 주유소 평균판매가 이력
 * avgRecentMonthAllPri.do → 최근 30일 일별 전국 평균 판매가격에서 마지막 7일 추출
 *
 * 환경변수: OPINET_API_KEY
 * 엔드포인트: GET /api/opinet-history
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.OPINET_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPINET_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const PRODCD_MAP = {
    B034: 'premium',
    B027: 'regular',
    D047: 'diesel',
    C004: 'kerosene',
  };

  const toDateStr = (dt) => {
    const s = (dt || '').replace(/\D/g, '');
    return s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : dt;
  };

  try {
    const response = await fetch(
      `https://www.opinet.co.kr/api/avgRecentMonthAllPri.do?code=${apiKey}&out=json`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OilWatch/1.0)',
          Accept: 'application/json, */*',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) throw new Error(`Opinet HTTP ${response.status}`);

    const body = await response.json();
    const oils = body?.RESULT?.OIL;
    if (!Array.isArray(oils) || oils.length === 0) throw new Error('No data');

    const byDate = {};

    // 두 가지 응답 포맷 처리
    // Long format: { TRADE_DT, PRODCD, PRICE }
    // Wide format: { TRADE_DT, B027_PRICE, B034_PRICE, D047_PRICE, C004_PRICE }
    const isLong = oils[0]?.PRODCD != null;

    if (isLong) {
      oils.forEach((oil) => {
        const key = PRODCD_MAP[oil.PRODCD];
        if (!key) return;
        const dateStr = toDateStr(oil.TRADE_DT);
        if (!byDate[dateStr]) byDate[dateStr] = {};
        const price = parseFloat((oil.PRICE || '').replace(/,/g, ''));
        if (!isNaN(price)) byDate[dateStr][key] = price;
      });
    } else {
      oils.forEach((oil) => {
        const dateStr = toDateStr(oil.TRADE_DT);
        if (!byDate[dateStr]) byDate[dateStr] = {};
        Object.entries(PRODCD_MAP).forEach(([prodcd, key]) => {
          const raw = oil[`${prodcd}_PRICE`] ?? oil[prodcd];
          if (raw == null) return;
          const price = parseFloat(raw.toString().replace(/,/g, ''));
          if (!isNaN(price)) byDate[dateStr][key] = price;
        });
      });
    }

    const sortedDates = Object.keys(byDate).sort();
    const last7 = sortedDates.slice(-7);
    const data = last7.map((date) => ({ date, ...byDate[date] }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');
    res.status(200).json({ dates: last7, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
