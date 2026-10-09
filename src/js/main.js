(() => {
  document.documentElement.classList.add("js");
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header: Glas-Zustand beim Scrollen (bleibt immer sichtbar) ---------- */
  const hdr = $("[data-hdr]");
  const onScroll = () => hdr.classList.toggle("is-scrolled", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile-Menü ---------- */
  const burger = $("[data-burger]");
  const mnav = $("[data-mnav]");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", open);
    burger.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    mnav.setAttribute("aria-hidden", !open);
  };
  burger.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  $$("a", mnav).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));

  /* ---------- Aktiver Nav-Punkt ---------- */
  const navLinks = $$(".hdr__nav a");
    const navIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "/#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  // alle Sektionen beobachten, damit Abschnitte ohne Menüpunkt die Markierung entfernen
  $$("main > section").forEach((s) => navIO.observe(s));

  /* ---------- Reveal ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); revealIO.unobserve(en.target); }
    });
  }, { threshold: 0.15 });
  $$("[data-reveal]").forEach((el) => revealIO.observe(el));

  /* ---------- Zähler ---------- */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target, to = +el.dataset.count, dur = reduced ? 0 : 1800, t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, dur ? (t - t0) / dur : 1);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      countIO.unobserve(el);
    });
  }, { threshold: 0.6 });
  $$("[data-count]").forEach((el) => countIO.observe(el));

  /* ---------- Vorteile: gepinnte Sektion, Scrollweg schaltet Schritte um ---------- */
  const advPin = $("[data-adv-pin]");
  if (advPin) {
    const advImgs = $$("[data-adv-img]");
    const advNum = $("[data-adv-num]");
    const advSteps = $$("[data-adv-step]");
    const advDots = $$("[data-adv-go]");
    let advIdx = -1;
    const advSet = (i) => {
      if (i === advIdx) return;
      advIdx = i;
      advSteps.forEach((s, n) => s.classList.toggle("is-active", n === i));
      advImgs.forEach((img) => img.classList.toggle("is-active", +img.dataset.advImg === i));
      advDots.forEach((d, n) => d.classList.toggle("is-active", n === i));
      advNum.textContent = String(i + 1).padStart(2, "0");
    };
    const advRange = () => advPin.offsetHeight - innerHeight;
    const advTop = () => advPin.getBoundingClientRect().top + scrollY;
    const advUpdate = () => {
      const range = advRange();
      if (range <= 0) return advSet(0);
      const p = (scrollY - advTop()) / range;
      advSet(Math.max(0, Math.min(advSteps.length - 1, Math.floor(p * advSteps.length))));
    };
    addEventListener("scroll", advUpdate, { passive: true });
    addEventListener("resize", advUpdate);
    advUpdate();
    advDots.forEach((d, n) => d.addEventListener("click", () => {
      scrollTo({ top: advTop() + advRange() * (n + 0.5) / advSteps.length, behavior: "smooth" });
    }));
  }

  /* ---------- Sortiment-Slider ---------- */
  const stage = $("[data-sort]");
  if (stage) {
    const DURATION = 5000;
    const tabs = $$("[data-sort-tab]");
    const cur = $("[data-sort-cur]");
    const bar = $("[data-sort-progress]");
    let set = "gastro", idx = 0, timer, start, paused = false, elapsed = 0;

    const slides = () => $$(".sort__slide", $(`[data-sort-set="${set}"]`));
    const show = (i) => {
      const s = slides();
      idx = (i + s.length) % s.length;
      s.forEach((el, n) => el.classList.toggle("is-active", n === idx));
      cur.textContent = idx + 1;
      elapsed = 0; start = performance.now();
    };
    const switchSet = (name) => {
      set = name;
      tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.sortTab === name));
      $$("[data-sort-set]").forEach((tr) => tr.classList.toggle("is-active", tr.dataset.sortSet === name));
      show(0);
    };
    const loop = (t) => {
      if (!paused) {
        const p = (elapsed + t - start) / DURATION;
        bar.style.width = Math.min(100, p * 100) + "%";
        if (p >= 1) {
          // nach dem letzten Slide automatisch zum anderen Sortiment wechseln
          if (idx === slides().length - 1) switchSet(set === "gastro" ? "shop" : "gastro");
          else show(idx + 1);
        }
      }
      timer = requestAnimationFrame(loop);
    };
    tabs.forEach((t) => t.addEventListener("click", () => switchSet(t.dataset.sortTab)));
    $("[data-sort-next]").addEventListener("click", () => show(idx + 1));
    $("[data-sort-prev]").addEventListener("click", () => show(idx - 1));
    stage.addEventListener("mouseenter", () => { paused = true; elapsed += performance.now() - start; });
    stage.addEventListener("mouseleave", () => { paused = false; start = performance.now(); });

    // Swipe
    let x0 = null;
    stage.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) { e.preventDefault(); show(idx + (dx < 0 ? 1 : -1)); }
      x0 = null;
    });

    show(0);
    if (!reduced) timer = requestAnimationFrame(loop);
  }

  /* ---------- Logo-Band: Kopie für die Endlos-Schleife (statt doppelt im HTML) ---------- */
  $$("[data-marquee]").forEach((track) => {
    [...track.children].forEach((tile) => {
      const copy = tile.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      track.appendChild(copy);
    });
  });

  /* ---------- Bilder verzögert laden (schnellerer erster Seitenaufbau) ---------- */
  // Video-Vorschaubilder erst kurz bevor sie sichtbar werden
  const posterIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.poster = en.target.dataset.poster;
      posterIO.unobserve(en.target);
    });
  }, { rootMargin: "400px 0px" });
  $$("video[data-poster]").forEach((v) => posterIO.observe(v));
  // zweites Hero-Bild erst nach dem vollständigen Laden der Seite
  const loadDeferred = () => $$("[data-defer]").forEach((img) => {
    const src = img.parentElement.querySelector("source[data-srcset]");
    if (src) src.srcset = src.dataset.srcset;
    img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
  });
  if (document.readyState === "complete") setTimeout(loadDeferred, 1500);
  else addEventListener("load", () => setTimeout(loadDeferred, 1500));

  /* ---------- Videos: nur eins gleichzeitig ---------- */
  const players = [];
  const bindPlayer = (wrap) => {
    const v = $("video", wrap);
    const btn = $("button", wrap);
    players.push(v);
    const play = () => {
      players.forEach((o) => o !== v && o.pause());
      v.controls = true;
      v.play();
    };
    btn.addEventListener("click", play);
    v.addEventListener("play", () => wrap.classList.add("is-playing"));
    v.addEventListener("pause", () => wrap.classList.remove("is-playing"));
    v.addEventListener("ended", () => { wrap.classList.remove("is-playing"); v.controls = false; });
  };
  $$("[data-vplayer]").forEach(bindPlayer);
  $$("[data-reel]").forEach(bindPlayer);

  /* ---------- Accordion ---------- */
  $$("[data-acc] .acc").forEach((item, _, all) => {
    $(".acc__btn", item).addEventListener("click", () => {
      const open = !item.classList.contains("is-open");
      all.forEach((o) => { o.classList.remove("is-open"); $(".acc__btn", o).setAttribute("aria-expanded", "false"); });
      if (open) { item.classList.add("is-open"); $(".acc__btn", item).setAttribute("aria-expanded", "true"); }
    });
  });
})();
