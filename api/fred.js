/**
 * Vercel Serverless — FRED (St. Louis Fed) Dubai유 가격
 * 브라우저에 API 키를 노출하지 않고 서버 측에서 FRED API 호출
 *
 * 환경변수: FRED_API_KEY (Vercel Dashboard > Settings > Environment Variables)
 * 엔드포인트: GET /api/fred
 * Series: DCOILDUBBI — Crude Oil Prices: Dubai and Oman (USD/Barrel, 주간)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FRED_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=DCOILDUBBI` +
      `&api_key=${apiKey}` +
      `&file_type=json` +
      `&sort_order=desc` +
      `&limit=10`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`FRED HTTP ${response.status}`);

    const data = await response.json();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
