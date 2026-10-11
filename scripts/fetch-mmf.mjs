// scripts/fetch-mmf.mjs
// ICI(Investment Company Institute) 주간 "Money Market Fund Assets" 발표 페이지에서
// Total(전체 MMF 총액) 행을 읽어 data/mmf.json 에 저장한다.
//
// - GitHub Actions(.github/workflows/update-mmf.yml)가 정해진 요일에 자동 실행한다.
// - ICI 가 Vercel 서버의 요청을 막기 때문에(HTTP 403), 대시보드 서버가 직접 읽지 않고
//   이 스크립트가 미리 읽어서 저장해 둔 파일을 대시보드가 읽는 방식이다.
// - 값을 읽지 못하면 파일을 건드리지 않고 오류로 끝난다(기존 값이 그대로 유지됨).
//
// 직접 실행:  node scripts/fetch-mmf.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI_URL = "https://www.ici.org/research/stats/mmf";
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "mmf.json");

// ---------- HTML 파싱 ----------
function decodeEntities(s) {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&minus;|&#8722;|&ndash;|&#8211;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cellText(html) {
  return decodeEntities(
    html
      .replace(/<sup[\s\S]*?<\/sup>/gi, "") // 각주 번호 제거
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

// 표의 모든 행을 [칸, 칸, ...] 배열로 뽑는다.
function tableRows(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const rows = [];
  for (const tr of cleaned.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const td of tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(cellText(td[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function toIsoDate(mdy) {
  const m = mdy.match(DATE_RE);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function toNumber(s) {
  const t = s.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// ICI 표 구조:
//   (빈칸) | 10/7/2026 | 9/30/2026 | $ Change* | 9/23/2026
//   Total  | 7,963.55  | 7,891.27  | 72.27     | 7,936.72
export function parseIciMmf(html) {
  const rows = tableRows(html);

  // 날짜가 2개 이상 들어 있는 행 = 머리글 행
  const headerIdx = rows.findIndex((r) => r.filter((c) => DATE_RE.test(c)).length >= 2);
  if (headerIdx === -1) throw new Error("ICI 표의 날짜 머리글을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)");
  const header = rows[headerIdx];
  const dateCols = header.map((c, i) => (DATE_RE.test(c) ? i : -1)).filter((i) => i !== -1);
  const changeCol = header.findIndex((c) => /change/i.test(c));

  // 머리글 아래에서 첫 번째 "Total" 행
  const total = rows.slice(headerIdx + 1).find((r) => /^total$/i.test(r[0] || ""));
  if (!total) throw new Error("ICI 표에서 Total 행을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)");

  // 머리글 첫 칸이 비어 있어 칸 수가 하나 모자란 경우를 보정
  const offset = total.length - header.length;
  const at = (col) => (col === -1 ? null : toNumber(total[col + offset] ?? ""));

  const value = at(dateCols[0]);
  const prevValue = at(dateCols[1]);
  const reportedChange = at(changeCol);
  const date = toIsoDate(header[dateCols[0]]);
  const prevDate = toIsoDate(header[dateCols[1]]);

  if (value == null || prevValue == null || !date || !prevDate) {
    throw new Error(`Total 행의 숫자를 읽지 못함: ${JSON.stringify(total)}`);
  }
  // 값이 터무니없으면(단위 변경, 엉뚱한 표) 저장하지 않는다. 단위: 십억 달러
  if (value < 1000 || value > 50000 || prevValue < 1000 || prevValue > 50000) {
    throw new Error(`Total 값이 예상 범위를 벗어남: ${value}, ${prevValue}`);
  }
  if (date <= prevDate) {
    throw new Error(`날짜 순서가 예상과 다름: ${date}, ${prevDate}`);
  }
  const diff = Number((value - prevValue).toFixed(2));
  if (reportedChange != null && Math.abs(diff - reportedChange) > 0.05) {
    throw new Error(`증감이 표와 맞지 않음: 계산 ${diff}, 표 ${reportedChange}`);
  }

  return {
    source: "ICI",
    url: ICI_URL,
    unit: "billions of USD",
    date, // 기준일(주간 마감 수요일)
    value, // 전체 MMF 총액
    prevDate,
    prevValue,
    delta: reportedChange ?? diff, // 전주 대비 증감
  };
}

// ---------- 실행 ----------
async function main() {
  const res = await fetch(ICI_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; market-dashboard-v2/1.0; +https://github.com/vkvk768102-dev/market-dashboard-v2)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`ICI 페이지 요청 실패: HTTP ${res.status} (403이면 ICI가 이 서버의 접속을 막은 것)`);
  }
  const parsed = parseIciMmf(await res.text());

  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUT_PATH, "utf8"));
  } catch {
    // 파일이 아직 없으면 새로 만든다
  }

  const unchanged =
    previous &&
    previous.date === parsed.date &&
    previous.value === parsed.value &&
    previous.delta === parsed.delta;
  if (unchanged) {
    console.log(`변경 없음: ${parsed.date} ${parsed.value}`);
    return;
  }
  if (previous?.date && parsed.date < previous.date) {
    throw new Error(`새로 읽은 날짜(${parsed.date})가 저장된 날짜(${previous.date})보다 오래됨`);
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  console.log(`저장 완료: ${parsed.date} ${parsed.value} (전주 대비 ${parsed.delta})`);
}

// 다른 파일에서 import 할 때는 실행하지 않는다(테스트용)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`MMF 갱신 실패: ${e.message}`);
    process.exit(1);
  });
}
