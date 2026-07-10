# LOCAFY

내 위치를 기반으로 **주변 맛집·카페·장소를 추천**해주는 웹 애플리케이션입니다.
단순 평점순이 아니라 **평점·리뷰 수·거리**를 함께 반영한 가중 점수로 장소를 랭킹합니다.

> 크래프톤 정글 웹 개발 집중 프로그램 **Sprint 1** 프로젝트

---

## 주요 기능

- **위치 기반 검색** — 브라우저 Geolocation으로 현재 위치를 잡아 반경 내 장소를 조회
- **필터링** — 최소 평점 / 최소 리뷰 수로 결과를 걸러냄
- **자체 랭킹 알고리즘** — 아래 점수 공식으로 정렬

  ```
  score = 평점 × 1.0 + log(1 + 리뷰수) × 0.7 − 거리(km) × 0.15
  ```

  평점이 높아도 리뷰가 적으면 신뢰도를 낮추고, 멀수록 감점하여 "가깝고 검증된 좋은 곳"이 상위에 오도록 설계했습니다.

- **리뷰 모달** — 장소별 상세 리뷰를 팝업으로 확인 (ESC 닫기, 포커스 트랩 등 접근성 대응)

## 기술 스택

| 구분         | 사용 기술                     |
| ------------ | ----------------------------- |
| Backend      | Python, FastAPI               |
| Frontend     | Vanilla JavaScript, HTML, CSS |
| External API | Google Places API             |

## 프로젝트 구조

```
.
├── Backend/
│   └── app/
│       └── main.py      # FastAPI 서버 · Places API 연동 · 스코어링 로직
└── Frontend/
    ├── index.html
    ├── index.css
    └── index.js         # 검색 · 결과 렌더링 · 리뷰 모달
```

## 실행 방법

### 1. 사전 준비

- Python 3.10+
- [Google Places API 키](https://developers.google.com/maps/documentation/places/web-service/get-api-key)

### 2. Backend

```bash
cd Backend
pip install fastapi uvicorn requests python-dotenv

# .env 파일 생성 후 API 키 입력
echo "GOOGLE_API_KEY=발급받은_키" > .env

uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

`Frontend/index.html`을 로컬 서버(예: VS Code Live Server, 포트 5173)로 실행합니다.

> CORS 설정이 `localhost:5173` 기준이라 해당 포트로 띄우는 것을 권장합니다.

## API 엔드포인트

| Method | Path                 | 설명                                    |
| ------ | -------------------- | --------------------------------------- |
| `GET`  | `/health`            | 헬스 체크                               |
| `GET`  | `/api/search`        | 주변 장소 검색 · 필터 · 스코어링 · 정렬 |
| `GET`  | `/api/place-id`      | 키워드로 place_id 조회                  |
| `GET`  | `/api/place-details` | place_id로 상세 정보 · 리뷰 조회        |
