"use client";

import { useEffect, useState, useCallback } from "react";
import "./globals.css";

const REFRESH_MS = 60_000; // 60초마다 자동 갱신

function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function DeltaValue({ delta, suffix = "", digits = 2 }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return <span className="delta neutral">—</span>;
  }
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`delta ${cls}`}>
      {sign}
      {fmt(delta, digits)}
      {suffix}
    </span>
  );
}

function Row({ label, date, field, unit = "", digits = 2, deltaDigits = 2, deltaSuffix = "" }) {
  if (!field) return null;
  if (field.error) {
    return (
      <div className="row">
        <div className="label">
          {label}
          {date && <span className="date">{date}</span>}
        </div>
        <div className="vals">
          <span className="delta neutral" title={field.error}>
            불러오기 실패
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="row">
      <div className="label">
        {label}
        {date && <span className="date">{date}</span>}
      </div>
      <div className="vals">
        <DeltaValue delta={field.delta} suffix={deltaSuffix} digits={deltaDigits} />
        <span className="value">
          {fmt(field.value, digits)}
          {unit}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children, collapsed, onToggle }) {
  return (
    <div className={`section ${collapsed ? "collapsed" : ""}`}>
      <div className="section-title" onClick={onToggle}>
        <span className="caret">^</span> {title}
      </div>
      <div className="card">{children}</div>
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const toggle = (key) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <>
      <style>{`
        body { padding: 16px 12px 50px; max-width: 520px; margin: 0 auto; }
        .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
        h1 { font-size:12px; font-weight:600; color:var(--text-dim); margin:0; letter-spacing:0.02em; }
        .refresh-btn { background:var(--card); border:1px solid var(--card-border); color:var(--accent); border-radius:7px; padding:5px 10px; font-size:11px; font-weight:600; }
        .section { margin-bottom:20px; }
        .section-title { display:flex; align-items:center; gap:6px; font-size:15px; font-weight:700; margin-bottom:9px; cursor:pointer; user-select:none; }
        .section-title .caret { font-size:11px; color:var(--text-dim); transition:transform 0.2s ease; display:inline-block; }
        .section.collapsed .caret { transform:rotate(180deg); }
        .card { background:var(--card); border:1px solid var(--card-border); border-radius:12px; padding:13px 15px; overflow:hidden; max-height:3000px; transition:max-height 0.25s ease, padding 0.25s ease, opacity 0.2s ease; }
        .section.collapsed .card { max-height:0; padding-top:0; padding-bottom:0; border-width:0; opacity:0; }
        .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:12px; font-weight:700; color:var(--accent); }
        .card-head .timestamp { color:var(--text-dim); font-weight:500; font-size:9.5px; }
        .row { display:flex; justify-content:space-between; align-items:baseline; padding:7px 0; border-bottom:1px solid #161616; font-size:12px; gap:8px; }
        .row:last-child { border-bottom:none; }
        .label { display:flex; flex-direction:column; gap:1px; color:var(--text-main); font-weight:500; }
        .label .date { font-size:9.5px; color:var(--text-dim); font-weight:400; }
        .vals { display:flex; align-items:baseline; gap:10px; white-space:nowrap; }
        .delta { font-size:10.5px; font-weight:600; min-width:44px; text-align:right; }
        .value { font-size:13.5px; font-weight:700; min-width:52px; text-align:right; }
        .up { color:var(--up); }
        .down { color:var(--down); }
        .neutral { color:var(--text-dim); }
        .status-line { text-align:center; color:#4a4a4a; font-size:9.5px; margin-top:20px; }
        .err-banner { background:#2a1414; border:1px solid #4a1f1f; color:#ff8a8a; border-radius:9px; padding:8px 12px; font-size:11px; margin-bottom:14px; }
      `}</style>

      <div className="topbar">
        <h1>
          MARKET DASHBOARD
          {lastFetched && ` · ${fmtDate(lastFetched.toISOString())} 갱신`}
        </h1>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          {loading ? "..." : "새로고침"}
        </button>
      </div>

      {error && (
        <div className="err-banner">데이터를 불러오지 못했습니다: {error}</div>
      )}

      {!data && loading && <div className="status-line">불러오는 중…</div>}

      {data && (
        <>
          {/* 정크본드 ETF */}
          <Section
            title="정크본드 ETF"
            collapsed={collapsed.junk}
            onToggle={() => toggle("junk")}
          >
            <Row label="HYG" field={data.junkBonds.hyg} digits={2} deltaSuffix="%" deltaDigits={2} />
            <Row label="JNK" field={data.junkBonds.jnk} digits={2} deltaSuffix="%" deltaDigits={2} />
            <Row
              label="High Yield Spread"
              date={data.junkBonds.hySpread.date}
              field={data.junkBonds.hySpread}
              unit="%"
              deltaSuffix=" bps"
              deltaDigits={0}
            />
          </Section>

          {/* 미국 주요 경제지표 */}
          <Section
            title="미국 주요 경제지표"
            collapsed={collapsed.econ}
            onToggle={() => toggle("econ")}
          >
            <Row
              label="실업률(Unemployment Rate)"
              date={data.usEcon.unrate.date}
              field={data.usEcon.unrate}
              unit="%"
              deltaSuffix="%p"
            />
            <Row
              label="비농업고용인구(Nonfarm Payrolls)"
              date={data.usEcon.payems.date}
              field={data.usEcon.payems}
              digits={0}
              deltaDigits={0}
            />
            <Row
              label="소비자물가지수(CPI)"
              date={data.usEcon.cpi.date}
              field={data.usEcon.cpi}
              digits={3}
            />
            <Row
              label="소비자심리지수(미시간대)"
              date={data.usEcon.umcsent.date}
              field={data.usEcon.umcsent}
              digits={1}
              deltaDigits={1}
            />
          </Section>

          {/* 엔화 캐리트레이드 */}
          <Section
            title="엔화 캐리트레이드"
            collapsed={collapsed.jpy}
            onToggle={() => toggle("jpy")}
          >
            <Row
              label="일본 국채 10년물"
              date={data.jpyCarry.jp10y.date}
              field={data.jpyCarry.jp10y}
              unit="%"
            />
            <Row label="USD/JPY 환율" field={data.jpyCarry.usdjpy} digits={2} />
            <Row
              label="USD/JPY 실현변동성(20일 연율화)"
              field={{ value: data.jpyCarry.usdjpyVol.value, delta: null, error: data.jpyCarry.usdjpyVol.error }}
              unit="%"
              digits={2}
            />
          </Section>

          {/* 유동성 · 매크로 지표 */}
          <Section
            title="유동성 · 매크로 지표"
            collapsed={collapsed.macro}
            onToggle={() => toggle("macro")}
          >
            <div className="card-head">
              <span>Yahoo, FRED &amp; ICI</span>
              <span className="timestamp">
                {lastFetched && `원천 확인 ${fmtDate(lastFetched.toISOString())}`}
              </span>
            </div>
            <Row
              label="Fear & Greed"
              field={{
                value: data.macro.fng.value,
                delta: null,
                error: data.macro.fng.error,
              }}
              unit={data.macro.fng.label ? ` (${data.macro.fng.label})` : ""}
              digits={0}
            />
            <Row label="VIX" field={data.macro.vix} digits={2} />
            <Row label="DXY (ICE)" field={data.macro.dxy} digits={3} />
            <Row label="US 2Y" date={data.macro.us2y.date} field={data.macro.us2y} unit="%" />
            <Row label="US 10Y" date={data.macro.us10y.date} field={data.macro.us10y} unit="%" />
            <Row label="US 30Y" date={data.macro.us30y.date} field={data.macro.us30y} unit="%" />
            <Row
              label="Stress Idx (STLFSI4)"
              date={data.macro.stressIdx.date}
              field={data.macro.stressIdx}
              digits={4}
              deltaDigits={3}
            />
            <Row label="M2 Supply" date={data.macro.m2.date} field={data.macro.m2} digits={1} deltaDigits={1} />
            <Row
              label="Fed Balance"
              date={data.macro.fedBalance.date}
              field={data.macro.fedBalance}
              digits={0}
              deltaDigits={0}
            />
            <Row label="TGA (Est)" date={data.macro.tga.date} field={data.macro.tga} digits={0} deltaDigits={0} />
            <Row label="ON RRP" date={data.macro.onrrp.date} field={data.macro.onrrp} digits={3} deltaDigits={3} />
            <Row
              label="지준금(WRESBAL)"
              date={data.macro.wresbal.date}
              field={data.macro.wresbal}
              digits={0}
              deltaDigits={0}
            />
            <Row
              label="Net Liquidity"
              field={{ value: data.macro.netLiquidity.value, delta: null, error: data.macro.netLiquidity.error }}
              digits={0}
            />
            <Row label="SOFR" date={data.macro.sofr.date} field={data.macro.sofr} unit="%" />
            <Row label="IORB" date={data.macro.iorb.date} field={data.macro.iorb} unit="%" />
            <Row
              label="SOFR-IORB Spread"
              field={{ value: data.macro.sofrIorbSpread.value, delta: null, error: data.macro.sofrIorbSpread.error }}
              unit=" bps"
              digits={0}
            />
            <Row
              label="MMF Total (FRED 주간)"
              field={{ value: data.macro.mmfTotal.value, delta: null, error: data.macro.mmfTotal.error }}
              digits={1}
            />
            <Row label="미국국채 1개월" date={data.macro.tbill1mo.date} field={data.macro.tbill1mo} unit="%" />
            <Row label="미국국채 3개월" date={data.macro.tbill3mo.date} field={data.macro.tbill3mo} unit="%" />
            <Row
              label="RRP 금리"
              date={data.macro.onrrpAward.date}
              field={data.macro.onrrpAward}
              unit="%"
            />
          </Section>
        </>
      )}

      <div className="status-line">
        {REFRESH_MS / 1000}초마다 자동 갱신 · Yahoo Finance &amp; FRED (St. Louis Fed) 실데이터
      </div>
    </>
  );
}
