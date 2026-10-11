# 시장 지표 대시보드

정크본드 ETF, 미국 주요 경제지표, 엔화 캐리트레이드, 유동성(FRED) 지표를
실시간으로 가져와 보여주는 모바일 대시보드입니다. Next.js + Vercel 기반입니다.

## 데이터 출처

| 항목 | 출처 | 비고 |
|---|---|---|
| HYG, JNK, VIX, DXY, USD/JPY | Yahoo Finance (비공식 chart API) | API 키 불필요 |
| High Yield Spread, 실업률, 비농업고용, CPI, 미시간 심리지수, 국채금리(2/10/30Y·1개월·3개월), 일본 10년물, Stress Index, M2, Fed 자산, TGA, ON RRP, ON RRP 금리, 지준금(WRESBAL), SOFR, IORB, MMF 총액 | FRED (St. Louis Fed) | 무료 API 키 필요 |
| Fear & Greed Index | CNN 비공식 엔드포인트 | 비공식이라 가끔 실패할 수 있음 |
| Net Liquidity, SOFR-IORB Spread | 위 FRED 값으로 서버에서 직접 계산 | - |
| ISM 제조업 PMI | 무료 공개 API가 없어 **제외**했습니다 | 필요하면 직접 값을 입력하는 칸을 추가할 수 있어요 |
| USD/JPY 변동성 | Yahoo Finance 과거 종가로 20일 실현변동성을 직접 계산 | 원본 데이터의 "옵션 내재변동성"과는 다를 수 있음 |

MMF 총액은 ICI 주간 발표(https://www.ici.org/research/stats/mmf)의 Total 값을 씁니다.
ICI가 Vercel·GitHub 서버의 접속을 막기 때문에, 매주 Claude 예약 작업이 값을 읽어
`data/mmf.json`에 저장하고 대시보드는 그 파일을 읽습니다. 파일을 못 읽으면
FRED 분기 시리즈(MMMFFAQ027S)로 대신합니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # FRED_API_KEY 입력
npm run dev
```

`http://localhost:3000` 접속.

## FRED API 키 발급 (무료, 1분)

1. https://fred.stlouisfed.org/docs/api/api_key.html 접속
2. 계정 생성 후 API 키 발급
3. `.env.local`의 `FRED_API_KEY`에 붙여넣기

## Vercel 배포 (휴대폰에서 보기)

1. 이 폴더를 GitHub 저장소로 올리기
   ```bash
   git init
   git add .
   git commit -m "market dashboard"
   git branch -M main
   git remote add origin <본인 GitHub 저장소 URL>
   git push -u origin main
   ```
2. https://vercel.com 에서 GitHub 계정으로 로그인 → "Add New Project" → 방금 만든 저장소 선택
3. **Environment Variables**에 `FRED_API_KEY` 추가 (fred.stlouisfed.org에서 발급받은 값)
4. Deploy 클릭 → 몇 분 뒤 `https://your-project.vercel.app` 같은 주소가 생성됨
5. 휴대폰 브라우저에서 그 주소로 접속 → 주소창 메뉴에서 "홈 화면에 추가"하면 앱처럼 아이콘으로 사용 가능

## 참고

- 60초마다 자동 갱신되며, 우측 상단 "새로고침" 버튼으로 수동 갱신도 가능합니다.
- Yahoo Finance, CNN Fear&Greed는 비공식 엔드포인트라 언젠가 응답 형식이 바뀌거나
  일시적으로 막힐 수 있습니다. 그 경우 해당 항목만 "불러오기 실패"로 표시되고
  나머지 항목은 정상 표시됩니다.
- 시장이 열려있지 않은 시간(주말, 공휴일)에는 직전 종가가 계속 표시됩니다.
