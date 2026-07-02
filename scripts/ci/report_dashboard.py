#!/usr/bin/env python3
"""Dashboard renderer for the CI report.

Holds the static SHELL + the giant client-side JS that drives the
multi-scope dashboard. Split from report.py to keep both files under the
per-file code-line cap. Imported back lazily from report.py."""
import json
import os
import sys
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from report import (  # type: ignore[import-not-found]
    _collect_all_runs,
    _DASH_CSS,
    _report_nav,
    _site_footer,
)
_DASH_JS = r"""
(function(){
  const SCOPES=['local','ci','release'];
  const PASS='#4ade80',FAIL='#f87171',SKIP='#94a3b8';
  const $=id=>document.getElementById(id);
  let runs=Array.isArray(window.__BAKED_RUNS__)?window.__BAKED_RUNS__:[];
  let currentScope='all', currentDeck='all', currentStress='all';

  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function scopeOf(r){return r._scope||r.scope||''}
  function hasDeck(r){return scopeOf(r)==='local'}
  function hasStress(r){return !!r.stress}
  function filterRuns(rs,sc,dk,st){
    return rs.filter(r=>
      (sc==='all'||scopeOf(r)===sc) &&
      (dk==='all'||(dk==='yes'?hasDeck(r):!hasDeck(r))) &&
      (st==='all'||(st==='yes'?hasStress(r):!hasStress(r)))
    );
  }
  function sortRuns(rs){return rs.slice().sort((a,b)=>String(a.ts||'').localeCompare(String(b.ts||'')))}
  function dedupe(rs){const m=new Map();for(const r of rs){const k=(r.ts||'')+'|'+scopeOf(r);if(!m.has(k))m.set(k,r);}return Array.from(m.values())}

  function pills(rs){
    // Counts ALWAYS reflect the full runs array (not the current filter
    // view) so the pills never vanish when a filter combination ends up
    // empty — the user must be able to click the active pill again to
    // reverse out of a zero-result state. The active styling still tracks
    // currentDeck / currentStress so the UI shows what's selected.
    const total=rs.length;
    const withDeck=rs.filter(r=>scopeOf(r)==='local').length;
    const stress=rs.filter(r=>r.stress).length;
    // The pills double as filter toggles. `axis` (deck|stress) and `value`
    // (yes|no) map to currentDeck/currentStress; clicking re-runs render()
    // with the new filter (toggle off if already active). Visual state =
    // a brighter background + thicker border when active.
    const items=[
      ['with Deck',   withDeck,        '#60a5fa','deck',  'yes'],
      ['without Deck',total-withDeck,  '#818cf8','deck',  'no'],
      ['with stress', stress,          '#f59e0b','stress','yes'],
      ['no stress',   total-stress,    '#6b7280','stress','no'],
    ];
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">'+
      items
      .filter(([n,v,c,axis,val])=>v>0||(axis==='deck'&&currentDeck===val)||(axis==='stress'&&currentStress===val))
      .map(([n,v,c,axis,val])=>{
        const active=(axis==='deck'&&currentDeck===val)||(axis==='stress'&&currentStress===val);
        const bg=active?(c+'55'):(c+'22');
        const border=active?(c+'cc'):(c+'44');
        return `<button type="button" data-pill-axis="${axis}" data-pill-value="${val}" `+
          `style="background:${bg};color:${c};border:1px solid ${border};padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer;${active?'box-shadow:0 0 0 1px '+c+'66;':''}">`+
          `${esc(n)} <b>${v}</b></button>`;
      }).join('')+
      '</div>';
  }

  function fmtDur(ms){
    if(!ms||ms<0)return '—';
    if(ms<1000)return ms+' ms';
    const s=ms/1000;
    if(s<60)return s.toFixed(1)+'s';
    const m=Math.floor(s/60),rem=Math.round(s-m*60);
    if(m<60)return m+'m '+rem+'s';
    const h=Math.floor(m/60);
    return h+'h '+(m-h*60)+'m';
  }

  /* Guard against corrupt timings: a step that captured a wall-clock
     timestamp (empty _now_ms start) instead of elapsed ms surfaces as
     ~1.7e12 and would dwarf every real run. Anything over 24h is
     impossible for a validation run, so treat it as missing. */
  const MAX_RUN_MS=86400000;
  function plausibleDur(d){d=+d;return d>0&&d<MAX_RUN_MS?d:0;}

  function kpis(rs){
    const total=rs.length;
    const p=rs.reduce((a,r)=>a+(r.passed||0),0);
    const f=rs.reduce((a,r)=>a+(r.failed||0),0);
    const k=rs.reduce((a,r)=>a+(r.skipped||0),0);
    const tt=p+f+k;
    const pct=tt?Math.round(100*p/tt):0;
    const okRuns=rs.filter(r=>(r.failed||0)===0).length;
    const rpct=total?Math.round(100*okRuns/total):0;
    const last=rs.length?rs[rs.length-1]:null;
    const lr=last?(last.overall||'?'):'—';
    const lc=lr==='PASS'?'var(--pass)':(lr==='FAIL'?'var(--fail)':'var(--muted)');
    const durs=rs.map(r=>plausibleDur(r.total_duration_ms)).filter(d=>d>0);
    const avgDur=durs.length?Math.round(durs.reduce((a,d)=>a+d,0)/durs.length):0;
    return `<div class="kpis">
      <div class="kpi"><div class="v">${total}</div><div class="l">Total Runs</div></div>
      <div class="kpi"><div class="v" style="color:var(--pass)">${rpct}%</div><div class="l">Runs Passed</div></div>
      <div class="kpi"><div class="v">${tt}</div><div class="l">Tests Executed</div></div>
      <div class="kpi"><div class="v" style="color:var(--accent)">${pct}%</div><div class="l">Test Pass Rate</div></div>
      <div class="kpi"><div class="v" style="color:${lc}">${esc(lr)}</div><div class="l">Last Run</div></div>
      <div class="kpi"><div class="v">${fmtDur(avgDur)}</div><div class="l">Avg Duration${durs.length?` · ${durs.length}/${total} timed`:''}</div></div></div>`;
  }

  function benchBars(rs){
    // Aggregate per-step duration averages across runs.
    const totals={};
    for(const r of rs){
      const names=r.step_names||[],durs=r.step_durations_ms||[];
      for(let i=0;i<names.length;i++){
        const n=names[i],d=plausibleDur(durs[i]);
        if(!n||d<=0)continue;
        const t=totals[n]=totals[n]||{sum:0,n:0};
        t.sum+=d;t.n+=1;
      }
    }
    const rows=Object.entries(totals)
      .map(([name,t])=>({name,avg:Math.round(t.sum/t.n),runs:t.n}))
      .sort((a,b)=>b.avg-a.avg);
    if(!rows.length)return '<p style="color:#475569;font-size:12px">No timing data yet. Run <code>pnpm validate:ci</code> (or <code>validate:full</code>) — new runs include per-step duration.</p>';
    const max=rows[0].avg||1;
    return rows.map(r=>{
      const pct=Math.max(2,100*r.avg/max).toFixed(1);
      return `<div class="scope-row"><span class="nm">${esc(r.name)}</span><div class="bar"><i style="width:${pct}%;background:#4ade80" title="${r.runs} run(s)"></i></div><span class="ct">${fmtDur(r.avg)}</span></div>`;
    }).join('');
  }

  function svgLine(rs){
    if(!rs.length)return '<p style="color:#475569;font-size:12px">No data yet.</p>';
    const w=480,h=200,pl=34,pb=24,pt=12,pr=12,cw=w-pl-pr,ch=h-pt-pb;
    const pts=rs.map((m,i)=>{
      const tt=m.total||1,rate=100*(m.passed||0)/tt;
      const x=pl+(cw*i/Math.max(1,rs.length-1)),y=pt+ch-(ch*rate/100);
      return {x,y,rate,m};
    });
    let grid='';
    for(const pct of [0,50,100]){const gy=pt+ch-(ch*pct/100);
      grid+=`<line x1="${pl}" y1="${gy.toFixed(1)}" x2="${w-pr}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`+
            `<text x="${pl-6}" y="${(gy+3).toFixed(1)}" fill="#64748b" font-size="9" text-anchor="end">${pct}%</text>`;}
    const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const area=`M${pts[0].x.toFixed(1)},${pt+ch} L`+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')+` L${pts[pts.length-1].x.toFixed(1)},${pt+ch} Z`;
    const dots=pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${(p.m.failed||0)===0?PASS:FAIL}"><title>${esc(p.m.ts||'?')} [${esc(scopeOf(p.m)||'?')}] ${Math.round(p.rate)}% (${p.m.passed||0}/${p.m.total||0})</title></circle>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}<path d="${area}" fill="#3d8bff22"/><path d="${line}" fill="none" stroke="#6ea8ff" stroke-width="2"/>${dots}</svg>`;
  }

  // Total run duration over time — shows whether validation is trending
  // faster or slower. A rising trend across runs flags a perf regression
  // (more cards / heavier mount / slower nav) before it reaches users.
  function svgDuration(rs){
    const withDur=rs.filter(m=>plausibleDur(m.total_duration_ms)>0);
    if(!withDur.length)return '<p style="color:#475569;font-size:12px">No timed runs yet.</p>';
    const w=480,h=200,pl=46,pb=24,pt=12,pr=12,cw=w-pl-pr,ch=h-pt-pb;
    const maxMs=Math.max(...withDur.map(m=>plausibleDur(m.total_duration_ms)))||1;
    const pts=withDur.map((m,i)=>{
      const d=plausibleDur(m.total_duration_ms);
      const x=pl+(cw*i/Math.max(1,withDur.length-1)),y=pt+ch-(ch*d/maxMs);
      return {x,y,d,m};
    });
    let grid='';
    for(const frac of [0,0.5,1]){const gy=pt+ch-(ch*frac);
      grid+=`<line x1="${pl}" y1="${gy.toFixed(1)}" x2="${w-pr}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`+
            `<text x="${pl-6}" y="${(gy+3).toFixed(1)}" fill="#64748b" font-size="9" text-anchor="end">${fmtDur(Math.round(maxMs*frac))}</text>`;}
    const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const area=`M${pts[0].x.toFixed(1)},${pt+ch} L`+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')+` L${pts[pts.length-1].x.toFixed(1)},${pt+ch} Z`;
    // Trend arrow: compare last vs first timed run.
    const first=pts[0].d,last=pts[pts.length-1].d;
    const delta=last-first,pct=first?Math.round(100*delta/first):0;
    const trend=pts.length<2?'':(delta>0?`▲ +${pct}% slower`:(delta<0?`▼ ${pct}% faster`:'• flat'));
    const trendColor=delta>0?FAIL:(delta<0?PASS:'#94a3b8');
    const dots=pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#38bdf8"><title>${esc(p.m.ts||'?')} [${esc(scopeOf(p.m)||'?')}] ${fmtDur(p.d)}</title></circle>`).join('');
    const trendLabel=trend?`<text x="${w-pr}" y="${pt+8}" fill="${trendColor}" font-size="11" font-weight="700" text-anchor="end">${trend}</text>`:'';
    const countLabel=withDur.length<rs.length?`<text x="${pl}" y="${pt+8}" fill="#64748b" font-size="9">${withDur.length}/${rs.length} runs timed</text>`:'';
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}<path d="${area}" fill="#38bdf822"/><path d="${line}" fill="none" stroke="#38bdf8" stroke-width="2"/>${dots}${trendLabel}${countLabel}</svg>`;
  }

  function svgDonut(p,f,k,size=180){
    const tt=p+f+k;
    if(!tt)return '<p style="color:#475569;font-size:12px">No data yet.</p>';
    const cx=size/2,cy=size/2,r=size/2-14;
    const segs=[[PASS,p],[FAIL,f],[SKIP,k]];
    let arcs='',angle=-90;
    for(const [c,v] of segs){
      if(!v)continue;
      const sweep=(v/tt)*360;
      // 360° as <circle> — A-arc with same start/end renders nothing.
      if(sweep>=359.999){arcs+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="22"/>`;angle+=sweep;continue;}
      const a1=angle*Math.PI/180,a2=(angle+sweep)*Math.PI/180;
      const x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);
      const x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);
      const lg=sweep>180?1:0;
      arcs+=`<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)} 0 ${lg} 1 ${x2.toFixed(2)},${y2.toFixed(2)}" fill="none" stroke="${c}" stroke-width="22"/>`;
      angle+=sweep;
    }
    const pct=Math.round(100*p/tt);
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${arcs}<text x="${cx}" y="${cy-2}" fill="#e2e8f0" font-size="26" font-weight="800" text-anchor="middle">${pct}%</text><text x="${cx}" y="${cy+16}" fill="#64748b" font-size="10" text-anchor="middle">PASS RATE</text></svg>`;
  }

  function scopeBars(rs){
    const labels=[['local','Local'],['ci','CI'],['release','Release']];
    return labels.map(([sd,label])=>{
      const sr=rs.filter(r=>scopeOf(r)===sd);
      const p=sr.reduce((a,r)=>a+(r.passed||0),0);
      const f=sr.reduce((a,r)=>a+(r.failed||0),0);
      const k=sr.reduce((a,r)=>a+(r.skipped||0),0);
      const tt=p+f+k;
      if(!tt)return `<div class="scope-row"><span class="nm">${label}</span><div class="bar"></div><span class="ct" style="color:#475569">—</span></div>`;
      const pp=(100*p/tt).toFixed(1),fp=(100*f/tt).toFixed(1),kp=(100*k/tt).toFixed(1);
      return `<div class="scope-row"><span class="nm">${label}</span><div class="bar"><i style="width:${pp}%;background:${PASS}"></i><i style="width:${fp}%;background:${FAIL}"></i><i style="width:${kp}%;background:${SKIP}"></i></div><span class="ct">${p}/${tt}</span></div>`;
    }).join('');
  }

  function suiteBars(rs){
    const SUITES=[['home','Home'],['settings','Settings'],['search','Search'],
                  ['sidenav','Side Nav'],['sidecar','Sidecar'],
                  ['qam_shelves','QAM Shelves'],['qam_smart','QAM Smart'],
                  ['qam_global_toggles','QAM Global'],['about','About'],['context_menu','Context Menu'],
                  ['perf','Performance'],['crash_protection','Crash Protection'],['stress','Stress']];
    const totals={};
    for(const r of rs){
      const ps=r.per_suite;if(!ps||typeof ps!=='object')continue;
      for(const [s,c] of Object.entries(ps)){
        const t=totals[s]=totals[s]||{passed:0,failed:0,skipped:0};
        t.passed+=c.passed||0;t.failed+=c.failed||0;t.skipped+=c.skipped||0;
      }
    }
    if(!Object.keys(totals).length)return '<p style="color:#475569;font-size:12px">No UI test data yet. Run <code>pnpm validate:full</code> with a Deck connected.</p>';
    // Append any suite in the data but not in the ordered list so a new
    // suite never silently drops out of the coverage panel.
    const known=new Set(SUITES.map(x=>x[0]));
    for(const k of Object.keys(totals))if(!known.has(k)){known.add(k);SUITES.push([k,k.replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase())]);}
    return SUITES.map(([key,label])=>{
      const s=totals[key];if(!s)return '';
      const tt=s.passed+s.failed+s.skipped;if(!tt)return '';
      const pp=(100*s.passed/tt).toFixed(1),fp=(100*s.failed/tt).toFixed(1),kp=(100*s.skipped/tt).toFixed(1);
      const pct=Math.round(100*s.passed/tt);
      return `<div class="scope-row"><span class="nm">${esc(label)}</span><div class="bar"><i style="width:${pp}%;background:${PASS}"></i><i style="width:${fp}%;background:${FAIL}"></i><i style="width:${kp}%;background:${SKIP}"></i></div><span class="ct">${pct}% (${s.passed}/${tt})</span></div>`;
    }).filter(Boolean).join('');
  }

  function render(){
    const view=filterRuns(runs,currentScope,currentDeck,currentStress);
    const empty=view.length===0;
    // Pills always render against the full `runs` array so an empty
    // filtered view still leaves the pills visible + clickable for
    // un-toggling. See `pills()` for the count semantics.
    $('pills').innerHTML=pills(runs);
    const sel=[currentScope!=='all'?currentScope:null,
               currentDeck!=='all'?('deck='+currentDeck):null,
               currentStress!=='all'?('stress='+currentStress):null].filter(Boolean).join(' · ')||'all';
    $('kpis-host').innerHTML=empty
      ? `<div class="empty-scope">No <strong>${esc(sel)}</strong> runs yet. Run <code>pnpm validate:full</code> (local) or push to a tracked branch (CI) to see data here.</div>`
      : kpis(view);
    $('line').innerHTML=svgLine(view);
    const durHost=$('duration');
    if(durHost)durHost.innerHTML=svgDuration(view);
    $('suites').innerHTML=suiteBars(view);
    const p=view.reduce((a,r)=>a+(r.passed||0),0);
    const f=view.reduce((a,r)=>a+(r.failed||0),0);
    const k=view.reduce((a,r)=>a+(r.skipped||0),0);
    $('donut').innerHTML=svgDonut(p,f,k);
    $('donut-legend').innerHTML=`<span><i style="background:${PASS}"></i> ${p} pass</span><span><i style="background:${FAIL}"></i> ${f} fail</span><span><i style="background:${SKIP}"></i> ${k} skip</span>`;
    $('scopes').innerHTML=scopeBars(view);
    const benchHost=$('bench');
    if(benchHost)benchHost.innerHTML=benchBars(view);
    $('footer-count').textContent=view.length;
  }

  function syncHash(){
    const parts=[];
    if(currentScope!=='all')parts.push('scope='+currentScope);
    if(currentDeck!=='all')parts.push('deck='+currentDeck);
    if(currentStress!=='all')parts.push('stress='+currentStress);
    // When no filters are active, clear the hash to the bare path (NOT
    // '#'): writing a lone '#' makes the browser jump to the top of the
    // document. replaceState with pathname leaves scroll untouched.
    const url=parts.length?('#'+parts.join('&')):(location.pathname+location.search);
    try{history.replaceState(null,'',url)}catch(_){}
  }
  function setScope(s){
    if(!['all','local','ci','release'].includes(s))return;
    currentScope=s;
    document.querySelectorAll('.filter-chips button')
      .forEach(b=>b.classList.toggle('active',b.dataset.filter===s));
    syncHash(); render();
  }
  // Click on a pill toggles its axis. Re-clicking an active pill resets
  // that axis to 'all' so the user can quickly clear the filter without
  // a separate reset control.
  function togglePill(axis,value){
    if(axis==='deck'){currentDeck=(currentDeck===value?'all':value);}
    else if(axis==='stress'){currentStress=(currentStress===value?'all':value);}
    syncHash(); render();
  }

  document.querySelectorAll('.filter-chips button')
    .forEach(b=>b.addEventListener('click',()=>setScope(b.dataset.filter)));
  // Delegated on #pills since the buttons are re-rendered by render().
  document.getElementById('pills').addEventListener('click',(e)=>{
    const btn=e.target.closest('button[data-pill-axis]');
    if(!btn)return;
    togglePill(btn.dataset.pillAxis,btn.dataset.pillValue);
  });

  // Parse `#scope=local&deck=yes&stress=no` (current format) or the legacy
  // single-token form `#local` (compat with bookmarks predating the
  // multi-axis filter).
  const hash=(location.hash||'').replace(/^#/,'');
  if(hash){
    if(hash.includes('=')){
      for(const kv of hash.split('&')){
        const [k,v]=kv.split('=');
        if(k==='scope')setScope(v);
        else if(k==='deck'&&['yes','no'].includes(v))currentDeck=v;
        else if(k==='stress'&&['yes','no'].includes(v))currentStress=v;
      }
      render();
    } else {
      setScope(hash);
    }
  } else {
    render();
  }

  // Augment with live manifests. file:// in Chromium blocks fetch — that's
  // OK, the baked data already in the page is the fallback. Firefox file://
  // and any http:// server picks up locally-generated runs that weren't
  // committed (typically `reports/local/`, which is gitignored).
  Promise.all(SCOPES.map(s=>fetch(s+'/runs-manifest.json',{cache:'no-cache'})
    .then(r=>r.ok?r.json():[]).catch(()=>[]))).then(lists=>{
    const fetched=[].concat(...lists).map(r=>Object.assign({},r,{_scope:r._scope||r.scope}));
    if(!fetched.length)return;
    const merged=sortRuns(dedupe(runs.concat(fetched)));
    if(merged.length===runs.length)return;
    // Preserve scroll: this async re-render can fire after the user has
    // scrolled down, and rebuilding panel innerHTML would otherwise let
    // the viewport snap back to the top.
    const y=window.scrollY;
    runs=merged;render();
    window.scrollTo(0,y);
  });
})();
""".strip()


def _rebuild_dashboard(reports_root: Path) -> None:
    """Write the dashboard as a STATIC SHELL driven by client-side JS.

    The shell embeds the runs the generator saw (`window.__BAKED_RUNS__`) so
    the page is never blank, then augments at view time by fetching each
    scope's `runs-manifest.json` — pulling in locally-generated reports that
    were never committed (`reports/local/` is gitignored). file:// in
    Chromium blocks fetch and falls back to the baked data; Firefox or any
    http server (e.g. `pnpm reports`) sees everything on disk.
    """
    runs = _collect_all_runs(reports_root)
    # Strip Python-internal markers we won't need on the client; keep `_scope`
    # since the JS uses it to bucket runs.
    baked = [
        {k: v for k, v in m.items() if not k.startswith("__")}
        for m in runs
    ]

    # Only surface scope chips that actually have runs — a machine with no
    # local validation shouldn't show an empty "Local" filter.
    present = {m.get("_scope") for m in runs}
    chip_defs = [("all", "All")] + [
        (s, label) for s, label in (("local", "Local"), ("ci", "CI"), ("release", "Release"))
        if s in present
    ]
    chips = (
        '<div class="filter-chips" role="tablist" aria-label="Scope filter">'
        + "".join(
            f'<button type="button" data-filter="{s}" '
            f'class="{"active" if s == "all" else ""}" role="tab">{label}</button>'
            for s, label in chip_defs
        )
        + '</div>'
    )

    # Static panel skeleton. The JS fills the `id`-tagged containers; the
    # text fallbacks here keep the page readable for ~50ms before JS runs
    # (or forever if JS is disabled — rare, but doesn't hurt).
    panels = """
  <div id="pills"></div>
  <div id="kpis-host"></div>

  <div class="panel">
    <h2>Pass rate over time &mdash; all runs</h2>
    <div id="line"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> run passed</span>
      <span><i style="background:#f87171"></i> run had failures</span>
    </div>
  </div>

  <div class="panel">
    <h2>Total run duration over time &mdash; faster / slower trend</h2>
    <div id="duration"></div>
    <div class="legend">
      <span><i style="background:#38bdf8"></i> total validation time per run</span>
      <span style="color:#64748b;font-size:10px">(rising = slower; trend badge compares newest vs oldest timed run)</span>
    </div>
  </div>

  <div class="panel">
    <h2>Coverage by test suite &mdash; pass rate per suite (aggregated)</h2>
    <div id="suites"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> pass</span>
      <span><i style="background:#f87171"></i> fail</span>
      <span><i style="background:#94a3b8"></i> skip</span>
      <span style="color:#64748b;font-size:10px">(% = pass rate, requires a local run with Deck)</span>
    </div>
  </div>

  <div class="panel-grid">
    <div class="panel">
      <h2>Overall test distribution</h2>
      <div style="text-align:center" id="donut"></div>
      <div class="legend" style="justify-content:center" id="donut-legend"></div>
    </div>
    <div class="panel">
      <h2>Results by scope</h2>
      <div id="scopes"></div>
      <div class="legend">
        <span><i style="background:#4ade80"></i> pass</span>
        <span><i style="background:#f87171"></i> fail</span>
        <span><i style="background:#94a3b8"></i> skip</span>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>Step durations &mdash; average across runs (ms)</h2>
    <div id="bench"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> avg duration</span>
      <span style="color:#64748b;font-size:10px">(per step, sourced from each run's `step_durations_ms`)</span>
    </div>
  </div>
"""

    baked_json = json.dumps(baked, separators=(",", ":"))
    dash = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Shelves &mdash; Dashboard</title>
<link rel="stylesheet" href="../style.css">
<style>{_DASH_CSS}</style>
</head>
<body>
{_report_nav('../index.html', 'index.html', 'dashboard.html')}
<main>
  {chips}
  {panels}
</main>
{_site_footer('../')}
<script>window.__BAKED_RUNS__={baked_json};</script>
<script>{_DASH_JS}</script>
</body>
</html>
"""
    (reports_root / "dashboard.html").write_text(dash, encoding="utf-8")
