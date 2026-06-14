(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var result = {
      landscapeCards: [],
      portraitCards: [],
      nativeHeroCard: null,
      imageSamples: [],
    };

    // ── 1. Scan ALL images, classify by aspect ratio ──
    var allImgs = Array.from(doc.querySelectorAll('img'));
    var seen = new Set();
    for (var i = 0; i < allImgs.length; i++) {
      var img = allImgs[i];
      // skip our own cards
      if (img.closest('#deck-shelves-home-root')) continue;
      var r = img.getBoundingClientRect();
      if (r.width < 50 || r.height < 30) continue;
      var ratio = r.width / r.height;
      var src = img.src || img.currentSrc || '';
      var key = Math.round(r.width) + 'x' + Math.round(r.height);
      if (seen.has(key)) continue;
      seen.add(key);

      var entry = {
        w: Math.round(r.width), h: Math.round(r.height),
        ratio: Math.round(ratio * 1000) / 1000,
        src: src.slice(0, 120),
        cls: (img.className || '').slice(0, 80),
        parentCls: (img.parentElement ? (img.parentElement.className || '') : '').slice(0, 80),
      };

      if (ratio > 1.3) {
        // landscape
        result.landscapeCards.push(entry);
      } else if (ratio < 0.75) {
        // portrait
        if (result.portraitCards.length < 3) result.portraitCards.push(entry);
      }
    }

    // ── 2. Find native "hero" / wide card element (cursor:pointer, landscape) ──
    var wideEls = Array.from(doc.querySelectorAll('[class*="hero"], [class*="featured"], [class*="Highlight"], [class*="highlight"], [class*="Featured"]'));
    for (var j = 0; j < Math.min(wideEls.length, 8); j++) {
      var el = wideEls[j];
      if (el.closest('#deck-shelves-home-root')) continue;
      var er = el.getBoundingClientRect();
      if (er.width < 100 || er.height < 30) continue;
      if (result.nativeHeroCard === null) {
        result.nativeHeroCard = {
          tag: el.tagName,
          cls: (el.className || '').slice(0, 120),
          w: Math.round(er.width), h: Math.round(er.height),
          ratio: Math.round((er.width / er.height) * 1000) / 1000,
        };
      }
    }

    // ── 3. Sample image URLs from landscape images to identify Steam image types ──
    for (var k = 0; k < Math.min(result.landscapeCards.length, 6); k++) {
      var card = result.landscapeCards[k];
      var srcFull = '';
      // find the actual img with those dimensions
      for (var m = 0; m < allImgs.length; m++) {
        var ri = allImgs[m].getBoundingClientRect();
        if (Math.abs(ri.width - card.w) < 2 && Math.abs(ri.height - card.h) < 2) {
          srcFull = allImgs[m].src || allImgs[m].currentSrc || '';
          break;
        }
      }
      result.imageSamples.push({ w: card.w, h: card.h, src: srcFull.slice(0, 200) });
    }

    // sort landscape by width desc
    result.landscapeCards.sort(function(a,b){ return b.w - a.w; });

    return JSON.stringify(result, null, 2);
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack||'').slice(0,300) });
  }
})()
