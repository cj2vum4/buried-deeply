(function () {
  const el = document.getElementById("flipbook-data");
  if (!el) return;
  const images = JSON.parse(el.textContent);
  if (!Array.isArray(images) || images.length === 0) return;

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** 以粗指標／觸控為主裝置：啟用拖曳半翻 */
  const interactiveTouch =
    !reduceMotion &&
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches);

  const FLIP_MS = 580;
  const MAX_ANGLE = 92;
  /** 拖滿此距離（px）≈ 翻滿一頁；可中途停住 */
  function fullDragPx() {
    const w = book.offsetWidth || window.innerWidth;
    return Math.max(140, Math.min(window.innerWidth, w) * 0.48);
  }

  let current = 0;
  let animating = false;

  const book = document.getElementById("book");
  const indicator = document.getElementById("page-indicator");
  const pages = [];

  if (interactiveTouch) {
    book.classList.add("interactive-touch");
  }

  images.forEach(function (src) {
    const page = document.createElement("div");
    page.className = "page";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    page.appendChild(img);
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

  function finishAnim() {
    animating = false;
    applyStaticView();
  }

  function clearInlineFlipStyles(p) {
    if (!p) return;
    p.style.transition = "";
    p.style.transform = "";
    p.style.filter = "";
    p.style.boxShadow = "";
  }

  function nextPage() {
    if (animating || current >= images.length - 1) return;
    if (reduceMotion) {
      current++;
      applyStaticView();
      return;
    }

    animating = true;
    const oldIdx = current;
    const newIdx = current + 1;
    const oldPage = pages[oldIdx];
    const newPage = pages[newIdx];

    pages.forEach(resetPageEl);

    newPage.classList.add("below-next");
    oldPage.classList.add("is-active");

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        oldPage.classList.remove("is-active");
        oldPage.classList.add("flip-out-next");
      });
    });

    let done = false;
    function complete() {
      if (done) return;
      done = true;
      oldPage.removeEventListener("transitionend", onTransEnd);
      current = newIdx;
      finishAnim();
    }

    function onTransEnd(e) {
      if (e.propertyName !== "transform") return;
      complete();
    }

    oldPage.addEventListener("transitionend", onTransEnd);
    window.setTimeout(complete, FLIP_MS + 80);
  }

  function prevPage() {
    if (animating || current <= 0) return;
    if (reduceMotion) {
      current--;
      applyStaticView();
      return;
    }

    animating = true;
    const oldIdx = current;
    const newIdx = current - 1;
    const oldPage = pages[oldIdx];
    const newPage = pages[newIdx];

    pages.forEach(resetPageEl);

    newPage.style.transformOrigin = "right center";
    newPage.classList.add("below-prev");
    oldPage.classList.add("is-active");

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        oldPage.classList.remove("is-active");
        oldPage.classList.add("flip-out-prev");
      });
    });

    let done = false;
    function complete() {
      if (done) return;
      done = true;
      oldPage.removeEventListener("transitionend", onTransEnd);
      current = newIdx;
      newPage.style.transformOrigin = "";
      finishAnim();
    }

    function onTransEnd(e) {
      if (e.propertyName !== "transform") return;
      complete();
    }

    oldPage.addEventListener("transitionend", onTransEnd);
    window.setTimeout(complete, FLIP_MS + 80);
  }

  window.nextPage = nextPage;
  window.prevPage = prevPage;

  let suppressClick = false;

  document.addEventListener(
    "click",
    function (e) {
      if (suppressClick) return;
      if (animating) return;
      if (e.target.closest(".controls")) return;
      if (e.clientX > window.innerWidth / 2) {
        nextPage();
      } else {
        prevPage();
      }
    },
    false
  );

  document.addEventListener("keydown", function (e) {
    if (animating) return;
    if (e.key === "ArrowRight") nextPage();
    if (e.key === "ArrowLeft") prevPage();
  });

  /** 非觸控拖曳模式：保留滑一下翻頁 */
  if (!interactiveTouch && !reduceMotion) {
    let startX = 0;
    document.addEventListener("touchstart", function (e) {
      if (e.target.closest(".controls")) return;
      startX = e.touches[0].clientX;
    });
    document.addEventListener("touchend", function (e) {
      if (animating) return;
      if (e.target.closest(".controls")) return;
      const endX = e.changedTouches[0].clientX;
      if (endX - startX > 50) prevPage();
      if (startX - endX > 50) nextPage();
    });
  }

  /** 手機：拖曳跟隨，可半翻；放開後依進度／速度完成或彈回 */
  if (interactiveTouch && !reduceMotion) {
    const COMMIT_PROGRESS = 0.38;
    /** px/ms，超過視為甩頁完成翻頁 */
    const VELOCITY_COMMIT = 0.38;

    let dragActive = false;
    let pointerId = null;
    let startX = 0;
    let direction = null;
    let oldPage = null;
    let revealPage = null;
    let mode = null;

    let lastX = 0;
    let lastT = 0;

    function onPointerDown(e) {
      if (animating) return;
      if (e.target.closest(".controls")) return;
      if (e.target.closest("#page-indicator")) return;

      dragActive = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      direction = null;
      mode = null;
      oldPage = null;
      revealPage = null;
      lastX = startX;
      lastT = Date.now();

      book.setPointerCapture(e.pointerId);
    }

    function applyDragTransform(angleSigned) {
      const t = Math.min(1, Math.abs(angleSigned) / MAX_ANGLE);
      const bright = 1 - 0.1 * t;
      oldPage.classList.add("no-flip-transition");
      oldPage.style.transition = "none";
      oldPage.style.filter = "brightness(" + bright + ")";
      if (mode === "next") {
        oldPage.style.transformOrigin = "left center";
        oldPage.style.transform =
          "rotateY(" + -Math.abs(angleSigned) + "deg) translateZ(-4px)";
        oldPage.style.boxShadow = "-6px 0 18px rgba(0,0,0,0.3)";
      } else {
        oldPage.style.transformOrigin = "right center";
        oldPage.style.transform =
          "rotateY(" + Math.abs(angleSigned) + "deg) translateZ(-4px)";
        oldPage.style.boxShadow = "6px 0 18px rgba(0,0,0,0.3)";
      }
    }

    function endDrag(e) {
      if (!dragActive || e.pointerId !== pointerId) return;
      dragActive = false;
      try {
        book.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (!oldPage || !mode || direction === null) {
        dragActive = false;
        applyStaticView();
        return;
      }

      const pageEl = oldPage;
      const commitMode = mode;

      const dx = e.clientX - startX;
      const fd = fullDragPx();
      let progress = 0;
      if (mode === "next") {
        progress = Math.min(1, Math.abs(Math.min(0, dx)) / fd);
      } else {
        progress = Math.min(1, Math.max(0, dx) / fd);
      }

      const now = Date.now();
      const dt = Math.max(1, now - lastT);
      const vx = (e.clientX - lastX) / dt;

      let commit = false;
      if (commitMode === "next") {
        commit =
          progress >= COMMIT_PROGRESS ||
          vx < -VELOCITY_COMMIT ||
          (progress >= 0.22 && vx < -0.25);
      } else {
        commit =
          progress >= COMMIT_PROGRESS ||
          vx > VELOCITY_COMMIT ||
          (progress >= 0.22 && vx > 0.25);
      }

      animating = true;
      suppressClick = true;
      window.setTimeout(function () {
        suppressClick = false;
      }, 450);

      if (commit) {
        pageEl.classList.add("no-flip-transition");
        pageEl.style.transition =
          "transform 0.32s cubic-bezier(0.25, 0.85, 0.3, 1), filter 0.28s ease, box-shadow 0.28s ease";
        if (commitMode === "next") {
          pageEl.style.transform =
            "rotateY(-" + MAX_ANGLE + "deg) translateZ(-4px)";
          pageEl.style.filter = "brightness(0.92)";
        } else {
          pageEl.style.transform =
            "rotateY(" + MAX_ANGLE + "deg) translateZ(-4px)";
          pageEl.style.filter = "brightness(0.92)";
        }

        let settled = false;
        function settle() {
          if (settled) return;
          settled = true;
          pageEl.removeEventListener("transitionend", onSettle);
          if (commitMode === "next") {
            current = current + 1;
          } else {
            current = current - 1;
          }
          finishAnim();
        }

        function onSettle(ev) {
          if (ev.propertyName !== "transform") return;
          settle();
        }

        pageEl.addEventListener("transitionend", onSettle);
        window.setTimeout(settle, 420);
      } else {
        pageEl.classList.add("no-flip-transition");
        pageEl.style.transition =
          "transform 0.38s cubic-bezier(0.34, 1.3, 0.64, 1), filter 0.3s ease, box-shadow 0.3s ease";
        pageEl.style.transform = "rotateY(0deg) translateZ(0)";
        pageEl.style.filter = "";
        pageEl.style.boxShadow = "";

        let settled = false;
        function settleBack() {
          if (settled) return;
          settled = true;
          pageEl.removeEventListener("transitionend", onBack);
          finishAnim();
        }

        function onBack(ev) {
          if (ev.propertyName !== "transform") return;
          settleBack();
        }

        pageEl.addEventListener("transitionend", onBack);
        window.setTimeout(settleBack, 450);
      }

      pointerId = null;
      oldPage = null;
      revealPage = null;
      mode = null;
    }

    function onPointerMove(e) {
      if (!dragActive || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      lastX = e.clientX;
      lastT = Date.now();

      if (direction === null && Math.abs(dx) > 12) {
        direction = dx < 0 ? "next" : "prev";
        if (direction === "next" && current >= images.length - 1) {
          dragActive = false;
          try {
            book.releasePointerCapture(e.pointerId);
          } catch (err2) {}
          applyStaticView();
          return;
        }
        if (direction === "prev" && current <= 0) {
          dragActive = false;
          try {
            book.releasePointerCapture(e.pointerId);
          } catch (err3) {}
          applyStaticView();
          return;
        }

        mode = direction === "next" ? "next" : "prev";
        pages.forEach(resetPageEl);

        if (mode === "next") {
          oldPage = pages[current];
          revealPage = pages[current + 1];
          revealPage.classList.add("below-next");
        } else {
          oldPage = pages[current];
          revealPage = pages[current - 1];
          revealPage.style.transformOrigin = "right center";
          revealPage.classList.add("below-prev");
        }
        oldPage.classList.add("is-active");
        oldPage.style.zIndex = "3";
        revealPage.style.zIndex = "1";
      }

      if (!mode || !oldPage) return;

      const fd = fullDragPx();
      let ang = 0;
      if (mode === "next") {
        const p = Math.min(1, Math.abs(Math.min(0, dx)) / fd);
        ang = MAX_ANGLE * p;
        applyDragTransform(-ang);
      } else {
        const p = Math.min(1, Math.max(0, dx) / fd);
        ang = MAX_ANGLE * p;
        applyDragTransform(ang);
      }
    }

    function onPointerUp(e) {
      if (!dragActive || e.pointerId !== pointerId) return;
      endDrag(e);
    }

    function onPointerCancel(e) {
      if (!dragActive || e.pointerId !== pointerId) return;
      endDrag(e);
    }

    book.addEventListener("pointerdown", onPointerDown);
    book.addEventListener("pointermove", onPointerMove);
    book.addEventListener("pointerup", onPointerUp);
    book.addEventListener("pointercancel", onPointerCancel);
  }

  applyStaticView();
})();
