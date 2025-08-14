const API_BASE = "http://localhost:8000";

async function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("브라우저에서 위치 권한을 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  });
  return node;
}

async function fetchDetails(placeId) {
  const res = await fetch(
    `${API_BASE}/api/place-details?place_id=${encodeURIComponent(placeId)}`
  );
  if (!res.ok) throw new Error("상세 조회 실패");
  return res.json();
}

document.getElementById("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = document.getElementById("q").value.trim();
  const radius = document.getElementById("radius").value;
  const min_rating = document.getElementById("min_rating").value;
  const min_reviews = document.getElementById("min_reviews").value;
  const resultsEl = document.getElementById("results");
  resultsEl.textContent = "검색 중...";

  try {
    const { lat, lng } = await getCurrentPosition();

    const url = new URL(`${API_BASE}/api/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lng", lng);
    url.searchParams.set("radius", radius);
    url.searchParams.set("min_rating", min_rating);
    url.searchParams.set("min_reviews", min_reviews);

    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      resultsEl.textContent = `오류: ${data.detail || res.status}`;
      return;
    }

    resultsEl.innerHTML = "";
    if (!data.items.length) {
      resultsEl.textContent = "조건에 맞는 결과가 없습니다.";
      return;
    }

    data.items.forEach((item) => {
      const head = el("div", {}, [
        el("strong", {}, item.name || "이름 없음"),
        " ",
        el(
          "span",
          { class: "meta" },
          `(${item.distance_km}km · 평점 ${item.rating ?? "-"} / 리뷰 ${
            item.user_ratings_total ?? 0
          } · 점수 ${item.score})`
        ),
      ]);

      const addr = el("div", { class: "meta" }, item.address || "");

      const btnRow = el("div", {
        style: "margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;",
      });
      const detailBtn = el("button", { type: "button" }, "리뷰 보기");
      detailBtn.addEventListener("click", async () => {
        detailBtn.disabled = true;
        detailBtn.textContent = "불러오는 중...";
        try {
          const d = await fetchDetails(item.place_id);
          const rv = (d.reviews || [])
            .map((r) => `- ${r.author} / ${r.rating}점  ${r.text}`)
            .join("\n");
          alert(
            `${d.name}\n${d.address}\n평점 ${d.rating} (${
              d.user_ratings_total
            }명)\n\n최근 리뷰:\n${rv || "표시할 리뷰가 없습니다."}`
          );
        } catch (err) {
          alert("상세 조회 실패");
        } finally {
          detailBtn.disabled = false;
          detailBtn.textContent = "리뷰 보기";
        }
      });
      btnRow.appendChild(detailBtn);

      const card = el("div", { class: "card" }, [head, addr, btnRow]);
      resultsEl.appendChild(card);
    });
  } catch (err) {
    resultsEl.textContent = `오류: ${err.message}`;
  }
});
