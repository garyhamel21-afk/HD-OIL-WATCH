/**
 * Vercel Serverless Proxy
 * 브라우저 CORS 제한을 우회하여 외부 URL을 서버에서 직접 fetch
 * Usage: /api/proxy?url=<encoded-url>
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  try {
    const target = decodeURIComponent(url);
    const response = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,' +
          'application/json,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
        Referer: new URL(target).origin + '/',
      },
      signal: AbortSignal.timeout(12000),
    });

    const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8';
    const body = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.status(response.status).send(Buffer.from(body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
