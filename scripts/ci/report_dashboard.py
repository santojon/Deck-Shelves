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
)
from report_metrics import _changelog_releases, _semver_key  # type: ignore[import-not-found]
from report_shared import _report_nav, _site_footer  # type: ignore[import-not-found]


def _version_windows(reports_root: Path) -> dict:
    """Release-history boundaries for the duration chart, from the changelog:
    the latest version, the last 3 released versions, the most recent major
    (X.0.0) and the most recent *minor* feature bump (X.Y.0 with Y>0 — i.e. not
    a major). Baked into the dashboard so the trend windows use real history
    rather than guessing from whichever versions happened to have runs."""
    root = reports_root
    for _ in range(6):
        if (root / "CHANGELOG.md").exists():
            break
        root = root.parent
    vers = [v for _, v in _changelog_releases(str(root))]
    if not vers:
        return {}
    last_major = last_minor = ""
    for v in reversed(vers):
        _, m, p = _semver_key(v)
        if p == 0 and m == 0 and not last_major:
            last_major = v
        if p == 0 and m != 0 and not last_minor:
            last_minor = v
    return {"latest": vers[-1], "last3": vers[-3:],
            "lastMajor": last_major, "lastMinor": last_minor}
_DASH_JS = r"""
(function(){
  const SCOPES=['local','ci','release'];
  const PASS='#4ade80',FAIL='#f87171',SKIP='#94a3b8';
  const $=id=>document.getElementById(id);
  let runs=Array.isArray(window.__BAKED_RUNS__)?window.__BAKED_RUNS__:[];
  // Scope is multi-select: an empty set means "all". Deck/stress stay tri-state.
  let currentScopes=new Set(), currentDeck='all', currentStress='all';

  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function scopeOf(r){return r._scope||r.scope||''}
  function hasDeck(r){return scopeOf(r)==='local'}
  function hasStress(r){return !!r.stress}
  function filterRuns(rs,scopes,dk,st){
    return rs.filter(r=>
      (scopes.size===0||scopes.has(scopeOf(r))) &&
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

  // Shared timeline annotations for the trend charts: a version label atop each
  // version segment (with a dashed boundary) and the segment's first date below,
  // gap-guarded so the dates don't collide.
  function verDateMarkers(items,X,pt,ch){
    let out='',lastDX=-99;
    for(let i=0;i<items.length;i++){
      if(i>0&&items[i].version===items[i-1].version)continue;
      const x=X(i);
      if(i>0)out+=`<line x1="${x.toFixed(1)}" y1="${pt}" x2="${x.toFixed(1)}" y2="${pt+ch}" stroke="#475569" stroke-width="1" stroke-dasharray="2 3" opacity="0.55"/>`;
      out+=`<text x="${(x+2).toFixed(1)}" y="${(pt-15).toFixed(1)}" fill="#cbd5e1" font-size="9" font-weight="700">${esc(items[i].version||'?')}</text>`;
      const day=String(items[i].ts||'').slice(0,10);
      if(x-lastDX>62){out+=`<text x="${(x+2).toFixed(1)}" y="${(pt+ch+13).toFixed(1)}" fill="#64748b" font-size="8">${esc(day)}</text>`;lastDX=x;}
    }
    if(items.length){const lx=X(items.length-1),ld=String(items[items.length-1].ts||'').slice(0,10);
      if(lx-lastDX>62)out+=`<text x="${lx.toFixed(1)}" y="${(pt+ch+13).toFixed(1)}" fill="#64748b" font-size="8" text-anchor="end">${esc(ld)}</text>`;}
    return out;
  }
  function suiteTotals(r){
    const ps=r.per_suite;let p=0,f=0,k=0;
    if(ps&&typeof ps==='object')for(const c of Object.values(ps)){p+=c.passed||0;f+=c.failed||0;k+=c.skipped||0;}
    return {p,f,k,tt:p+f+k};
  }
  function svgLine(rs){
    const items=sortRuns(rs);
    if(!items.length)return '<p style="color:#475569;font-size:12px">No data yet.</p>';
    const w=520,h=224,pl=40,pb=30,pt=28,pr=14,cw=w-pl-pr,ch=h-pt-pb;
    const X=i=>pl+(cw*i/Math.max(1,items.length-1)),Y=rate=>pt+ch-(ch*rate/100);
    const pts=items.map((m,i)=>{const tt=m.total||1,rate=100*(m.passed||0)/tt;return {x:X(i),y:Y(rate),rate,m};});
    let grid='';
    for(const pct of [0,50,100]){const gy=pt+ch-(ch*pct/100);
      grid+=`<line x1="${pl}" y1="${gy.toFixed(1)}" x2="${w-pr}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`+
            `<text x="${pl-6}" y="${(gy+3).toFixed(1)}" fill="#64748b" font-size="9" text-anchor="end">${pct}%</text>`;}
    const vmarks=verDateMarkers(items,X,pt,ch);
    const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const area=`M${pts[0].x.toFixed(1)},${pt+ch} L`+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')+` L${pts[pts.length-1].x.toFixed(1)},${pt+ch} Z`;
    const dots=pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${(p.m.failed||0)===0?PASS:FAIL}"><title>${esc(p.m.ts||'?')} · ${esc(p.m.version||'?')} [${esc(scopeOf(p.m)||'?')}] · ${Math.round(p.rate)}% (${p.m.passed||0}/${p.m.total||0})</title></circle>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}${vmarks}<path d="${area}" fill="#3d8bff22"/><path d="${line}" fill="none" stroke="#6ea8ff" stroke-width="2"/>${dots}</svg>`;
  }
  // Generic metric-over-time trend: one point per run for which valueFn returns
  // a finite number, with version/date annotations, the numeric value on each
  // point and a first-vs-last trend badge. opts.pct locks the axis to 0..100 and
  // formats as %. Returns '' when no run yields a value (so the panel can hide).
  // Simple metric trend: a single line with a value label on each change and one
  // first-vs-last badge. For sparse series (e.g. UI-test coverage, which only has
  // data for runs that ran the suites) where the windowed averages would collapse
  // onto a single point. opts: {pct, color, fmt, upGood, estFn}.
  function svgSimpleTrend(rs,valueFn,opts){
    opts=opts||{};
    const rows=sortRuns(rs).map(m=>({m,v:valueFn(m)})).filter(r=>typeof r.v==='number'&&isFinite(r.v));
    if(!rows.length)return '';
    const pct=!!opts.pct,color=opts.color||'#38bdf8',good=opts.upGood!==false;
    const fmt=opts.fmt||(pct?(v=>Math.round(v)+'%'):(v=>String(Math.round(v))));
    const w=520,h=214,pl=44,pb=30,pt=28,pr=14,cw=w-pl-pr,ch=h-pt-pb;
    const maxV=pct?100:Math.max(1,...rows.map(r=>r.v));
    const X=i=>pl+(cw*i/Math.max(1,rows.length-1)),Y=v=>pt+ch-(ch*v/maxV);
    const pts=rows.map((r,i)=>({x:X(i),y:Y(r.v),v:r.v,m:r.m}));
    let grid='';
    for(const frac of [0,0.5,1]){const gy=pt+ch-(ch*frac),gv=maxV*frac;
      grid+=`<line x1="${pl}" y1="${gy.toFixed(1)}" x2="${w-pr}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`+
            `<text x="${pl-6}" y="${(gy+3).toFixed(1)}" fill="#64748b" font-size="9" text-anchor="end">${pct?Math.round(gv)+'%':fmt(gv)}</text>`;}
    const vmarks=verDateMarkers(rows.map(r=>r.m),X,pt,ch);
    const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const area=`M${pts[0].x.toFixed(1)},${pt+ch} L`+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')+` L${pts[pts.length-1].x.toFixed(1)},${pt+ch} Z`;
    const dots=pts.map(p=>{const est=opts.estFn&&opts.estFn(p.m);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" ${est?`fill="#0e1626" stroke="${color}" stroke-width="1.5"`:`fill="${color}"`}><title>${esc(p.m.ts||'?')} · ${esc(p.m.version||'?')} · ${fmt(p.v)}${est?' (est.)':''}</title></circle>`;}).join('');
    let lastLX=-99;const labels=pts.map((p,i)=>{
      const chg=i===0||Math.abs(p.v-pts[i-1].v)>1e-9;
      const last=i===pts.length-1;
      if(!(chg||last))return '';
      if(!last&&p.x-lastLX<32)return '';
      lastLX=p.x;
      return `<text x="${p.x.toFixed(1)}" y="${(p.y-6).toFixed(1)}" fill="#cbd5e1" font-size="8.5" font-weight="700" text-anchor="middle">${fmt(p.v)}</text>`;
    }).join('');
    const delta=Math.round(rows[rows.length-1].v-rows[0].v);
    const dtxt=(delta>0?'+':'')+delta+(pct?'pp':'');
    const tr=rows.length<2?'':(delta===0?'• flat':(delta>0?'▲ '+dtxt:'▼ '+dtxt));
    const trc=delta>0?(good?PASS:FAIL):(delta<0?(good?FAIL:PASS):'#94a3b8');
    const trend=tr?`<text x="${w-pr}" y="${pt-16}" fill="${trc}" font-size="11" font-weight="700" text-anchor="end">${tr}</text>`:'';
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}${vmarks}<path d="${area}" fill="${color}20"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2"/>${dots}${labels}${trend}</svg>`;
  }
  // Generic metric-over-time trend in the SAME shape as the duration chart: a
  // faint base line of each run's value, version/date markers, and a dashed
  // average line per window (all runs / last 3 versions / since minor / since
  // major) with each window's within-window trend in the legend. valueFn -> a
  // finite number per run (null to skip). opts: {pct, fmt, upGood, estFn}.
  function svgMetricTrend(rs,valueFn,opts){
    opts=opts||{};
    const rows=sortRuns(rs).map(m=>({m,v:valueFn(m)})).filter(r=>typeof r.v==='number'&&isFinite(r.v));
    if(!rows.length)return '';
    const pct=!!opts.pct,good=opts.upGood!==false;
    const fmt=opts.fmt||(pct?(v=>Math.round(v)+'%'):(v=>String(Math.round(v))));
    const items=rows.map(r=>r.m),valMap=new Map(rows.map(r=>[r.m,r.v]));
    const w=520,h=234,pl=48,pb=30,pt=28,pr=14,cw=w-pl-pr,ch=h-pt-pb;
    const maxV=pct?100:Math.max(1,...rows.map(r=>r.v));
    const X=i=>pl+(cw*i/Math.max(1,rows.length-1)),Y=v=>pt+ch-(ch*v/maxV);
    const pts=rows.map((r,i)=>({x:X(i),y:Y(r.v),v:r.v,m:r.m}));
    let grid='';
    for(const frac of [0,0.5,1]){const gy=pt+ch-(ch*frac),gv=maxV*frac;
      grid+=`<line x1="${pl}" y1="${gy.toFixed(1)}" x2="${w-pr}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`+
            `<text x="${pl-6}" y="${(gy+3).toFixed(1)}" fill="#64748b" font-size="9" text-anchor="end">${fmt(gv)}</text>`;}
    const vmarks=verDateMarkers(items,X,pt,ch);
    const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const area=`M${pts[0].x.toFixed(1)},${pt+ch} L`+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')+` L${pts[pts.length-1].x.toFixed(1)},${pt+ch} Z`;
    const dots=pts.map(p=>{const est=opts.estFn&&opts.estFn(p.m);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" ${est?'fill="#0e1626" stroke="#38bdf8" stroke-width="1.5"':'fill="#38bdf8"'}><title>${esc(p.m.ts||'?')} · ${esc(p.m.version||'?')} [${esc(scopeOf(p.m)||'?')}] · ${fmt(p.v)}${est?' (est.)':''}</title></circle>`;}).join('');
    const idxOf=new Map(items.map((m,i)=>[m,i]));
    let avgLines='';const legend=[],placedY=[];
    for(const [name,color,ws] of verWindows(items)){
      const ds=ws.map(m=>valMap.get(m)).filter(v=>typeof v==='number'&&isFinite(v));
      if(!ds.length)continue;
      const avg=ds.reduce((a,b)=>a+b,0)/ds.length;
      let gy=Y(avg);while(placedY.some(py=>Math.abs(py-gy)<5))gy+=5;placedY.push(gy);
      const idxs=ws.map(m=>idxOf.get(m)).filter(i=>i!=null);
      const x1=X(Math.min(...idxs)),x2=X(Math.max(...idxs));
      avgLines+=`<line x1="${x1.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${color}" stroke-width="1.75" stroke-dasharray="5 3"><title>${esc(name)}: avg ${fmt(Math.round(avg))} over ${ds.length} run(s)</title></line>`;
      const sw=ws.slice().sort((a,b)=>String(a.ts||'').localeCompare(String(b.ts||'')));
      const fv=valMap.get(sw[0]),lv=valMap.get(sw[sw.length-1]),delta=lv-fv;
      const dtxt=pct?((delta>=0?'+':'')+Math.round(delta)+'pp'):((delta>=0?'+':'')+(fv?Math.round(100*delta/fv):0)+'%');
      const tr=ds.length<2?'single run':(delta===0?'• flat':(delta>0?'▲ '+dtxt:'▼ '+dtxt));
      const trc=delta>0?(good?PASS:FAIL):(delta<0?(good?FAIL:PASS):'#94a3b8');
      legend.push(`<span style="display:inline-flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap"><i style="width:16px;border-top:2px dashed ${color};display:inline-block;flex:none"></i><span style="color:#cbd5e1;min-width:120px">${esc(name)}</span><b style="color:#e2e8f0">${fmt(Math.round(avg))}</b><b style="color:${trc}">${tr}</b><span style="color:#64748b">${ds.length} run${ds.length>1?'s':''}</span></span>`);
    }
    const svg=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}${vmarks}<path d="${area}" fill="#38bdf815"/><path d="${line}" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.5"/>${avgLines}${dots}</svg>`;
    return svg+`<div style="display:flex;flex-direction:column;gap:5px;margin-top:10px">${legend.join('')}</div>`;
  }
  function unitTotals(r){const u=r.unit;return (u&&typeof u==='object'&&u.total)?u:null;}
  // Per-step duration trend as small multiples: one sparkline per step showing
  // how its time moves across runs/versions, with the latest value + trend %.
  function stepTrends(rs){
    const timed=sortRuns(rs.filter(r=>Array.isArray(r.step_names)&&Array.isArray(r.step_durations_ms)));
    if(!timed.length)return '';
    const order=[],series={};
    for(const r of timed){
      const ns=r.step_names||[],ds=r.step_durations_ms||[];
      for(let i=0;i<ns.length;i++){
        const n=ns[i],d=plausibleDur(ds[i]);
        if(!series[n]){series[n]=[];order.push(n);}
        if(d>0)series[n].push({v:d,m:r});
      }
    }
    const cards=order.map(n=>{
      const pts=series[n];if(!pts||!pts.length)return '';
      const vals=pts.map(p=>p.v),mx=Math.max(...vals)||1,sw=170,sh=42;
      const X=i=>5+(sw-10)*i/Math.max(1,pts.length-1),Y=v=>4+(sh-8)*(1-v/mx);
      const line='M'+pts.map((p,i)=>`${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' L');
      const dots=pts.map((p,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="1.6" fill="#6ea8ff"><title>${esc(p.m.version||'?')} · ${fmtDur(p.v)}</title></circle>`).join('');
      const f=pts[0].v,l=pts[pts.length-1].v,delta=l-f,dp=f?Math.round(100*delta/f):0;
      const tr=pts.length<2?'—':(delta>0?`▲ +${dp}%`:(delta<0?`▼ ${dp}%`:'• flat'));
      const trc=delta>0?FAIL:(delta<0?PASS:'#94a3b8');
      const avg=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
      return `<div style="background:#0d1b2a;border:1px solid #1e293b;border-radius:7px;padding:8px 9px">`+
        `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-bottom:2px"><span style="font-size:11px;font-weight:600;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span><span style="font-size:10px;font-weight:700;color:${trc};flex:none">${tr}</span></div>`+
        `<svg viewBox="0 0 ${sw} ${sh}" width="100%" height="${sh}"><path d="${line}" fill="none" stroke="#6ea8ff" stroke-width="1.5"/>${dots}</svg>`+
        `<div style="font-size:10px;color:#94a3b8;margin-top:2px"><b style="color:#e2e8f0">${fmtDur(l)}</b> latest · avg ${fmtDur(avg)}</div></div>`;
    }).filter(Boolean).join('');
    if(!cards)return '';
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">${cards}</div>`;
  }

  function parseVer(v){const m=/^(\d+)\.(\d+)\.(\d+)/.exec(String(v==null?'':v));return m?[+m[1],+m[2],+m[3]]:null;}
  function cmpVer(a,b){for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;}
  // Comparison windows over a set of runs, from the release history baked in
  // window.__VER_WINDOWS__: All runs, the last 3 released versions, everything
  // since the last minor feature bump (X.Y.0, Y>0) and since the last major
  // (X.0.0). Each is [label,color,runs]; nested subsets ending at the newest run.
  // Shared by every trend chart (duration + test/lint metrics).
  function verWindows(timed){
    const W=window.__VER_WINDOWS__||{};
    const withVer=timed.filter(m=>parseVer(m.version));
    const wins=[['All runs','#38bdf8',timed]];
    if(!withVer.length)return wins;
    if(W.last3&&W.last3.length){const s=new Set(W.last3);
      wins.push(['Last 3 versions','#a78bfa',withVer.filter(m=>s.has(m.version))]);}
    if(W.lastMinor){const b=parseVer(W.lastMinor);
      wins.push(['Since '+W.lastMinor,'#4ade80',withVer.filter(m=>cmpVer(parseVer(m.version),b)>=0)]);}
    if(W.lastMajor){const b=parseVer(W.lastMajor);
      wins.push(['Since '+W.lastMajor,'#f59e0b',withVer.filter(m=>cmpVer(parseVer(m.version),b)>=0)]);}
    return wins;
  }
  // Total run duration over time — the reference chart every metric trend mirrors.
  function svgDuration(rs){
    return svgMetricTrend(rs, m=>plausibleDur(m.total_duration_ms), {fmt:fmtDur, upGood:false})
      || '<p style="color:#475569;font-size:12px">No timed runs yet.</p>';
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
    const view=filterRuns(runs,currentScopes,currentDeck,currentStress);
    const empty=view.length===0;
    // Pills always render against the full `runs` array so an empty
    // filtered view still leaves the pills visible + clickable for
    // un-toggling. See `pills()` for the count semantics.
    $('pills').innerHTML=pills(runs);
    const sel=[currentScopes.size?Array.from(currentScopes).join('+'):null,
               currentDeck!=='all'?('deck='+currentDeck):null,
               currentStress!=='all'?('stress='+currentStress):null].filter(Boolean).join(' · ')||'all';
    $('kpis-host').innerHTML=empty
      ? `<div class="empty-scope">No <strong>${esc(sel)}</strong> runs yet. Run <code>pnpm validate:full</code> (local) or push to a tracked branch (CI) to see data here.</div>`
      : kpis(view);
    $('line').innerHTML=svgLine(view);
    const durHost=$('duration');
    if(durHost)durHost.innerHTML=svgDuration(view);
    // Coverage area only exists when some run in the view carries UI-test data.
    const hasCov=view.some(r=>suiteTotals(r).tt>0);
    const covPanel=$('coverage-panel');
    if(covPanel)covPanel.style.display=hasCov?'':'none';
    if(hasCov){
      const cr=$('coverage-trend');if(cr)cr.innerHTML=svgSimpleTrend(view,r=>{const t=suiteTotals(r);return t.tt>0?100*t.p/t.tt:null;},{pct:true,color:PASS,upGood:true});
      const cc=$('coverage-count');if(cc)cc.innerHTML=svgSimpleTrend(view,r=>{const t=suiteTotals(r);return t.tt>0?t.tt:null;},{color:'#38bdf8',upGood:true,fmt:v=>Math.round(v)+' tests'});
      $('suites').innerHTML=suiteBars(view);
    }
    // Unit-tests area — only when a run carries vitest counts.
    const hasUnit=view.some(r=>unitTotals(r));
    const unitPanel=$('unit-panel');
    if(unitPanel)unitPanel.style.display=hasUnit?'':'none';
    if(hasUnit){
      const estFn=r=>{const u=unitTotals(r);return !!(u&&u.estimated);};
      const uc=$('unit-count');if(uc)uc.innerHTML=svgMetricTrend(view,r=>{const u=unitTotals(r);return u?u.total:null;},{color:'#a78bfa',upGood:true,estFn,fmt:v=>Math.round(v)+' tests'});
      const ur=$('unit-rate');if(ur)ur.innerHTML=svgMetricTrend(view,r=>{const u=unitTotals(r);return u?100*(u.passed||0)/u.total:null;},{pct:true,color:PASS,upGood:true,estFn});
    }
    // Backend tests (pytest) — count + pass rate.
    const hasPy=view.some(r=>r.pytest&&r.pytest.total);
    const pyPanel=$('pytest-panel');
    if(pyPanel)pyPanel.style.display=hasPy?'':'none';
    if(hasPy){
      const estP=r=>!!(r.pytest&&r.pytest.estimated);
      const pc=$('pytest-count');if(pc)pc.innerHTML=svgMetricTrend(view,r=>r.pytest&&r.pytest.total?r.pytest.total:null,{color:'#38bdf8',upGood:true,estFn:estP,fmt:v=>Math.round(v)+' tests'});
      const pr2=$('pytest-rate');if(pr2)pr2.innerHTML=svgMetricTrend(view,r=>{const u=r.pytest;return u&&u.total?100*(u.passed||0)/u.total:null;},{pct:true,color:PASS,upGood:true,estFn:estP});
    }
    // Lint & code health — ruff issues, eslint suppressions, per-run problems.
    const hasRuff=view.some(r=>r.ruff&&typeof r.ruff.issues==='number');
    const hasSup=view.some(r=>typeof r.suppressions==='number');
    const hasProb=view.some(r=>r.lint&&typeof r.lint.problems==='number');
    const lintPanel=$('lint-panel');
    if(lintPanel)lintPanel.style.display=(hasRuff||hasSup||hasProb)?'':'none';
    const blk=(id,show)=>{const e=$(id);if(e)e.style.display=show?'':'none';};
    blk('ruff-block',hasRuff);blk('sup-block',hasSup);blk('prob-block',hasProb);
    if(hasRuff){const estR=r=>!!(r.ruff&&r.ruff.estimated),t=$('ruff-trend');if(t)t.innerHTML=svgMetricTrend(view,r=>r.ruff&&typeof r.ruff.issues==='number'?r.ruff.issues:null,{color:'#f59e0b',upGood:false,estFn:estR});}
    if(hasSup){const estS=r=>!!r.suppressionsEst,t=$('sup-trend');if(t)t.innerHTML=svgMetricTrend(view,r=>typeof r.suppressions==='number'?r.suppressions:null,{color:'#fb7185',upGood:false,estFn:estS});}
    if(hasProb){const estL=r=>!!(r.lint&&r.lint.estimated),t=$('prob-trend');if(t)t.innerHTML=svgMetricTrend(view,r=>r.lint&&typeof r.lint.problems==='number'?r.lint.problems:null,{color:'#fbbf24',upGood:false,estFn:estL});}
    // Per-step duration trends — whenever the view has timed runs.
    const stHost=$('step-trends');
    if(stHost){const st=stepTrends(view),stPanel=$('steptrends-panel');
      if(stPanel)stPanel.style.display=st?'':'none';stHost.innerHTML=st;}
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
    if(currentScopes.size)parts.push('scope='+Array.from(currentScopes).join(','));
    if(currentDeck!=='all')parts.push('deck='+currentDeck);
    if(currentStress!=='all')parts.push('stress='+currentStress);
    // When no filters are active, clear the hash to the bare path (NOT
    // '#'): writing a lone '#' makes the browser jump to the top of the
    // document. replaceState with pathname leaves scroll untouched.
    const url=parts.length?('#'+parts.join('&')):(location.pathname+location.search);
    try{history.replaceState(null,'',url)}catch(_){}
  }
  // Scope chips are multi-select: `all` clears the set (→ every scope); any
  // other chip toggles its scope in/out, so e.g. local+ci can be viewed at once.
  function updateChips(){
    document.querySelectorAll('.filter-chips button').forEach(b=>{
      const f=b.dataset.filter;
      b.classList.toggle('active', f==='all'?currentScopes.size===0:currentScopes.has(f));
    });
  }
  function toggleScope(s){
    if(s==='all')currentScopes.clear();
    else if(['local','ci','release'].includes(s)){
      if(currentScopes.has(s))currentScopes.delete(s); else currentScopes.add(s);
    } else return;
    updateChips(); syncHash(); render();
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
    .forEach(b=>b.addEventListener('click',()=>toggleScope(b.dataset.filter)));
  // Delegated on #pills since the buttons are re-rendered by render().
  document.getElementById('pills').addEventListener('click',(e)=>{
    const btn=e.target.closest('button[data-pill-axis]');
    if(!btn)return;
    togglePill(btn.dataset.pillAxis,btn.dataset.pillValue);
  });

  // Parse `#scope=local,ci&deck=yes&stress=no` (scope is a comma list now) or
  // the legacy single-token form `#local` (compat with older bookmarks).
  const hash=(location.hash||'').replace(/^#/,'');
  if(hash){
    if(hash.includes('=')){
      for(const kv of hash.split('&')){
        const [k,v]=kv.split('=');
        if(k==='scope'){for(const s of (v||'').split(',')){if(['local','ci','release'].includes(s))currentScopes.add(s);}}
        else if(k==='deck'&&['yes','no'].includes(v))currentDeck=v;
        else if(k==='stress'&&['yes','no'].includes(v))currentStress=v;
      }
    } else if(['local','ci','release'].includes(hash)){currentScopes.add(hash);}
  }
  updateChips(); render();

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
    <h2>Total run duration &mdash; per-window average &amp; trend</h2>
    <div id="duration"></div>
    <div class="legend">
      <span style="color:#64748b;font-size:10px">Faint line = each timed run's total. Dashed = average duration per version window; the badge is the within-window trend (&#9650; slower / &#9660; faster). Windows use the version saved on each run.</span>
    </div>
  </div>

  <div class="panel" id="coverage-panel" style="display:none">
    <h2>UI-test pass rate over time</h2>
    <div id="coverage-trend"></div>
    <h2 style="margin-top:18px">UI-test coverage (count) over time &mdash; growth / shrink</h2>
    <div id="coverage-count"></div>
    <h2 style="margin-top:18px">Coverage by test suite &mdash; pass rate per suite (aggregated)</h2>
    <div id="suites"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> pass</span>
      <span><i style="background:#f87171"></i> fail</span>
      <span><i style="background:#94a3b8"></i> skip</span>
      <span style="color:#64748b;font-size:10px">(shown only when a run has UI-test data)</span>
    </div>
  </div>

  <div class="panel" id="unit-panel" style="display:none">
    <h2>Unit tests (vitest) &mdash; count over time (coverage growth)</h2>
    <div id="unit-count"></div>
    <h2 style="margin-top:18px">Unit tests &mdash; pass rate over time</h2>
    <div id="unit-rate"></div>
    <div class="legend">
      <span style="color:#64748b;font-size:10px">Count = how many unit tests ran (coverage); rate = share passing. Points before vitest counts were recorded are <b>estimated</b> from per-version test-definition counts (anchored to the measured 3.0.0 total).</span>
    </div>
  </div>

  <div class="panel" id="pytest-panel" style="display:none">
    <h2>Backend tests (pytest) &mdash; count over time (coverage growth)</h2>
    <div id="pytest-count"></div>
    <h2 style="margin-top:18px">Backend tests &mdash; pass rate over time</h2>
    <div id="pytest-rate"></div>
    <div class="legend">
      <span style="color:#64748b;font-size:10px">Count = backend tests run; rate = share passing. Points before pytest counts were recorded are <b>estimated</b> per version from git.</span>
    </div>
  </div>

  <div class="panel" id="lint-panel" style="display:none">
    <div id="ruff-block">
      <h2>Ruff (Python lint) issues over time &mdash; lower is better</h2>
      <div id="ruff-trend"></div>
    </div>
    <div id="sup-block" style="display:none">
      <h2 style="margin-top:18px">ESLint suppressions (lint debt) over time &mdash; lower is better</h2>
      <div id="sup-trend"></div>
    </div>
    <div id="prob-block" style="display:none">
      <h2 style="margin-top:18px">Lint problems per run (eslint + ruff)</h2>
      <div id="prob-trend"></div>
    </div>
    <div class="legend">
      <span style="color:#64748b;font-size:10px">Fewer issues is better (&#9660; green = improving). Hollow points are <b>estimated</b>, backfilled per version from git (ruff run at each tag; suppressions from the eslint-suppressions.json total — the file was adopted at v2.4.1 with ~147 pre-existing problems). Per-run lint problems accrue from new runs.</span>
    </div>
  </div>

  <div class="panel" id="steptrends-panel" style="display:none">
    <h2>Step duration trends &mdash; how each step's time moves across versions</h2>
    <div id="step-trends"></div>
    <div class="legend">
      <span style="color:#64748b;font-size:10px">One sparkline per step; the badge is first-vs-last change (&#9650; slower / &#9660; faster).</span>
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
    ver_windows_json = json.dumps(_version_windows(reports_root), separators=(",", ":"))
    dash = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Shelves &mdash; Dashboard</title>
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
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
<script>window.__BAKED_RUNS__={baked_json};window.__VER_WINDOWS__={ver_windows_json};</script>
<script>{_DASH_JS}</script>
</body>
</html>
"""
    (reports_root / "dashboard.html").write_text(dash, encoding="utf-8")
