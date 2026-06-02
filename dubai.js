// Vercel Serverless Function: /api/dubai
// 두바이유 가격 스크래핑 — 오피넷 국제유가 페이지
// 소스: https://www.opinet.co.kr/gloptotSelect.do
// 응답: { val, chg, rate, date }
//
// 페이지의 데이터 테이블 구조 (최근 2일 데이터, 8행):
//   | 기간        | Dubai  | Brent  | WTI    |
//   | 26년05월21일 | 984.72 | 974.09 | 914.93 |  ← 원/L 환산
//   | 26년05월22일 | 983.61 | 979.17 | 913.53 |  ← 원/L 환산
//   | 26년05월21일 | 103.70 | 102.58 | 96.35  |  ← $/Bbl (우리가 원하는 값)
//   | 26년05월22일 | 104.01 | 103.54 | 96.60  |  ← $/Bbl 최신값
//
// 구분 방법: Dubai 값이 100 이상이면 $/Bbl, 800 이상이면 원/L
// (배럴당 두바이유 가격은 보통 $40-$150, 원/L는 약 700-1500원)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  try {
    const r = await fetch('https://www.opinet.co.kr/gloptotSelect.do', {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.opinet.co.kr/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!r.ok) {
      return res.status(502).json({ error: `Opinet HTTP ${r.status}` });
    }

    const html = await r.text();

    // 테이블 행 추출 — <tr>...<td>날짜</td><td>Dubai</td><td>Brent</td><td>WTI</td></tr>
    // 정규식으로 <tr>...</tr> 단위로 분리한 뒤 각 행의 <td> 값 추출
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    // 결과 누적: { dateStr: dubaiUSD }
    // 같은 날짜가 두 번 나오므로(원화/달러) 달러값만 채택 → 가장 최근 달러 값을 마지막에 유지
    const dollarRows = []; // [{ dateRaw, dubai, brent, wti }]

    let mRow;
    while ((mRow = rowRegex.exec(html)) !== null) {
      const rowHtml = mRow[1];
      const cells = [];
      let mCell;
      cellRegex.lastIndex = 0;
      while ((mCell = cellRegex.exec(rowHtml)) !== null) {
        // 태그 제거 + 공백 정리
        const txt = mCell[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim();
        cells.push(txt);
      }

      // 데이터 행 기준: 정확히 4개 셀이며 첫 셀이 날짜 형식("26년05월22일")
      if (cells.length !== 4) continue;
      const dateRaw = cells[0];
      if (!/\d{2}년\d{2}월\d{2}일/.test(dateRaw)) continue;

      const dubai = parseFloat(cells[1].replace(/,/g, ''));
      const brent = parseFloat(cells[2].replace(/,/g, ''));
      const wti   = parseFloat(cells[3].replace(/,/g, ''));
      if (isNaN(dubai)) continue;

      // 달러 행만 채택 (Dubai 값이 500 미만이면 $/Bbl, 그 이상은 원/L 환산값)
      // 두바이유 역대 최고가도 $150 수준이라 500 미만 기준은 안전한 여유 마진
      if (dubai < 500) {
        dollarRows.push({ dateRaw, dubai, brent, wti });
      }
    }

    if (dollarRows.length === 0) {
      return res.status(502).json({ error: '두바이유 데이터 행을 찾지 못함' });
    }

    // 날짜 형식: "26년05월22일" → "2026.05.22" 변환 후 정렬해 최신 선택
    const parseDateStr = (s) => {
      const m = s.match(/(\d{2})년(\d{2})월(\d{2})일/);
      if (!m) return null;
      return `20${m[1]}.${m[2]}.${m[3]}`;
    };

    // 입력 순서가 시간순(오래된 것 → 최신)이라 마지막이 최신
    // 안전을 위해 명시적으로 날짜 기준 정렬
    dollarRows.sort((a, b) => {
      const da = parseDateStr(a.dateRaw) || '';
      const db = parseDateStr(b.dateRaw) || '';
      return da.localeCompare(db);
    });

    const last = dollarRows[dollarRows.length - 1];
    const prev = dollarRows.length >= 2 ? dollarRows[dollarRows.length - 2] : null;

    const val = last.dubai;
    const chg = prev ? Math.round((val - prev.dubai) * 100) / 100 : null;
    const rate = (prev && prev.dubai)
      ? ((val - prev.dubai) / prev.dubai * 100).toFixed(2) + '%'
      : null;
    const date = parseDateStr(last.dateRaw);

    return res.status(200).json({
      val,
      chg,
      rate,
      date,
      source: 'opinet:gloptotSelect',
    });
  } catch (e) {
    return res.status(500).json({ error: 'Fetch failed: ' + (e.message || String(e)) });
  }
}
