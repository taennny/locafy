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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderStars(rating) {
  const n = Math.round(Number(rating) || 0);
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(n, 5);
}

async function fetchDetails(placeId) {
  const res = await fetch(
    `${API_BASE}/api/place-details?place_id=${encodeURIComponent(placeId)}`
  );
  if (!res.ok) throw new Error("상세 조회 실패");
  return res.json();
}

const overlay = document.getElementById("review-modal-overlay");
const dialog = document.getElementById("review-modal");
const card = dialog?.querySelector(".rm-card");
const content = document.getElementById("review-dialog-content");
const titleEl = document.getElementById("review-dialog-title");
const btnClose = dialog?.querySelector(".rm-close");
const btnCancel = dialog?.querySelector('[data-action="cancel"]');

let lastFocused = null;

function openReviewModal({ placeId, title = "리뷰", scroll = "paper" }) {
  if (!overlay || !dialog || !card || !content || !titleEl) return;

  titleEl.textContent = title;
  card.setAttribute("data-scroll", scroll === "body" ? "body" : "paper");

  lastFocused = document.activeElement;
  overlay.setAttribute("aria-hidden", "false");
  dialog.setAttribute("aria-hidden", "false");

  if (scroll === "body") {
    document.body.classList.add("rm-lock");
  } else {
    setTimeout(() => content.focus(), 0);
  }

  content.innerHTML = `<div class="rm-empty">로딩 중...</div>`;

  fetchDetails(placeId)
    .then((d) => {
      const header = `
        <div class="rm-review" style="border:none; padding:0; margin:0 0 10px 0;">
          <div class="rm-meta">
            <strong>${escapeHtml(d.name || title)}</strong>
            <span>·</span>
            <span class="rm-stars">${renderStars(d.rating)} (${
        d.rating ?? "-"
      })</span>
            <span>·</span>
            <span>${escapeHtml(d.user_ratings_total ?? 0)}명</span>
          </div>
          <div class="rm-text" style="color:#666">${escapeHtml(
            d.address || ""
          )}</div>
        </div>
      `;

      const reviews = (d.reviews || []).map((r) => {
        const author = r.author || r.author_name || "익명";
        const rating = Number(r.rating ?? 0);
        const time = r.time || r.relative_time_description || "";
        const text = (r.text || r.content || "").toString();

        return `
          <article class="rm-review">
            <div class="rm-meta">
              <strong>${escapeHtml(author)}</strong>
              <span class="rm-stars">${renderStars(rating)} (${rating.toFixed(
          1
        )})</span>
              <span>·</span>
              <span>${escapeHtml(time)}</span>
            </div>
            <div class="rm-text">${escapeHtml(text)}</div>
          </article>
        `;
      });

      content.innerHTML =
        header +
        (reviews.length
          ? reviews.join("")
          : `<div class="rm-empty">표시할 리뷰가 없습니다.</div>`);
    })
    .catch((err) => {
      console.error(err);
      content.innerHTML = `<div class="rm-empty">리뷰를 불러오는 중 오류가 발생했습니다.</div>`;
    });
}

function closeReviewModal() {
  if (!overlay || !dialog) return;
  overlay.setAttribute("aria-hidden", "true");
  dialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("rm-lock");
  if (lastFocused && typeof lastFocused.focus === "function") {
    lastFocused.focus();
  }
}

overlay?.addEventListener("click", closeReviewModal);
btnClose?.addEventListener("click", closeReviewModal);
btnCancel?.addEventListener("click", closeReviewModal);

dialog?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeReviewModal();
  if (e.key === "Tab") {
    const focusables = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

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

      const reviewBtn = el("button", { type: "button" }, "리뷰 보기");
      reviewBtn.addEventListener("click", () => {
        openReviewModal({
          placeId: item.place_id,
          title: item.name || "리뷰",
          scroll: "paper",
        });
      });
      btnRow.appendChild(reviewBtn);

      const card = el("div", { class: "card" }, [head, addr, btnRow]);
      resultsEl.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    resultsEl.textContent = `오류: ${err.message}`;
  }
});
