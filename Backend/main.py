import os
import requests
from dotenv import load_dotenv

# 1) .env 로드해서 API 키 가져오기
load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY가 없습니다. .env 파일을 확인하세요.")

# 2) 입력한 검색어로 place_id를 찾기
def find_place_id(query: str) -> str | None:
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
        print("place_id 검색 실패:", data.get("status"), data.get("error_message"))
        return None
    return data["candidates"][0]["place_id"]

# 3) place_id로 상세정보(평점/리뷰) 가져오기
def get_place_details(place_id: str) -> dict:
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,rating,user_ratings_total,reviews,formatted_address",
        "language": "ko",
        "key": API_KEY,
    }
    r = requests.get(url, params=params, timeout=20)
    data = r.json()
    if data.get("status") != "OK":
        print("상세조회 실패:", data.get("status"), data.get("error_message"))
    return data

if __name__ == "__main__":
    # 사용자 입력
    place_query = input("장소 이름을 입력하세요: ").strip()
    if not place_query:
        print("검색어를 입력해야 합니다.")
        exit(1)

    print(f"장소 검색: {place_query}")
    pid = find_place_id(place_query)
    if not pid:
        exit(1)

    print("place_id:", pid)
    details = get_place_details(pid)
    result = details.get("result", {})

    print("\n이름:", result.get("name"))
    print("주소:", result.get("formatted_address"))
    print("평점:", result.get("rating"), f"({result.get('user_ratings_total')}명)")

    reviews = result.get("reviews", [])
    if not reviews:
        print("\n리뷰 데이터가 없거나 노출 제한일 수 있습니다.")
    else:
