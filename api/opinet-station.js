/**
 * Vercel Serverless — Opinet 특정 주유소 최근 7일 가격 이력
 * 브라우저에 API 키를 노출하지 않고 서버 측에서 Opinet API 호출
 *
 * 환경변수: OPINET_API_KEY (Vercel Dashboard > Settings > Environment Variables)
 * 엔드포인트: GET /api/opinet-station?ucd=A0000001
 *
 * Opinet API: getLastDatePriceInfo.do
 *   - ucd: 주유소 고유 코드
 *   - cnt: 조회 일수 (최대 7)
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

  const ucd = (req.query.ucd || '').trim();
  if (!ucd) {
    return res.status(400).json({ error: '주유소 코드(ucd) 파라미터가 필요합니다.' });
  }
  if (!/^[A-Za-z0-9]{1,20}$/.test(ucd)) {
    return res.status(400).json({ error: '올바르지 않은 주유소 코드 형식입니다.' });
  }

  try {
    const url =
      `https://www.opinet.co.kr/api/getLastDatePriceInfo.do` +
      `?code=${apiKey}&ucd=${encodeURIComponent(ucd)}&cnt=7&out=json`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OilWatch/1.0)',
        Accept: 'application/json, */*',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Opinet HTTP ${response.status}`);

    const body = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).send(Buffer.from(body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
