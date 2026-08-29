// app/api/dashboard/route.js
// 서버에서만 실행됨 (브라우저에 API 키가 노출되지 않음)

export const dynamic = "force-dynamic"; // 매 요청마다 새로 fetch (빌드 시 미리 호출 안 함)

const FRED_KEY = process.env.FRED_API_KEY;

// ---------- FRED ----------
async function fredSeries(seriesId, limit = 2) {
  if (!FRED_KEY) {
    return { error: "FRED_API_KEY 미설정" };
  }
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { error: `FRED ${seriesId} HTTP ${res.status}` };
    const data = await res.json();
    const obs = (data.observations || []).filter((o) => o.value !== ".");
    if (obs.length === 0) return { error: `FRED ${seriesId} 데이터 없음` };
    const latest = parseFloat(obs[0].value);
    const prev = obs[1] ? parseFloat(obs[1].value) : null;
    return {
      value: latest,
      date: obs[0].date,
      delta: prev !== null ? latest - prev : null,
    };
  } catch (e) {
    return { error: `FRED ${seriesId} fetch 실패: ${e.message}` };
  }
}
// 주간 평균 계산용 (TGA 등 일별 시리즈를 최근 N거래일 평균으로)
async function fredWeeklyAvg(seriesId, weekSize = 5) {
  if (!FRED_KEY) {
    return { error: "FRED_API_KEY 미설정" };
  }
  const limit = weekSize * 2 + 5; // 이번주+지난주 비교용 여유분
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { error: `FRED ${seriesId} HTTP ${res.status}` };
    const data = await res.json();
    const obs = (data.observations || []).filter((o) => o.value !== ".");
    if (obs.length < weekSize) return { error: `FRED ${seriesId} 데이터 부족` };

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const recentWeek = obs.slice(0, weekSize).map((o) => parseFloat(o.value));
    const prevWeek = obs.slice(weekSize, weekSize * 2).map((o) => parseFloat(o.value));

    const currentAvg = avg(recentWeek);
    const prevAvg = prevWeek.length === weekSize ? avg(prevWeek) : null;

    return {
      value: currentAvg,
      date: obs[0].date, // 가장 최근 관측일 (주간평균 기준일 표시용)
      delta: prevAvg !== null ? currentAvg - prevAvg : null,
    };
  } catch (e) {
    return { error: `FRED ${seriesId} fetch 실패: ${e.message}` };
  }
}
// ---------- Yahoo Finance (비공식 엔드포인트, API 키 불필요) ----------
async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { error: `Yahoo ${symbol} HTTP ${res.status}` };
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return { error: `Yahoo ${symbol} 데이터 없음` };
    const meta = result.meta;
    const price = meta.regularMarketPrice;

    const closes = result?.indicators?.quote?.[0]?.close?.filter(
      (v) => v !== null && v !== undefined
    );
    let prevClose = null;
    if (closes && closes.length >= 2) {
      prevClose = closes[closes.length - 2];
    }
    if (prevClose == null) {
      prevClose = meta.previousClose ?? meta.chartPreviousClose;
    }

    return {
      value: price,
      delta: prevClose != null ? price - prevClose : null,
      pct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
      date: new Date(meta.regularMarketTime * 1000).toISOString(),
    };
  } catch (e) {
    return { error: `Yahoo ${symbol} fetch 실패: ${e.message}` };
  }
}

// 실현 변동성(연율화, %) - 최근 N 거래일 종가 기준
async function yahooRealizedVol(symbol, days = 20) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { error: `Yahoo vol ${symbol} HTTP ${res.status}` };
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close?.filter(
      (v) => v !== null && v !== undefined
    );
    if (!closes || closes.length < days + 1) {
      return { error: `Yahoo vol ${symbol} 데이터 부족` };
    }
    const recent = closes.slice(-(days + 1));
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push(Math.log(recent[i] / recent[i - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVolPct = dailyVol * Math.sqrt(252) * 100;
    return { value: annualizedVolPct };
  } catch (e) {
    return { error: `Yahoo vol ${symbol} fetch 실패: ${e.message}` };
  }
}

// ---------- CNN Fear & Greed (비공식, 실패할 수 있음) ----------
async function fearGreed() {
  const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return { error: `Fear&Greed HTTP ${res.status}` };
    const data = await res.json();
    const score = data?.fear_and_greed?.score;
    const rating = data?.fear_and_greed?.rating;
    if (score === undefined) return { error: "Fear&Greed 데이터 없음" };
    return { value: Math.round(score), label: rating };
  } catch (e) {
    return { error: `Fear&Greed fetch 실패: ${e.message}` };
  }
}
// ---------- FRED 머니마켓펀드 총자산 (분기별, 계속 갱신됨) ----------
// 예전에 쓰던 WRMFSL+WIMFSL(주간)은 2021년 2월에 발행이 중단되어 더 이상 갱신되지 않으므로,
// 지금도 계속 갱신되는 분기별 시리즈(MMMFFAQ027S, 백만 달러 단위)로 대체.
async function fredMmfTotal() {
  const result = await fredSeries("MMMFFAQ027S");
  if (result.error) return result;
  return {
    value: result.value / 1000, // 백만 달러 -> 십억 달러
    date: result.date,
    delta: result.delta != null ? result.delta / 1000 : null,
  };
}

export async function GET() {
  const [
    hyg,
    jnk,
    hySpread,
    unrate,
    payems,
    cpi,
    pcepi,
    umcsent,
    icsa,
    jp10y,
    usdjpy,
    usdjpyVol,
    vix,
    dxy,
    us2y,
    us10y,
    us30y,
    stressIdx,
    m2,
    fedBalance,
    tga,
    onrrp,
    onrrpAward,
    wresbal,
    sofr,
    iorb,
    mmfTotalRaw,
    tbill1mo,
    tbill3mo,
    fng,
  ] = await Promise.all([
    yahooQuote("HYG"),
    yahooQuote("JNK"),
    fredSeries("BAMLH0A0HYM2"),
    fredSeries("UNRATE"),
    fredSeries("PAYEMS"),
    fredSeries("CPIAUCSL"),
    fredSeries("PCEPI"),
    fredSeries("UMCSENT"),
    fredSeries("ICSA"),
    fredSeries("IRLTLT01JPM156N"),
    yahooQuote("JPY=X"),
    yahooRealizedVol("JPY=X"),
    yahooQuote("^VIX"),
    yahooQuote("DX-Y.NYB"),
    fredSeries("DGS2"),
    fredSeries("DGS10"),
    fredSeries("DGS30"),
    fredSeries("STLFSI4"),
    fredSeries("M2SL"),
    fredSeries("WALCL"),
    fredSeries("WTREGEN"),
    fredSeries("RRPONTSYD"),
    fredSeries("RRPONTSYAWARD"),
    fredSeries("WRESBAL"),
    fredSeries("SOFR"),
    fredSeries("IORB"),
    fredMmfTotal(),
    fredSeries("DGS1MO"),
    fredSeries("DGS3MO"),
    fearGreed(),
  ]);

  // Net Liquidity = Fed Balance - TGA - ON RRP
  // WALCL, WDTGAL 은 "백만 달러" 단위이고 RRPONTSYD 는 "십억 달러" 단위이므로
  // RRPONTSYD 를 1000배 하여 백만 달러 단위로 맞춘 뒤 계산한다.
  let netLiquidity = { error: "계산 불가" };
if (fedBalance.value != null && tga.value != null && onrrp.value != null) {
  netLiquidity = {
    value: fedBalance.value - tga.value - onrrp.value * 1000,
  };
  if (
    fedBalance.delta != null &&
    tga.delta != null &&
    onrrp.delta != null
  ) {
    netLiquidity.delta =
      fedBalance.delta - tga.delta - onrrp.delta * 1000;
  }
}

  let sofrIorbSpread = { error: "계산 불가" };
  if (sofr.value != null && iorb.value != null) {
    sofrIorbSpread = { value: (sofr.value - iorb.value) * 100 }; // bps
  }

 // MMF 총액: 분기별로 계속 갱신되는 FRED 시리즈(MMMFFAQ027S) 사용
 const mmfTotal = mmfTotalRaw.error
  ? { error: mmfTotalRaw.error }
  : { value: mmfTotalRaw.value, date: mmfTotalRaw.date, delta: mmfTotalRaw.delta };

  return Response.json({
    generatedAt: new Date().toISOString(),
    junkBonds: { hyg, jnk, hySpread },
    usEcon: { unrate, payems, cpi, pcepi, umcsent, icsa },
    jpyCarry: { jp10y, usdjpy, usdjpyVol },
    macro: {
      fng,
      vix,
      dxy,
      us2y,
      us10y,
      us30y,
      stressIdx,
      m2,
      fedBalance,
      tga,
      onrrp,
      onrrpAward,
      wresbal,
      netLiquidity,
      sofr,
      iorb,
      sofrIorbSpread,
      mmfTotal,
      tbill1mo,
      tbill3mo,
    },
  });
}