/**
 * Vercel Serverless — Dubai 두바이유 (오피넷 gloptotSelect.do 스크래핑)
 * 오피넷 원유 조회 페이지에서 최신 두바이 현물 가격(USD/Barrel)을 추출
 *
 * 소스: https://www.opinet.co.kr/gloptotSelect.do
 * 조사주기: 화~토 (T+1일 조사), 단위: USD/Barrel
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch('https://www.opinet.co.kr/gloptotSelect.do', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        Referer: 'https://www.opinet.co.kr/',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) throw new Error(`Opinet HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();

    // 오피넷은 EUC-KR 인코딩 사용
    let text;
    try {
      text = new TextDecoder('euc-kr').decode(buffer);
    } catch {
      text = new TextDecoder('utf-8').decode(buffer);
    }

    // 테이블 행 파싱
    // 각 <tr> 에서 <td> 셀을 추출, 4개 이상인 행만 처리
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowM;

    while ((rowM = rowRe.exec(text)) !== null) {
      const rowHtml = rowM[1];
      const cells = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellM;
      while ((cellM = cellRe.exec(rowHtml)) !== null) {
        // HTML 태그 제거, 공백 정리
        cells.push(cellM[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim());
      }

      if (cells.length < 4) continue;

      const dubaiRaw = parseFloat(cells[1].replace(/,/g, ''));
      if (isNaN(dubaiRaw)) continue;

      // USD 행 판별: 두바이 USD/배럴은 보통 50~300 범위
      // KRW/배럴 환산값은 600~1500 범위로 구분 가능
      if (dubaiRaw >= 500) continue;

      rows.push({
        dateRaw: cells[0],
        dubai: dubaiRaw,
        brent: parseFloat(cells[2].replace(/,/g, '')) || null,
        wti:   parseFloat(cells[3].replace(/,/g, '')) || null,
      });
    }

    if (rows.length === 0) throw new Error('두바이 가격 데이터 파싱 실패');

    // 가장 최신 행 (마지막)
    const latest = rows[rows.length - 1];
    const prev   = rows.length > 1 ? rows[rows.length - 2] : null;

    // 날짜 변환: "26년05월12일" → "2026.05.12"
    const parseDate = (s) => {
      const m = s.match(/(\d{2})년(\d{2})월(\d{2})일/);
      return m ? `20${m[1]}.${m[2]}.${m[3]}` : s;
    };

    const chg  = prev != null ? parseFloat((latest.dubai - prev.dubai).toFixed(2)) : null;
    const rate = (prev != null && prev.dubai)
      ? ((latest.dubai - prev.dubai) / prev.dubai * 100).toFixed(2) + '%'
      : null;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');
    res.status(200).json({
      val:  latest.dubai,
      chg,
      rate,
      date: parseDate(latest.dateRaw),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
