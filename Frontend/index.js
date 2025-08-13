/** 상태 */
const state = {
  coords: null,
  page: 1,
  pageSize: 10,
  loading: false,
  lastQuery: null,
};

/** 엘리먼트 */
const $q = document.getElementById("q");
const $radius = document.getElementById("radius");
const $minRating = document.getElementById("minRating");
const $sortBy = document.getElementById("sortBy");
const $openNow = document.getElementById("openNow");
const $useLocation = document.getElementById("useLocation");
const $searchBtn = document.getElementById("searchBtn");
const $status = document.getElementById("status");
const $list = document.getElementById("list");
const $prev = document.getElementById("prev");
const $next = document.getElementById("next");
const $locHint = document.getElementById("locHint");

/** 유틸 */
const fmtMeters = (m) =>
  m >= 1000 ? (m / 1000).toFixed(1) + "km" : Math.round(m) + "m";
const cls = (...xs) => xs.filter(Boolean).join(" ");

function setBusy(b) {
  state.loading = b;
  const aria = document.querySelector(".results");
  aria.setAttribute("aria-busy", String(b));
  $searchBtn.disabled = b;
  $searchBtn.innerHTML = b
    ? '<span class="loader" aria-hidden="true"></span> 불러오는 중…'
    : "검색";
}

function showStatus(msg, type = "hint") {
  $status.className = type === "error" ? "error" : "hint";
  $status.innerHTML = msg;
}

function escapeHtml(str = "") {
  return String(str).replace(
    /[&<>'"]/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[s])
  );
}

/** 위치 */
async function useLocation() {
  try {
    showStatus("현재 위치를 가져오는 중…");
    const coords = await getCurrentPosition();
    state.coords = { lat: coords.latitude, lng: coords.longitude };
    $locHint.innerHTML = `위치 설정됨: ${state.coords.lat.toFixed(
      5
    )}, ${state.coords.lng.toFixed(5)}`;
    showStatus("위치 설정 완료. 이제 검색을 실행할 수 있어요.");
    initMap();
    ensureUserMarker();
  } catch (e) {
    console.error(e);
    showStatus("위치 권한을 허용해주세요. 또는 수동 검색은 가능해요.", "error");
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator))
      return reject(new Error("이 브라우저는 위치를 지원하지 않습니다."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

/** 검색 */
async function search(page = 1) {
  const query = $q.value.trim();
  if (!query) {
    showStatus("검색어를 입력해주세요.", "error");
    return;
  }
  if (!state.coords) {
    showStatus("현재 위치를 먼저 설정해주세요.", "error");
    return;
  }
  state.page = page;
  const params = new URLSearchParams({
    query,
    lat: state.coords.lat,
    lng: state.coords.lng,
    radius: $radius.value || 1500,
    minRating: $minRating.value || 0,
    openNow: $openNow.value,
    sortBy: $sortBy.value,
    page: state.page,
    pageSize: state.pageSize,
  });
  state.lastQuery = params.toString();

  setBusy(true);
  showStatus("추천 결과를 불러오는 중…");
  try {
    const res = await fetch(`/api/recommendations?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`요청 실패: ${res.status}`);
    const data = await res.json();
    render(data.items, data.pageInfo);
    showStatus(`총 ${data.items?.length || 0}개 결과 (페이지 ${state.page})`);
  } catch (e) {
    console.error(e);
    showStatus(
      "결과를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

/** 결과 렌더 + 지도 마커/상세 버튼 연결 */
function render(items, pageInfo) {
  $list.innerHTML = "";
  markersClear();
  if (!items || items.length === 0) {
    $list.innerHTML =
      '<div class="hint">검색 결과가 없습니다. 검색어/반경/필터를 조정해 보세요.</div>';
    fitMapToUserOnly();
  } else {
    const frag = document.createDocumentFragment();
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "item";
      el.dataset.placeId = it.placeId;
      el.innerHTML = `
              <div>
                <h3>${escapeHtml(it.name)} <span class="badge">${(
        it.rating ?? 0
      ).toFixed(1)}★ / ${it.userRatingsTotal ?? 0}명</span></h3>
                <div class="meta">
                  <span>${escapeHtml(it.address || "")}</span>
                  ${
                    it.distanceMeters != null
                      ? `<span>· ${fmtMeters(it.distanceMeters)}</span>`
                      : ""
                  }
                  ${it.openNow ? "<span>· 영업중</span>" : ""}
                  ${
                    it.priceLevel != null
                      ? `<span>· ₩`.repeat(it.priceLevel + 1) + "</span>"
                      : ""
                  }
                </div>
                <div class="meta" style="margin-top:6px;">
                  <span class="score">추천점수: ${(it.score ?? 0).toFixed(
                    3
                  )}</span>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn secondary js-focus">지도</button>
                <button class="btn secondary js-detail">상세</button>
                <a class="btn secondary" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  it.name
                )}&query_place_id=${encodeURIComponent(
        it.placeId
      )}">지도 열기</a>
              </div>`;
      frag.appendChild(el);
    }
    $list.appendChild(frag);
    updateMarkers(items);
    bindListEvents();
  }
  // 페이지 버튼
  $prev.disabled = state.page <= 1;
  $next.disabled = !(pageInfo && pageInfo.hasNextPage);
}

/** 이벤트 바인딩 */
document.getElementById("detailClose").addEventListener("click", () => {
  document.getElementById("detailPanel").style.display = "none";
});
$useLocation.addEventListener("click", useLocation);
$searchBtn.addEventListener("click", () => search(1));
$q.addEventListener("keydown", (e) => {
  if (e.key === "Enter") search(1);
});
$prev.addEventListener("click", () => {
  if (state.page > 1) search(state.page - 1);
});
$next.addEventListener("click", () => search(state.page + 1));

// 초기 포커스
$q.focus();

/*** Map logic (Leaflet) ***/
let map,
  userMarker,
  markers = [];
function initMap() {
  if (map) return;
  map = L.map("map", { zoomControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  // default center: Seoul City Hall
  map.setView([37.5665, 126.978], 12);
}
function ensureUserMarker() {
  if (!state.coords || !map) return;
  const { lat, lng } = state.coords;
  if (!userMarker) {
    userMarker = L.marker([lat, lng], { title: "현재 위치" }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
  }
}
function fitMapToUserOnly() {
  initMap();
  ensureUserMarker();
  if (userMarker) {
    map.setView(userMarker.getLatLng(), 14);
  }
}
function markersClear() {
  markers.forEach((m) => m.remove());
  markers = [];
}
function updateMarkers(items) {
  initMap();
  ensureUserMarker();
  const group = [];
  for (const it of items) {
    const pos = [it.location.lat, it.location.lng];
    const m = L.marker(pos, { title: it.name });
    m.addTo(map).bindPopup(
      `<b>${escapeHtml(it.name)}</b><br/>${(it.rating ?? 0).toFixed(1)}★, ${
        it.userRatingsTotal ?? 0
      } 리뷰<br/>${escapeHtml(it.address || "")}`
    );
    m.on("click", () => openDetail(it.placeId));
    markers.push(m);
    group.push(m);
  }
  // Fit bounds
  const ll = markers.map((m) => m.getLatLng());
  if (userMarker) ll.push(userMarker.getLatLng());
  if (ll.length) {
    const bounds = L.latLngBounds(ll);
    map.fitBounds(bounds.pad(0.2));
  }
}
function bindListEvents() {
  document.querySelectorAll(".js-focus").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const card = e.currentTarget.closest(".item");
      const name = card.querySelector("h3")?.childNodes[0]?.nodeValue?.trim();
      const marker = markers.find((m) =>
        (m.getPopup()?.getContent() || "").includes(name)
      );
      if (marker) {
        map.setView(marker.getLatLng(), 17);
        marker.openPopup();
      }
    })
  );
  document.querySelectorAll(".js-detail").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const card = e.currentTarget.closest(".item");
      const placeId = card.dataset.placeId;
      openDetail(placeId);
    })
  );
}

/*** Detail panel ***/
const $panel = document.getElementById("detailPanel");
const $panelBody = document.getElementById("detailBody");
const $panelCloseBtn = document.getElementById("detailClose");
$panelCloseBtn.addEventListener("click", () => {
  $panel.style.display = "none";
});

async function openDetail(placeId) {
  try {
    $panel.style.display = "block";
    $panelBody.innerHTML =
      '<div class="hint"><span class="loader"></span> 상세 정보를 불러오는 중…</div>';
    const res = await fetch(`/api/place/${encodeURIComponent(placeId)}`);
    if (!res.ok) throw new Error("상세 요청 실패");
    const d = await res.json();
    renderDetail(d);
  } catch (e) {
    console.error(e);
    $panelBody.innerHTML =
      '<div class="error">상세 정보를 불러오지 못했습니다.</div>';
  }
}

function renderDetail(d) {
  const hours = d.openingHoursText
    ? `<div class="kv"><div>영업시간</div><div>${d.openingHoursText
        .map(escapeHtml)
        .join("<br/>")}</div></div>`
    : "";
  const phone = d.phone
    ? `<div class="kv"><div>전화</div><div>${escapeHtml(d.phone)}</div></div>`
    : "";
  const website = d.website
    ? `<div class="kv"><div>웹사이트</div><div><a target="_blank" rel="noreferrer" href="${d.website}">${d.website}</a></div></div>`
    : "";
  const photos = (d.photos || [])
    .slice(0, 8)
    .map((p) => `<img src="${p.url}" alt="${escapeHtml(d.name)} 사진"/>`)
    .join("");
  $panelBody.innerHTML = `
          <div class="meta" style="margin-bottom:8px;">${(
            d.rating ?? 0
          ).toFixed(1)}★ · ${d.userRatingsTotal ?? 0} 리뷰</div>
          <div class="kv"><div>주소</div><div>${escapeHtml(
            d.address || ""
          )}</div></div>
          ${phone}
          ${website}
          ${hours}
          ${photos ? `<div class="photos">${photos}</div>` : ""}
        `;
}

// Map init on load
initMap();
