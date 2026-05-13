/**
 * Vercel Serverless — FRED (St. Louis Fed) 국제유가
 * 브라우저에 API 키를 노출하지 않고 서버 측에서 FRED API 호출
 *
 * 환경변수: FRED_API_KEY (Vercel Dashboard > Settings > Environment Variables)
 * 엔드포인트: GET /api/fred?series_id=DCOILWTICO
 *
 * 지원 시리즈 (일별, USD/Barrel):
 *   DCOILWTICO   — WTI 서부텍사스유
 *   DCOILBRENTEU — Brent 북해유
 */
const ALLOWED_SERIES = new Set(['DCOILWTICO', 'DCOILBRENTEU']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FRED_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const seriesId = (req.query.series_id || '').trim().toUpperCase();
  if (!seriesId || !ALLOWED_SERIES.has(seriesId)) {
    return res.status(400).json({
      error: `series_id 파라미터가 필요합니다. 허용값: ${[...ALLOWED_SERIES].join(', ')}`,
    });
  }

  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${seriesId}` +
      `&api_key=${apiKey}` +
      `&file_type=json` +
      `&sort_order=desc` +
      `&limit=20`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`FRED HTTP ${response.status}`);

    const data = await response.json();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
