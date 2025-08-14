# Backend/app/main.py
import os
import math
from typing import Optional, List, Dict, Any

import requests
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY가 없습니다. .env 파일을 확인하세요.")

app = FastAPI(title="Places API", version="1.0.0")

# CORS: 필요 시 프론트 주소로 바꾸세요 (예: http://localhost:5500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173",
                   "http://127.0.0.1:5173"],  # 개발 중엔 * 허용, 배포 시 도메인 지정 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 간단 헬스체크
@app.get("/health")
def health():
    return {"status": "ok"}

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    to_rad = math.pi / 180.0
    dlat = (lat2 - lat1) * to_rad
    dlon = (lon2 - lon1) * to_rad
    a = math.sin(dlat/2)**2 + math.cos(lat1*to_rad)*math.cos(lat2*to_rad)*math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def find_place_id(query: str) -> Optional[str]:
    url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    params = {
        "input": query,
        "inputtype": "textquery",
        "fields": "place_id",
        "language": "ko",
        "key": API_KEY,
    }
    r = requests.get(url, params=params, timeout=20)
    data = r.json()
    if data.get("status") != "OK" or not data.get("candidates"):
        return None
    return data["candidates"][0]["place_id"]

def get_place_details(place_id: str) -> Dict[str, Any]:
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,rating,user_ratings_total,reviews,formatted_address,geometry,photo,photos,url,website",
        "language": "ko",
        "key": API_KEY,
    }
    r = requests.get(url, params=params, timeout=20)
    data = r.json()
    if data.get("status") != "OK":
        raise HTTPException(status_code=400, detail=data.get("error_message") or data.get("status"))
    return data.get("result", {})

@app.get("/api/place-id")
def api_place_id(q: str = Query(..., description="장소 이름/키워드")):
    pid = find_place_id(q)
    if not pid:
        raise HTTPException(status_code=404, detail="place_id를 찾을 수 없습니다.")
    return {"place_id": pid}

@app.get("/api/place-details")
def api_place_details(place_id: str = Query(...)):
    result = get_place_details(place_id)
    # 최근 리뷰 5개만 축약해서 반환
    reviews = result.get("reviews") or []
    short_reviews = []
    for rv in reviews[:5]:
        text = (rv.get("text") or "").strip().replace("\n", " ")
        short_reviews.append({
            "author": rv.get("author_name"),
            "rating": rv.get("rating"),
            "text": text[:120] + ("..." if len(text) > 120 else "")
        })
    return {
        "name": result.get("name"),
        "address": result.get("formatted_address"),
        "rating": result.get("rating"),
        "user_ratings_total": result.get("user_ratings_total"),
        "location": result.get("geometry", {}).get("location"),
        "reviews": short_reviews,
        "url": result.get("url"),
        "website": result.get("website"),
    }

@app.get("/api/search")
def api_search(
    q: str = Query(..., description="검색 키워드(예: '맛집', '카페')"),
    lat: float = Query(..., description="현재 위도"),
    lng: float = Query(..., description="현재 경도"),
    radius: int = Query(1500, ge=1, le=50000, description="검색 반경(m)"),
    min_rating: float = Query(0.0, ge=0.0, le=5.0, description="최소 평점"),
    min_reviews: int = Query(0, ge=0, description="최소 리뷰 수")
):
    """
    Google Places Nearby Search로 주변 장소 조회 → 필터 → 스코어링 → 정렬
    """
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "keyword": q,
        "language": "ko",
        "key": API_KEY,
    }
    r = requests.get(url, params=params, timeout=20)
    data = r.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise HTTPException(status_code=400, detail=data.get("error_message") or data.get("status"))

    results: List[Dict[str, Any]] = data.get("results", [])

    def compute_score(item: Dict[str, Any]) -> float:
        rating = float(item.get("rating") or 0)
        reviews = int(item.get("user_ratings_total") or 0)
        loc = item.get("geometry", {}).get("location") or {}
        d_km = haversine_km(lat, lng, loc.get("lat", lat), loc.get("lng", lng))
        # 간단 가중치 (원하시면 조정 가능)
        # 평점 가중치 1.0, 리뷰 로그 가중치 0.7, 거리 패널티 0.15/km
        return rating * 1.0 + math.log1p(reviews) * 0.7 - d_km * 0.15

    # 필터링
    filtered = []
    for it in results:
        rating = float(it.get("rating") or 0)
        reviews = int(it.get("user_ratings_total") or 0)
        if rating < min_rating:
            continue
        if reviews < min_reviews:
            continue

        sc = compute_score(it)
        loc = it.get("geometry", {}).get("location") or {}
        distance_km = haversine_km(lat, lng, loc.get("lat", lat), loc.get("lng", lng))
        filtered.append({
            "place_id": it.get("place_id"),
            "name": it.get("name"),
            "address": it.get("vicinity"),
            "rating": rating,
            "user_ratings_total": reviews,
            "location": loc,
            "distance_km": round(distance_km, 2),
            "score": round(sc, 3),
            "open_now": it.get("opening_hours", {}).get("open_now"),
            "price_level": it.get("price_level"),
            "types": it.get("types"),
        })

    # 점수로 내림차순 정렬
    filtered.sort(key=lambda x: x["score"], reverse=True)
    return {"count": len(filtered), "items": filtered}
