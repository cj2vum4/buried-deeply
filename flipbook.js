(function () {
  const el = document.getElementById("flipbook-data");
  if (!el) return;
  const images = JSON.parse(el.textContent);
  if (!Array.isArray(images) || images.length === 0) return;

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** 電腦／細指標：Ctrl+滾輪縮放、拖曳平移 */
  const desktopZoom =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: fine)").matches
      : true;

  /**
   * 依需求：不顯示放大/縮小圖示（UI）。
   * 但電腦端仍允許用 Ctrl+滾輪、+/-/0 縮放圖片以方便閱讀。
   */
  const zoomEnabled = desktopZoom && !reduceMotion;

  let current = 0;
  let animating = false;

  const book = document.getElementById("book");
  const indicator = document.getElementById("page-indicator");
  const pages = [];

  if (desktopZoom) {
    book.classList.add("desktop-zoom");
  }
  // 不顯示任何縮放 UI（但可用快捷鍵/滾輪縮放）

  let lastZoomResetAtPage = -1;
  let zoomScale = 1;
  let panX = 0;
  let panY = 0;
  let panDrag = null;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4.5;
  const ZOOM_STEP = 1.12;

  function getInner(pageEl) {
    return pageEl ? pageEl.querySelector(".page-zoom-inner") : null;
  }

  function applyZoomToInner(inner) {
    if (!inner) return;
    // Windows/Chrome：任何 transform（即使 scale(1)）都可能導致插值變糊。
    // 因此未縮放/未平移時直接用 transform:none，避免電腦端「失真」。
    if (zoomScale === 1 && panX === 0 && panY === 0) {
      inner.style.transform = "none";
      return;
    }
    inner.style.transform =
      "translate(" + panX + "px," + panY + "px) scale(" + zoomScale + ")";
  }

  function applyZoomToCurrent() {
    applyZoomToInner(getInner(pages[current]));
    if (zoomEnabled) {
      book.classList.toggle("can-pan", zoomScale > 1.03);
    }
  }

  function clampPan() {
    if (zoomScale <= 1) {
      panX = 0;
      panY = 0;
      return;
    }
    const w = book.offsetWidth || 1;
    const h = book.offsetHeight || 1;
    const marginX = ((zoomScale - 1) * w) / 2;
    const marginY = ((zoomScale - 1) * h) / 2;
    panX = Math.max(-marginX, Math.min(marginX, panX));
    panY = Math.max(-marginY, Math.min(marginY, panY));
  }

  function updateZoomLabel() {
    const zl = document.getElementById("zoom-level");
    if (zl) zl.textContent = Math.round(zoomScale * 100) + "%";
  }

  function resetDesktopZoomState() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    book.classList.remove("can-pan");
    pages.forEach(function (p) {
      applyZoomToInner(getInner(p));
    });
    updateZoomLabel();
  }

  function zoomIn() {
    zoomScale = Math.min(ZOOM_MAX, zoomScale * ZOOM_STEP);
    clampPan();
    applyZoomToCurrent();
    updateZoomLabel();
  }

  function zoomOut() {
    zoomScale = Math.max(ZOOM_MIN, zoomScale / ZOOM_STEP);
    if (zoomScale <= 1.001) {
      zoomScale = 1;
      panX = 0;
      panY = 0;
    }
    clampPan();
    applyZoomToCurrent();
    updateZoomLabel();
  }

  images.forEach(function (src) {
    const page = document.createElement("div");
    page.className = "page";
    const wrap = document.createElement("div");
    wrap.className = "page-zoom-wrap";
    const inner = document.createElement("div");
    inner.className = "page-zoom-inner";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    inner.appendChild(img);
    wrap.appendChild(inner);
    page.appendChild(wrap);
    book.appendChild(page);
    pages.push(page);
  });

  function updateIndicator() {
    if (indicator) {
      indicator.textContent = current + 1 + " / " + images.length;
    }
  }

  function resetPageEl(p) {
    if (!p) return;
    p.classList.remove(
      "is-active",
      "flip-out-next",
      "below-next",
      "flip-out-prev",
      "below-prev",
      "no-flip-transition"
    );
    p.style.transform = "";
    p.style.visibility = "";
    p.style.zIndex = "";
    p.style.transition = "";
    p.style.filter = "";
    p.style.transformOrigin = "";
    p.style.boxShadow = "";
  }

  function applyStaticView() {
    if (zoomEnabled && lastZoomResetAtPage !== current) {
      lastZoomResetAtPage = current;
      resetDesktopZoomState();
    }
    pages.forEach(function (p, i) {
      resetPageEl(p);
      if (i === current) {
        p.classList.add("is-active");
      } else {
        p.style.visibility = "hidden";
      }
    });
    updateIndicator();
  }

  function nextPage() {
    if (animating || current >= images.length - 1) return;
    current++;
    applyStaticView();
  }

  function prevPage() {
    if (animating || current <= 0) return;
    current--;
    applyStaticView();
  }

  window.nextPage = nextPage;
  window.prevPage = prevPage;

  let suppressClick = false;
  // 依需求：不要點任何位置翻頁，只能用底部按鈕。

  document.addEventListener("keydown", function (e) {
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (zoomEnabled) {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        resetDesktopZoomState();
        return;
      }
    }
    if (animating) return;
    if (e.key === "ArrowRight") nextPage();
    if (e.key === "ArrowLeft") prevPage();
  });

  // 電腦端縮放：不顯示 UI，但保留 Ctrl+滾輪/拖曳平移。
  if (zoomEnabled) {
    book.addEventListener(
      "wheel",
      function (e) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      },
      { passive: false }
    );

    book.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".controls")) return;
      if (zoomScale <= 1.03) return;
      if (!e.target.closest(".page-zoom-wrap")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      panDrag = {
        pointerId: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        ox: panX,
        oy: panY,
      };
    });

    window.addEventListener("pointermove", function (e) {
      if (!panDrag || e.pointerId !== panDrag.pointerId) return;
      panX = panDrag.ox + (e.clientX - panDrag.sx);
      panY = panDrag.oy + (e.clientY - panDrag.sy);
      clampPan();
      applyZoomToCurrent();
    });

    window.addEventListener("pointerup", function (e) {
      if (!panDrag || e.pointerId !== panDrag.pointerId) return;
      panDrag = null;
    });

    window.addEventListener("pointercancel", function (e) {
      if (!panDrag || e.pointerId !== panDrag.pointerId) return;
      panDrag = null;
    });
  }

  applyStaticView();
})();
