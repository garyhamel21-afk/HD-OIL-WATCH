// Vercel Serverless Function: /api/forex
// 한국은행 ECOS API에서 USD/EUR/JPY/CNY 매매기준율 조회
//
// 통계표: 731Y001 (주요국 통화의 대원화환율, 일별)
// 엔드포인트:
//   https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/N/731Y001/D/{start}/{end}
//
// 응답 예시 (json):
// {
//   "StatisticSearch": {
//     "list_total_count": 24,
//     "row": [
//       { "STAT_CODE":"731Y001", "STAT_NAME":"...", "ITEM_CODE1":"0000001",
//         "ITEM_NAME1":"미국 달러", "UNIT_NAME":"원",
//         "TIME":"20260526", "DATA_VALUE":"1378.50" },
//       ...
//     ]
//   }
// }
//
// 응답 (이 함수가 프론트에 돌려주는 형식):
//   {
//     usd:{val,chg}, eur:{val,chg}, jpy:{val,chg}, cny:{val,chg},
//     date:"2026.05.26",
//     source:"ecos:731Y001"
//   }
//
// 환경변수: BOK_API_KEY (필수)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 매매기준율은 영업일 1회 갱신 → 1시간 캐시 충분
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  const apiKey = process.env.BOK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BOK_API_KEY 환경변수 누락' });
  }

  // 최근 14일 조회 범위 (휴장/주말 고려하면 영업일 7~10일 확보)
  const today = new Date();
  const end = formatYYYYMMDD(today);
  const past = new Date(today);
  past.setDate(past.getDate() - 14);
  const start = formatYYYYMMDD(past);

  // 통화별 한글명 키워드 → 표준 키 매핑
  // ECOS의 ITEM_NAME1에는 "미국 달러", "일본 엔", "유럽연합 유로", "중국 위안" 형태로 표시됨
  // 안전을 위해 한글 키워드와 ITEM_CODE1 둘 다 매칭 (한쪽이 바뀌어도 동작)
  const CURRENCY_MAP = [
    { key: 'usd', kw: '달러', codes: ['0000001'] },
    { key: 'eur', kw: '유로', codes: ['0000003'] }, // EUR
    { key: 'jpy', kw: '엔',   codes: ['0000002'] }, // JPY 100엔
    { key: 'cny', kw: '위안', codes: ['0000053'] }, // CNY
  ];

  try {
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/1000/731Y001/D/${start}/${end}`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 OilWatch/1.0' },
    });
    if (!r.ok) {
      return res.status(502).json({ error: `ECOS HTTP ${r.status}` });
    }

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) {
      return res.status(502).json({ error: 'ECOS JSON 파싱 실패', sample: text.slice(0, 200) });
    }

    // ECOS는 에러 시 { RESULT: { CODE, MESSAGE } } 또는
    // { StatisticSearch: { RESULT: { CODE, MESSAGE } } } 두 가지 형태로 응답함
    const errInfo = json?.RESULT || json?.StatisticSearch?.RESULT;
    if (errInfo && errInfo.CODE && errInfo.CODE !== 'INFO-000') {
      return res.status(502).json({
        error: `ECOS 오류: [${errInfo.CODE}] ${errInfo.MESSAGE || ''}`,
      });
    }

    const rows = json?.StatisticSearch?.row;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(502).json({ error: 'ECOS row 없음', raw: json });
    }

    // 통화별로 분류 후 날짜 정렬
    // groups: { usd: [{date:"20260526", val:1378.5}, ...], eur: [...], ... }
    const groups = { usd: [], eur: [], jpy: [], cny: [] };
    for (const row of rows) {
      const itemCode = String(row.ITEM_CODE1 || '').trim();
      const itemName = String(row.ITEM_NAME1 || '').trim();
      const time     = String(row.TIME || '').trim();
      const val      = parseFloat(String(row.DATA_VALUE || '').replace(/,/g, ''));
      if (!time || isNaN(val)) continue;

      // 통화 매칭 — 한글 이름 우선, ITEM_CODE 보조
      let matched = null;
      for (const c of CURRENCY_MAP) {
        if (itemName.includes(c.kw) || c.codes.includes(itemCode)) {
          matched = c.key;
          break;
        }
      }
      if (matched) groups[matched].push({ date: time, val });
    }

    // 각 통화별 최신 2개 추출 (날짜 desc 정렬 후 0, 1)
    const out = { source: 'ecos:731Y001' };
    let latestDate = '';

    for (const key of ['usd', 'eur', 'jpy', 'cny']) {
      const list = groups[key];
      if (list.length === 0) continue;
      list.sort((a, b) => b.date.localeCompare(a.date));
      const last = list[0];
      const prev = list.length >= 2 ? list[1] : null;

      const val = Math.round(last.val * 100) / 100;
      const chg = prev ? Math.round((last.val - prev.val) * 100) / 100 : null;
      out[key] = { val, chg };
      if (last.date > latestDate) latestDate = last.date;
    }

    // 모두 비었으면 502
    if (!out.usd && !out.eur && !out.jpy && !out.cny) {
      return res.status(502).json({ error: '모든 통화 매칭 실패', sampleRow: rows[0] });
    }

    // 날짜 포맷: 20260526 → 2026.05.26
    if (latestDate.length === 8) {
      out.date = `${latestDate.slice(0,4)}.${latestDate.slice(4,6)}.${latestDate.slice(6,8)}`;
    }

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Fetch failed: ' + (e.message || String(e)) });
  }
}

function formatYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
