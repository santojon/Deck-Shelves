/* Deck Shelves site — lightweight client-side i18n.
   No build step: english lives directly in the HTML as the fallback, and
   translations are plain key->string dictionaries applied over `[data-i18n]`
   (text) / `[data-i18n-attr]` (attributes, "attr:key;attr2:key2") elements.
   Dynamic content (release notes, live stats numbers) is never tagged, so it
   always stays in its source language regardless of the selected site language. */
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
  // or bold span (e.g. "The easiest way is <a>ShelvesHub</a>...") — the
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

  function syncSwitcher(lang) {
    var btns = document.querySelectorAll(".lang-switch [data-lang]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-lang") === lang ? "true" : "false");
    }
  }

  function applyLang(lang) {
    var dict = DICTS[lang] || {};
    document.documentElement.setAttribute("lang", lang);
    applyTextNodes(dict);
    applyHtmlNodes(dict);
    applyAttrNodes(dict);
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
  }

  var lang = detectLang();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { buildSwitcher(); applyLang(lang); });
  } else {
    buildSwitcher();
    applyLang(lang);
  }
})();
