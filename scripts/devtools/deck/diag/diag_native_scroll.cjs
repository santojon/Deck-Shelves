// Probe native Recent Games row scroll behavior and CSS snap properties.
// Run with a card focused in the Recent Games row for best results.
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;

    function getScrollProps(el, label) {
      var cs = w.getComputedStyle(el);
      return {
        label: label,
        cls: (el.className||'').substring(0,100),
        tag: el.tagName,
        // Scroll snap
        snapType: cs.scrollSnapType,
        snapAlign: cs.scrollSnapAlign,
        snapStop: cs.scrollSnapStop,
        snapMargin: cs.scrollMargin || cs.scrollMarginInline || '',
        // Scroll behavior
        scrollBehavior: cs.scrollBehavior,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        // Dimensions
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        scrollLeft: el.scrollLeft,
        // Padding / gap
        gap: cs.gap || cs.columnGap || '',
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
      };
    }

    var out = { rows: [], cards: [], nativeFocusedCard: null };

    // 1. Find all scrollable horizontal rows (likely Recent Games, etc.)
    var allEls = Array.from(d.querySelectorAll('[class]'));
    var rows = allEls.filter(function(el) {
      try {
        var cs = w.getComputedStyle(el);
        return cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      } catch(e) { return false; }
    });

    rows.forEach(function(el, i) {
      if (i < 6) out.rows.push(getScrollProps(el, 'row-' + i));
    });

    // 2. Find native card elements (WYgDg9NyCcMIVuMyZ_NBC) and their snap props
    var nativeCards = Array.from(d.querySelectorAll('.WYgDg9NyCcMIVuMyZ_NBC:not(.ds-card)'));
    nativeCards.slice(0, 3).forEach(function(el, i) {
      out.cards.push(getScrollProps(el, 'native-card-' + i));
    });

    // 3. Check the focused native card specifically
    var focused = d.querySelector('.WYgDg9NyCcMIVuMyZ_NBC.gpfocus:not(.ds-card), .WYgDg9NyCcMIVuMyZ_NBC:focus:not(.ds-card)');
    if (focused) {
      out.nativeFocusedCard = getScrollProps(focused, 'native-focused');
      // Also check its parent row
      var parent = focused.parentElement;
      while (parent && parent !== d.body) {
        try {
          var cs = w.getComputedStyle(parent);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
            out.nativeFocusedRow = getScrollProps(parent, 'native-focused-parent-row');
            break;
          }
        } catch(e) {}
        parent = parent.parentElement;
      }
    }

    // 4. Check our shelf row for comparison
    var dsRow = d.querySelector('.ds-row-scroll');
    if (dsRow) out.dsRow = getScrollProps(dsRow, 'ds-row-scroll');
    var dsCard = d.querySelector('.ds-card');
    if (dsCard) out.dsCard = getScrollProps(dsCard, 'ds-card');

    // 5. Scan stylesheets for any rules targeting native card snap behavior
    var snapRules = [];
    Array.from(d.styleSheets).forEach(function(sheet) {
      try {
        Array.from(sheet.cssRules||[]).forEach(function(rule) {
          var text = rule.cssText || '';
          if (text.indexOf('scroll-snap') !== -1 || text.indexOf('scroll-behavior') !== -1) {
            // Only include rules that might target a row or card
            if (text.indexOf('WYgDg9') !== -1 || text.indexOf('appportrait') !== -1 ||
                text.indexOf('ReactVirtualized') !== -1 || text.indexOf('scroll-snap') !== -1) {
              snapRules.push(text.substring(0, 300));
            }
          }
        });
      } catch(e) {}
    });
    out.snapCssRules = snapRules.slice(0, 10);

    return JSON.stringify(out, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0,300) });
  }
})()
