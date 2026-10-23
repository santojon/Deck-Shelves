/* Deck Shelves site — lightweight client-side i18n.
   No build step: english lives directly in the HTML as the fallback, and
   translations are plain key->string dictionaries applied over `[data-i18n]`
   (text) / `[data-i18n-attr]` (attributes, "attr:key;attr2:key2") elements.
   Build-time dynamic content (release notes, the features list) is rendered
   in both languages by build_site.py and tagged `[data-lang-variant]` —
   applyLangVariants() below shows only the matching set per DOM parent,
   falling back to the "en" set when a pt-BR sibling wasn't generated (e.g.
   the translation hasn't caught up to the latest release yet). Live stats
   numbers stay untagged — plain numbers don't need translation. */
(function () {
  "use strict";

  var STORAGE_KEY = "ds-site-lang";
  var DEFAULT_LANG = "en";
  var SUPPORTED = ["en", "pt-BR"];
  var LANG_LABELS = { en: "EN", "pt-BR": "PT" };

  var DICTS = { "pt-BR": window.__DS_I18N_PT_BR__ || {} };

  function detectLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) { /* localStorage unavailable — fall through to detection */ }
    var nav = (navigator.language || "").toLowerCase();
    if (nav.indexOf("pt") === 0) return "pt-BR";
    return DEFAULT_LANG;
  }

  function applyTextNodes(dict) {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var text = dict[nodes[i].getAttribute("data-i18n")];
      if (text !== undefined) nodes[i].textContent = text;
    }
  }

  // Same idea as data-i18n, but for the handful of strings that embed a link
  // or bold span (e.g. "Deck Shelves runs on <a>Decky Loader</a>...") — the
  // dictionary value carries the same markup back in translation.
  function applyHtmlNodes(dict) {
    var nodes = document.querySelectorAll("[data-i18n-html]");
    for (var i = 0; i < nodes.length; i++) {
      var html = dict[nodes[i].getAttribute("data-i18n-html")];
      if (html !== undefined) nodes[i].innerHTML = html;
    }
  }

  function applyOnePair(el, pair, dict) {
    var parts = pair.split(":");
    if (parts.length !== 2) return;
    var text = dict[parts[1].trim()];
    if (text !== undefined) el.setAttribute(parts[0].trim(), text);
  }

  function applyAttrNodes(dict) {
    var nodes = document.querySelectorAll("[data-i18n-attr]");
    for (var i = 0; i < nodes.length; i++) {
      var pairs = nodes[i].getAttribute("data-i18n-attr").split(";");
      for (var j = 0; j < pairs.length; j++) applyOnePair(nodes[i], pairs[j], dict);
    }
  }

  // Build-time dual-language blocks: every [data-lang-variant] element is
  // grouped by its DOM parent (so a release-notes <ul> and a features <ul>
  // group independently), then within each group the set matching `lang` is
  // shown and every other set is hidden — falling back to "en" when no
  // element in that group matches `lang` (translation not generated yet).
  function applyLangVariants(lang) {
    var variants = document.querySelectorAll("[data-lang-variant]");
    var parents = [];
    for (var i = 0; i < variants.length; i++) {
      if (parents.indexOf(variants[i].parentElement) === -1) parents.push(variants[i].parentElement);
    }
    for (var p = 0; p < parents.length; p++) {
      var children = [];
      for (var c = 0; c < parents[p].children.length; c++) {
        if (parents[p].children[c].hasAttribute("data-lang-variant")) children.push(parents[p].children[c]);
      }
      var hasMatch = false;
      for (var m = 0; m < children.length; m++) {
        if (children[m].getAttribute("data-lang-variant") === lang) { hasMatch = true; break; }
      }
      var showLang = hasMatch ? lang : "en";
      for (var n = 0; n < children.length; n++) {
        children[n].hidden = children[n].getAttribute("data-lang-variant") !== showLang;
      }
    }
  }

  function syncSwitcher(lang) {
    var btns = document.querySelectorAll(".lang-switch [data-lang]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-lang") === lang ? "true" : "false");
    }
  }

  // English lives only in the page itself: keep it before the first switch, so
  // going back to EN restores it without a reload.
  function collectEnglish() {
    var en = {};
    var text = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < text.length; i++) en[text[i].getAttribute("data-i18n")] = text[i].textContent;
    var html = document.querySelectorAll("[data-i18n-html]");
    for (var j = 0; j < html.length; j++) en[html[j].getAttribute("data-i18n-html")] = html[j].innerHTML;
    var attrs = document.querySelectorAll("[data-i18n-attr]");
    for (var k = 0; k < attrs.length; k++) {
      var pairs = attrs[k].getAttribute("data-i18n-attr").split(";");
      for (var p = 0; p < pairs.length; p++) {
        var parts = pairs[p].split(":");
        var value = parts.length === 2 ? attrs[k].getAttribute(parts[0].trim()) : null;
        if (value !== null) en[parts[1].trim()] = value;
      }
    }
    return en;
  }

  function applyLang(lang) {
    if (!DICTS.en) DICTS.en = collectEnglish();
    var dict = DICTS[lang] || {};
    document.documentElement.setAttribute("lang", lang);
    applyTextNodes(dict);
    applyHtmlNodes(dict);
    applyAttrNodes(dict);
    applyLangVariants(lang);
    syncSwitcher(lang);
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* best-effort */ }
    applyLang(lang);
  }

  // A small fixed pill (EN / PT), self-mounted at the top of <body> — no
  // markup needed on the page itself, so every page that loads this script
  // gets the switcher for free, consistently positioned.
  function buildSwitcher() {
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language");
    for (var i = 0; i < SUPPORTED.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-lang", SUPPORTED[i]);
      btn.setAttribute("aria-pressed", SUPPORTED[i] === DEFAULT_LANG ? "true" : "false");
      btn.textContent = LANG_LABELS[SUPPORTED[i]] || SUPPORTED[i];
      wrap.appendChild(btn);
    }
    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-lang]") : null;
      if (btn) setLang(btn.getAttribute("data-lang"));
    });
    document.body.insertBefore(wrap, document.body.firstChild);
    keepBelowHeader(wrap);
  }

  // The header wraps to two or three lines on narrow screens; a fixed top
  // value then put the pill over its links. Follow the header's real height.
  function keepBelowHeader(wrap) {
    var header = document.querySelector("header");
    if (!header) return;
    var place = function () { wrap.style.top = Math.round(header.getBoundingClientRect().height + 12) + "px"; };
    place();
    if (window.ResizeObserver) new ResizeObserver(place).observe(header);
    else window.addEventListener("resize", place);
  }

  var lang = detectLang();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { buildSwitcher(); applyLang(lang); });
  } else {
    buildSwitcher();
    applyLang(lang);
  }
})();
