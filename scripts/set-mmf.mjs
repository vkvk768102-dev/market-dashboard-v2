// scripts/set-mmf.mjs
// ICI 주간 "Money Market Fund Assets" 표의 Total 행 값을 검증한 뒤 data/mmf.json 에 저장한다.
//
// ICI 는 Vercel·GitHub 서버의 접속을 모두 막기 때문에(HTTP 403), 매주 Claude 예약 작업이
// ICI 페이지를 읽고 이 스크립트로 값을 저장한다. 대시보드는 data/mmf.json 만 읽는다.
//
// 사용법 (값은 ICI 표의 Total 행, 단위: 십억 달러):
//   node scripts/set-mmf.mjs <최신날짜> <최신값> <직전날짜> <직전값> <증감>
//   예) node scripts/set-mmf.mjs 10/7/2026 7,963.55 9/30/2026 7,891.27 72.27
//
// 값이 이상하면 파일을 건드리지 않고 오류(exit 1)로 끝난다.
// 이미 같은 값이 저장돼 있으면 아무것도 바꾸지 않는다(exit 0).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI_URL = "https://www.ici.org/research/stats/mmf";
const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "mmf.json");

function fail(msg) {
  console.error(`MMF 저장 거부: ${msg}`);
  process.exit(1);
}

// "10/7/2026" 또는 "2026-10-07" -> "2026-10-07"
function toIsoDate(s) {
  let y, m, d;
  let match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) [, m, d, y] = match;
  else if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, m, d] = match;
  else return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function toNumber(s) {
  const t = String(s).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/^[−–]/, "-");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const args = process.argv.slice(2);
if (args.length !== 5) {
  fail("인자 5개가 필요함: <최신날짜> <최신값> <직전날짜> <직전값> <증감>");
}

const date = toIsoDate(args[0]);
const value = toNumber(args[1]);
const prevDate = toIsoDate(args[2]);
const prevValue = toNumber(args[3]);
const delta = toNumber(args[4]);

if (!date || !prevDate) fail(`날짜 형식 오류: ${args[0]}, ${args[2]}`);
if (value == null || prevValue == null || delta == null) {
  fail(`숫자 형식 오류: ${args[1]}, ${args[3]}, ${args[4]}`);
}

// 단위(십억 달러)와 범위 확인
if (value < 1000 || value > 50000 || prevValue < 1000 || prevValue > 50000) {
  fail(`Total 값이 예상 범위(1,000~50,000)를 벗어남: ${value}, ${prevValue}`);
}
// 주간 자료이므로 두 날짜는 보통 7일 간격 (공휴일로 6~8일까지 허용)
const gap = daysBetween(prevDate, date);
if (gap < 5 || gap > 9) fail(`두 날짜의 간격이 주간 자료와 맞지 않음: ${prevDate} -> ${date} (${gap}일)`);
// 미래 날짜 방지 (시차 고려해 하루 여유)
if (Date.parse(date) > Date.now() + 86400000) fail(`기준일이 미래임: ${date}`);
// 표의 증감과 두 값의 차이가 맞는지 (반올림 오차 허용)
const diff = Number((value - prevValue).toFixed(2));
if (Math.abs(diff - delta) > 0.05) fail(`증감이 맞지 않음: ${value} - ${prevValue} = ${diff}, 표의 증감 ${delta}`);
// 한 주에 10% 넘게 변하면 잘못 읽었을 가능성이 큼
if (Math.abs(delta) / prevValue > 0.1) fail(`주간 변동이 10%를 넘음: ${delta}`);

let previous = null;
try {
  previous = JSON.parse(await readFile(OUT_PATH, "utf8"));
} catch {
  // 파일이 아직 없으면 새로 만든다
}

if (previous?.date) {
  if (date < previous.date) fail(`새 기준일(${date})이 저장된 기준일(${previous.date})보다 오래됨`);
  // 지난주에 저장한 값과 이번 표의 "직전 값"이 이어지는지 확인 (ICI 의 소폭 수정은 허용)
  if (prevDate === previous.date && Math.abs(prevValue - previous.value) > 20) {
    fail(`직전 값이 저장된 값과 크게 다름: 표 ${prevValue}, 저장 ${previous.value} (${previous.date})`);
  }
}

const next = {
  source: "ICI",
  url: ICI_URL,
  unit: "billions of USD",
  date, // 기준일(주간 마감 수요일)
  value, // 전체 MMF 총액
  prevDate,
  prevValue,
  delta, // 전주 대비 증감
};

const unchanged =
  previous &&
  ["date", "value", "prevDate", "prevValue", "delta"].every((k) => previous[k] === next[k]);
if (unchanged) {
  console.log(`변경 없음: ${date} ${value}`);
  process.exit(0);
}

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log(`저장 완료: ${date} ${value} (전주 대비 ${delta})`);
