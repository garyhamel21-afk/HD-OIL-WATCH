/**
 * Vercel Serverless — 한국은행 ECOS API 환율
 * 통계표: 731Y001 (주요국 통화의 대원화환율, 일별)
 * API 키: https://ecos.bok.or.kr/ 에서 무료 발급
 *
 * 환경변수: BOK_API_KEY (Vercel Dashboard > Settings > Environment Variables)
 * 엔드포인트: GET /api/forex
 *
 * 응답 예시:
 * { usd: { val: 1472.0, chg: -3.5 }, eur: {...}, jpy: {...}, cny: {...}, date: "2026.05.05" }
 */

// 통화별 항목코드
const CURRENCY_ITEMS = [
  { id: 'usd', code: '0000001', label: 'USD', multiplier: 1    },
  { id: 'jpy', code: '0000002', label: 'JPY', multiplier: 100  }, // 100엔 기준
  { id: 'eur', code: '0000003', label: 'EUR', multiplier: 1    },
  { id: 'cny', code: '0000053', label: 'CNY', multiplier: 1    },
];

function toDateStr(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.BOK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BOK_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  // 최근 7일 조회 (주말·공휴일 고려)
  const endDate   = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  const start = toDateStr(startDate);
  const end   = toDateStr(endDate);

  try {
    // 4개 통화 병렬 조회
    const results = await Promise.all(
      CURRENCY_ITEMS.map(async ({ id, code, label, multiplier }) => {
        const url =
          `https://ecos.bok.or.kr/api/StatisticSearch` +
          `/${apiKey}/json/kr/1/10/731Y001/DD/${start}/${end}/${code}`;

        const r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`BOK HTTP ${r.status} (${label})`);

        const data = await r.json();
        if (data.RESULT?.CODE) throw new Error(`BOK 오류: ${data.RESULT.MESSAGE} (${label})`);

        // 최신순 정렬 (API 응답은 날짜 오름차순)
        const rows = (data.StatisticSearch?.row || [])
          .filter(row => row.DATA_VALUE && row.DATA_VALUE !== '-')
          .sort((a, b) => b.TIME.localeCompare(a.TIME));

        if (rows.length === 0) throw new Error(`데이터 없음 (${label})`);

        const latest   = parseFloat(rows[0].DATA_VALUE) * multiplier;
        const prev     = rows.length > 1 ? parseFloat(rows[1].DATA_VALUE) * multiplier : null;
        const chg      = prev != null ? Math.round((latest - prev) * 100) / 100 : null;
        const dateStr  = rows[0].TIME.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');

        return { id, val: Math.round(latest * 100) / 100, chg, date: dateStr };
      })
    );

    // 최신 날짜 (USD 기준)
    const latestDate = results.find(r => r.id === 'usd')?.date ?? end.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');

    const payload = { date: latestDate };
    results.forEach(({ id, val, chg }) => { payload[id] = { val, chg }; });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
    res.status(200).json(payload);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
