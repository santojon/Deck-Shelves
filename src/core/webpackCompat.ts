export function findWebpackHashedClass(doc: Document): string | null {
  try {
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
    for (const el of els) {
      try {
        const cs = getComputedStyle(el);
        const oy = ((el.style && (el.style as any).overflowY) || (cs && cs.overflowY) || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) {
          for (const cls of Array.from(el.classList)) {
            if (cls && cls.startsWith('_') && cls.length > 5) return cls;
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

export function buildSelectorFromToken(token: string | null): string | null {
  if (!token) return null;
  return `.${token.replace(/\s+/g, '.')}`;
}

export function getRuntimeClassMap(doc: Document): Record<string, string> | null {
  try {
    const w = (doc as any).defaultView as Window | undefined;
    if (w && (w as any).__DS_CLASS_MAP) return (w as any).__DS_CLASS_MAP as Record<string, string>;
    try {
      const raw = w && w.localStorage ? w.localStorage.getItem('ds_class_map') : null;
      if (raw) return JSON.parse(raw) as Record<string, string>;
    } catch {}
  } catch {}
  return null;
}

export function setRuntimeClassMap(doc: Document, map: Record<string, string>) {
  try {
    const w = (doc as any).defaultView as Window | undefined;
    if (w) {
      try { (w as any).__DS_CLASS_MAP = map; } catch {}
      try { w.localStorage && w.localStorage.setItem('ds_class_map', JSON.stringify(map)); } catch {}
    }
  } catch {}
}

export function discoverClassMap(doc: Document): Record<string, string> | null {
  try {
    // Prefer explicit scrollable candidates with obfuscated classes
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
    // 1) look for overflow scroll containers
    for (const el of els) {
      try {
        const cs = getComputedStyle(el);
        const oy = (cs.overflowY || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) {
          for (const cls of Array.from(el.classList)) {
            if (cls && cls.startsWith('_') && cls.length > 4) {
              return { viewport: cls };
            }
          }
        }
      } catch {}
    }

    // 2) fallback: scan ancestor chain of body/mount for obfuscated tokens
    try {
      const candidates: string[] = [];
      const rootCandidates = [doc.getElementById('deck-shelves-home-root'), doc.body, doc.documentElement];
      for (const rc of rootCandidates) {
        if (!rc) continue;
        let cur: Element | null = rc;
        let depth = 0;
        while (cur && depth++ < 40) {
          try {
            const cls = (cur.className || '').toString();
            if (cls) {
              for (const token of cls.split(/\s+/)) {
                if (token && token.startsWith('_') && token.length > 4) candidates.push(token);
              }
            }
          } catch {}
          cur = cur.parentElement;
        }
      }
      if (candidates.length) {
        // pick the most frequent token
        const freq: Record<string, number> = {};
        for (const c of candidates) freq[c] = (freq[c] || 0) + 1;
        const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
        const viewportToken = sorted[0];
        // try to detect row/card tokens near the viewport
        try {
          const viewportEl = doc.querySelector(buildSelectorFromToken(viewportToken) || '') as HTMLElement | null;
          if (viewportEl) {
            // find a child that looks like a row: many children and sizable width/height
            const childCandidates = Array.from(viewportEl.children).filter((c) => c instanceof HTMLElement) as HTMLElement[];
            for (const ch of childCandidates) {
              try {
                if (ch.children.length >= 4) {
                  const cls = (ch.className || '').toString();
                  for (const token of cls.split(/\s+/)) {
                    if (token && token.startsWith('_') && token.length > 4) {
                      const rowToken = token;
                      // attempt to find a card token inside this row
                      let cardToken: string | undefined;
                      const grand = Array.from(ch.querySelectorAll('*')) as HTMLElement[];
                      for (const g of grand) {
                        try {
                          const gcls = (g.className || '').toString();
                          for (const t of gcls.split(/\s+/)) {
                            if (t && t.startsWith('_') && t.length > 4) { cardToken = t; break; }
                          }
                        } catch {}
                        if (cardToken) break;
                      }
                      const out: Record<string,string> = { viewport: viewportToken };
                      if (rowToken) out.row = rowToken;
                      if (cardToken) out.card = cardToken;
                      return out;
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
        return { viewport: viewportToken };
      }
    } catch {}

    // 3) Broad token aggregation fallback: gather tokens and score by element metrics
    try {
      const tokenMap: Record<string, HTMLElement[]> = {};
      const all = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
      for (const el of all) {
        try {
          const cls = (el.className || '').toString();
          if (!cls) continue;
          for (const t of cls.split(/\s+/)) {
            if (!t || !t.startsWith('_')) continue;
            tokenMap[t] = tokenMap[t] || [];
            tokenMap[t].push(el);
          }
        } catch {}
      }
      if (Object.keys(tokenMap).length) {
        // prefer token used on an element that is scrollable -> viewport
        for (const [t, els] of Object.entries(tokenMap)) {
          for (const el of els) {
            try {
              const ch = el.children.length;
              const sh = (el.scrollHeight || 0);
              const chh = (el.clientHeight || 0);
              if ((el.style && (el.style as any).overflowY === 'auto') || (sh > chh && chh > 80)) {
                const out: Record<string,string> = { viewport: t };
                try {
                  const viewportEl = el;
                  const childEls = Array.from(viewportEl.children).filter(c=> c instanceof HTMLElement) as HTMLElement[];
                  for (const ch of childEls) {
                    try {
                      const cls = (ch.className||'').toString();
                      const rowTok = cls.split(/\s+/).find(x=>x.startsWith('_'));
                      if (rowTok) {
                        out.row = rowTok;
                        // try find a card token inside this row
                        const grand = Array.from(ch.querySelectorAll<HTMLElement>('*'));
                        for (const g of grand) {
                          try {
                            const gcls = (g.className||'').toString();
                            const ctok = gcls.split(/\s+/).find(x=>x.startsWith('_'));
                            if (ctok) { out.card = ctok; break; }
                          } catch {}
                        }
                        break;
                      }
                    } catch {}
                  }
                } catch {}
                return out;
              }
            } catch {}
          }
        }
        // fallback: return most frequent token as viewport
        const sorted = Object.keys(tokenMap).sort((a,b)=> tokenMap[b].length - tokenMap[a].length);
        return { viewport: sorted[0] };
      }
    } catch {}
    return null;
  } catch {
    return null;
  }
}
