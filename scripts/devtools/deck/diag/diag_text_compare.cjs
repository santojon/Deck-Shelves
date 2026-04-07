// Compare text properties + focus visuals between native cards and our cards
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;
    var cs = function(el) { return el ? w.getComputedStyle(el) : null; };
    var root = d.getElementById("deck-shelves-home-root");

    // ── Native focused card and its text elements ──
    var nativeFocused = null;
    var allGp = d.querySelectorAll(".WYgDg9NyCcMIVuMyZ_NBC.gpfocus");
    for (var i = 0; i < allGp.length; i++) {
      if (!root || !root.contains(allGp[i])) { nativeFocused = allGp[i]; break; }
    }

    var nativeFocusProps = null;
    if (nativeFocused) {
      var s = cs(nativeFocused);
      nativeFocusProps = {
        outline: s.outline,
        outlineOffset: s.outlineOffset,
        boxShadow: (s.boxShadow || 'none').substring(0, 100),
        border: s.border,
        filter: s.filter,
        transform: s.transform !== 'none' ? s.transform.substring(0, 60) : 'none',
      };
    }

    // ── Native card game title text (below the card art in Recent Games) ──
    // Look for text elements near native cards
    var nativeTextProps = null;
    try {
      // Find a native card's title text — look for elements near the focused card
      var nativeCard = nativeFocused || d.querySelector('.WYgDg9NyCcMIVuMyZ_NBC');
      if (nativeCard) {
        // Try finding text siblings/children near the card
        var textCandidates = nativeCard.querySelectorAll('div, span');
        for (var j = 0; j < textCandidates.length; j++) {
          var tc = textCandidates[j];
          var tcs = cs(tc);
          var fs = parseFloat(tcs.fontSize);
          if (fs >= 14 && fs <= 24 && tc.textContent && tc.textContent.trim().length > 2 && tc.textContent.trim().length < 50) {
            nativeTextProps = {
              text: tc.textContent.trim().substring(0, 30),
              color: tcs.color,
              fontSize: tcs.fontSize,
              fontWeight: tcs.fontWeight,
              fontFamily: (tcs.fontFamily || '').substring(0, 50),
              lineHeight: tcs.lineHeight,
              letterSpacing: tcs.letterSpacing,
              textAlign: tcs.textAlign,
              whiteSpace: tcs.whiteSpace,
              textTransform: tcs.textTransform,
            };
            break;
          }
        }
      }
    } catch(e) {}

    // ── Our focused card ──
    var ourFocused = root ? root.querySelector('.ds-card.gpfocus') : null;
    var ourFocusProps = null;
    if (ourFocused) {
      var os = cs(ourFocused);
      ourFocusProps = {
        outline: os.outline,
        outlineOffset: os.outlineOffset,
        boxShadow: (os.boxShadow || 'none').substring(0, 100),
        border: os.border,
        filter: os.filter,
        transform: os.transform !== 'none' ? os.transform.substring(0, 60) : 'none',
      };
      // Check ::after pseudo-element (common source of focus glow)
      try {
        var afterS = w.getComputedStyle(ourFocused, '::after');
        ourFocusProps.afterDisplay = afterS.display;
        ourFocusProps.afterContent = afterS.content;
        ourFocusProps.afterBoxShadow = (afterS.boxShadow || 'none').substring(0, 100);
        ourFocusProps.afterBorder = afterS.border;
        ourFocusProps.afterBorderRadius = afterS.borderRadius;
        ourFocusProps.afterInset = afterS.inset;
      } catch(e) {}
    }

    // ── Our card text properties ──
    var ourTitle = root ? root.querySelector('.ds-shelf-title') : null;
    var ourLabelName = root ? root.querySelector('.ds-card-label-name') : null;
    var ourStatus = root ? root.querySelector('.ds-card-status') : null;

    function textProps(el) {
      if (!el) return null;
      var s = cs(el);
      return {
        text: (el.textContent || '').trim().substring(0, 30),
        color: s.color,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontFamily: (s.fontFamily || '').substring(0, 50),
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textAlign: s.textAlign,
        textTransform: s.textTransform,
        paddingLeft: s.paddingLeft,
        marginLeft: s.marginLeft,
      };
    }

    // ── Icon data: check what icons are actually rendered for first few cards ──
    var iconData = [];
    if (root) {
      var cards = root.querySelectorAll('.ds-card[data-appid]');
      for (var k = 0; k < Math.min(cards.length, 6); k++) {
        var card = cards[k];
        var appid = card.getAttribute('data-appid');
        var statusEl = card.querySelector('.ds-card-status');
        var iconEl = statusEl ? statusEl.querySelector('.ds-card-status-icon') : null;
        var svgEl = iconEl ? iconEl.querySelector('svg') : null;
        var statusText = statusEl ? (statusEl.textContent || '').trim().substring(0, 30) : null;
        var hasPlayClass = iconEl ? iconEl.classList.contains('ds-card-status-play') : false;
        var svgViewBox = svgEl ? svgEl.getAttribute('viewBox') : null;
        var iconColor = iconEl ? cs(iconEl).color : null;

        iconData.push({
          appid: appid,
          statusText: statusText,
          hasPlayClass: hasPlayClass,
          svgViewBox: svgViewBox,
          iconColor: iconColor,
        });
      }
    }

    // ── Check actual installed/updatePending from Steam API ──
    var appDataCheck = [];
    try {
      var appStore = w.appStore || w.AppStore;
      if (root) {
        var checkCards = root.querySelectorAll('.ds-card[data-appid]');
        for (var m = 0; m < Math.min(checkCards.length, 6); m++) {
          var aid = Number(checkCards[m].getAttribute('data-appid'));
          if (!aid) continue;
          var ov = null;
          try { ov = appStore && appStore.GetAppOverviewByAppID(aid); } catch(e) {}
          appDataCheck.push({
            appid: aid,
            installed: ov ? ov.installed : null,
            update_pending: ov ? ov.update_pending : null,
            display_status: ov && ov.per_client_data ? ov.per_client_data.display_status : null,
          });
        }
      }
    } catch(e) {}

    return JSON.stringify({
      nativeFocus: nativeFocusProps,
      nativeText: nativeTextProps,
      ourFocus: ourFocusProps,
      ourTitle: textProps(ourTitle),
      ourLabelName: textProps(ourLabelName),
      ourStatus: textProps(ourStatus),
      iconData: iconData,
      appDataCheck: appDataCheck,
      headingColorVar: d.documentElement.style.getPropertyValue('--ds-native-heading-color') || null,
    });
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0,300) });
  }
})()
