/* =============================================================
   REVOLUTIONBANK — comportamento
   Simulador de cotação, tema, menu, LGPD, validação, revelação.
   Vanilla JS. Sem dependências. Falha de forma silenciosa.
   ============================================================= */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- configuração de negócio ---------- */
  var CFG = {
    // Tarifa real: preencha. null → mostra "a definir" e não inventa número.
    feePct: null,               // ex.: 0.008
    feeLabel: null,             // ex.: "0,8%"
    refUsdBrl: null,            // referência do dólar se a API falhar
    usdtOverUsd: 0.004,         // prêmio ilustrativo USDT/dólar no fallback
    validitySec: 30,
    minBrl: 500,
    maxBrl: 100000 * 5.45
  };

  var state = { mode: "brl", base: 0, live: false, countdown: CFG.validitySec };

  /* ---------- formatação pt-BR ---------- */
  function brl(n) {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function usdt(n) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT";
  }
  function rate(n) {
    return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  function parseAmount(v) {
    if (!v) return 0;
    var s = String(v).replace(/[^\d.,]/g, "");
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function fmtAmount(n) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------- menu ---------- */
  function initNav() {
    var btn = $("navBtn"), nav = $("nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- compartilhar/copiar link ---------- */
  function initShare() {
    var btn = $("shareBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var url = window.location.href;
      var flash = function () {
        var old = btn.getAttribute("aria-label");
        btn.setAttribute("aria-label", "Link copiado");
        btn.style.color = "var(--mint)";
        setTimeout(function () {
          btn.setAttribute("aria-label", old);
          btn.style.color = "";
        }, 1600);
      };
      if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(flash, flash); return; }
      var t = document.createElement("textarea");
      t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); flash(); } catch (e) {}
      document.body.removeChild(t);
    });
  }

  /* ---------- simulador ---------- */
  function compute() {
    var el = $("valor");
    if (!el) return;

    var raw = parseAmount(el.value);
    var finalRate = state.base > 0 ? state.base * (1 + (CFG.feePct || 0)) : 0;
    var brlAmount, usdtAmount;

    if (state.mode === "brl") {
      brlAmount = raw;
      usdtAmount = finalRate > 0 ? brlAmount / finalRate : 0;
    } else {
      usdtAmount = raw;
      brlAmount = usdtAmount * finalRate;
    }

    $("rBase").textContent = state.base > 0 ? rate(state.base) : "—";
    $("rFee").textContent = CFG.feeLabel || "a definir";
    $("rFinal").textContent = finalRate > 0 ? rate(finalRate) : "—";
    $("rNet").textContent = "incluída";
    var hint = $("feeHint");
    if (hint) hint.textContent = CFG.feeLabel ? "tarifa " + CFG.feeLabel : "tarifa a definir";

    if (state.mode === "brl") {
      $("outLabel").textContent = "Fornecedor recebe";
      $("outValue").textContent = usdtAmount > 0 ? usdt(usdtAmount) : "—";
    } else {
      $("outLabel").textContent = "Você paga, em reais";
      $("outValue").textContent = brlAmount > 0 ? brl(brlAmount) : "—";
    }

    var notice = $("limitNotice"), go = $("simGo");
    var warn = "";
    if (brlAmount > 0 && brlAmount < CFG.minBrl) warn = "Valor mínimo de " + brl(CFG.minBrl) + " por operação.";
    else if (brlAmount > CFG.maxBrl) warn = "Acima do limite por operação (≈ US$ 100 mil). Fale com um especialista para analisar o caso.";

    if (notice) {
      if (warn) { notice.textContent = warn; notice.hidden = false; } else { notice.hidden = true; }
    }
    if (go) {
      if (warn) go.setAttribute("disabled", "disabled");
      else go.removeAttribute("disabled");
    }
  }

  function setBase(v, live) {
    state.base = v || 0;
    state.live = !!live;
    var tag = $("liveTag");
    if (tag) {
      tag.classList.toggle("offline", !live);
      var label = tag.querySelector("span");
      if (label) label.textContent = live ? "mercado" : "indisponível";
    }
    compute();
  }

  function loadRate() {
    var fallback = (CFG.refUsdBrl || 5.45) * (1 + CFG.usdtOverUsd);
    var done = false;
    function finish(v, live) { if (done) return; done = true; setBase(v, live); }
    setTimeout(function () { finish(fallback, false); }, 4000);

    try {
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=brl", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (j) {
          var v = j && j.tether && j.tether.brl;
          if (v && v > 1) finish(v, true); else throw new Error("sem preço");
        })
        .catch(function () { finish(fallback, false); });
    } catch (e) { finish(fallback, false); }
  }

  function tick() {
    state.countdown -= 1;
    if (state.countdown <= 0) state.countdown = CFG.validitySec;
    var t = $("validityText"), bar = $("validityBar");
    if (t) t.textContent = state.countdown + "s";
    if (bar) bar.style.width = (state.countdown / CFG.validitySec * 100) + "%";
    var st = $("stamp");
    if (st) st.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function initSim() {
    var el = $("valor");
    if (!el) return;

    el.addEventListener("input", compute);
    el.addEventListener("blur", function () {
      var v = parseAmount(el.value);
      if (v > 0) el.value = fmtAmount(v);
      compute();
    });

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.modes [role="tab"]'));
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.setAttribute("aria-selected", "false"); t.tabIndex = -1; });
        tab.setAttribute("aria-selected", "true");
        tab.tabIndex = 0;
        state.mode = tab.dataset.mode;
        var isBrl = state.mode === "brl";
        $("curTag").textContent = isBrl ? "BRL" : "USDT";
        $("valorLabel").textContent = isBrl ? "Você envia, em reais" : "O fornecedor precisa receber";
        el.value = isBrl ? "50.000,00" : "10.000,00";
        document.querySelectorAll(".presets button").forEach(function (b) {
          var base = parseInt(b.dataset.base || b.dataset.v, 10);
          if (!b.dataset.base) b.dataset.base = base;
          if (isBrl) { b.dataset.v = base; b.textContent = (base / 1000) + " mil"; }
          else { b.dataset.v = Math.round(base / 5.45); b.textContent = (base / 5000) + " mil"; }
        });
        compute();
      });
      tab.addEventListener("keydown", function (e) {
        var i = tabs.indexOf(tab), n = null;
        if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (n) { e.preventDefault(); n.focus(); n.click(); }
      });
    });

    document.querySelectorAll(".presets button").forEach(function (b) {
      b.addEventListener("click", function () {
        el.value = fmtAmount(parseFloat(b.dataset.v));
        compute();
      });
    });

    var go = $("simGo");
    if (go) {
      go.addEventListener("click", function () {
        var m = $("msg");
        if (m && !m.value) {
          m.value = "Simulei " + el.value + " " + (state.mode === "brl" ? "BRL" : "USDT") +
            " com a cotação de " + $("rBase").textContent + ".";
        }
        var target = $("contato");
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          var nome = $("nome");
          if (nome) setTimeout(function () { nome.focus({ preventScroll: true }); }, 420);
        }
      });
    }

    setBase((CFG.refUsdBrl || 5.45) * (1 + CFG.usdtOverUsd), false);
    loadRate();
    setInterval(tick, 1000);
    setInterval(loadRate, 60000);
    tick();
  }

  /* ---------- formulário ---------- */
  function initForm() {
    var form = $("leadForm");
    if (!form) return;
    var rules = {
      nome: function (v) { return v.trim().length >= 2; },
      whats: function (v) { return v.replace(/\D/g, "").length >= 10; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }
    };
    function validate(f) {
      var ok = rules[f.id] ? rules[f.id](f.value) : true;
      f.classList.toggle("err", !ok);
      f.setAttribute("aria-invalid", ok ? "false" : "true");
      return ok;
    }
    Object.keys(rules).forEach(function (id) {
      var f = $(id);
      if (f) f.addEventListener("blur", function () { validate(f); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true, first = null;
      Object.keys(rules).forEach(function (id) {
        var f = $(id);
        if (!f) return;
        if (!validate(f)) { ok = false; if (!first) first = f; }
      });
      if (!ok) { if (first) first.focus(); return; }
      var sent = $("sent");
      if (sent) sent.hidden = false;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.setAttribute("disabled", "disabled"); btn.textContent = "Enviado"; }
    });
  }

  /* ---------- LGPD ---------- */
  function initConsent() {
    var box = $("consent");
    if (!box) return;
    var saved = null;
    try { saved = localStorage.getItem("revolutionbank-consent"); } catch (e) {}
    if (saved) return;
    box.hidden = false;
    function choose(v) {
      try { localStorage.setItem("revolutionbank-consent", v); } catch (e) {}
      box.hidden = true;
    }
    var y = $("consentYes"), n = $("consentNo");
    if (y) y.addEventListener("click", function () { choose("all"); });
    if (n) n.addEventListener("click", function () { choose("essential"); });
  }

  /* ---------- CTA fixo mobile ---------- */
  function initMobileCta() {
    var cta = $("mobileCta");
    if (!cta) return;
    var hero = document.querySelector(".opening");
    if (!hero || !("IntersectionObserver" in window)) { cta.classList.add("show"); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { cta.classList.toggle("show", !en.isIntersecting); });
    }, { threshold: 0.1 });
    io.observe(hero);
  }

  /* ---------- revelação ao rolar ---------- */
  function initReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (!els.length) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var delay = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
        setTimeout(function () { el.classList.add("in"); }, delay);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- boot ---------- */
  function boot() {
    initNav();
    initShare();
    initSim();
    initForm();
    initConsent();
    initMobileCta();
    initReveal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
