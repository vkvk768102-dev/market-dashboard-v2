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
    const prevClose = meta.previousClose ?? meta.chartPreviousClose;
    return {
      value: price,
      delta: prevClose !== undefined ? price - prevClose : null,
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

export async function GET() {
  const [
    hyg,
    jnk,
    hySpread,
    unrate,
    payems,
    cpi,
    umcsent,
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
    mmfRetail,
    mmfInst,
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
    fredSeries("UMCSENT"),
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
    fredSeries("WDTGAL"),
    fredSeries("RRPONTSYD"),
    fredSeries("RRPONTSYAWARD"),
    fredSeries("WRESBAL"),
    fredSeries("SOFR"),
    fredSeries("IORB"),
    fredSeries("WRMFSL"),
    fredSeries("WIMFSL"),
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
  }

  let sofrIorbSpread = { error: "계산 불가" };
  if (sofr.value != null && iorb.value != null) {
    sofrIorbSpread = { value: (sofr.value - iorb.value) * 100 }; // bps
  }

  let mmfTotal = { error: "계산 불가" };
  if (mmfRetail.value != null && mmfInst.value != null) {
    mmfTotal = { value: mmfRetail.value + mmfInst.value };
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    junkBonds: { hyg, jnk, hySpread },
    usEcon: { unrate, payems, cpi, umcsent },
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
