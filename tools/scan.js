() => {
  const W = innerWidth, H = innerHeight;
  const vis = el => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#'+el.id; else if (el.className && typeof el.className==='string') s += '.'+el.className.trim().split(/\s+/).slice(0,3).join('.'); const p = el.parentElement; let ps = p ? (p.id ? '#'+p.id : (p.className&&typeof p.className==='string' ? '.'+p.className.trim().split(/\s+/)[0] : p.tagName.toLowerCase())) : ''; return ps+'>'+s; };
  const all = [...document.querySelectorAll('body *')].filter(e => !e.closest('svg') && !['SCRIPT','STYLE','LINK','META','TEMPLATE'].includes(e.tagName));
  const visible = all.filter(vis);
  const hasBorder = cs => ['Top','Right','Bottom','Left'].filter(s => parseFloat(cs['border'+s+'Width'])>0 && cs['border'+s+'Style']!=='none' && !/rgba\([^)]*,\s*0\)$/.test(cs['border'+s+'Color'])).length>=3;
  const out = { W, H, visible: visible.length };
  // overflow right (only elements not inside a scroll container clipping them)
  const clipped = el => { let p = el.parentElement; while (p && p!==document.body) { const cs = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(cs.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= W+1) return true; } p = p.parentElement; } return false; };
  out.overflowRight = visible.filter(e => { const r = e.getBoundingClientRect(); return r.right > W+1 && r.left < W && !clipped(e); }).slice(0,15).map(e => sel(e)+' r='+Math.round(e.getBoundingClientRect().right));
  out.docScrollW = document.documentElement.scrollWidth;
  // squashed images/avatars
  out.squashed = visible.filter(e => (e.tagName==='IMG' || e.classList.contains('avatar')) ).filter(e => { const r = e.getBoundingClientRect(); return r.width<=4 || r.height<=4; }).slice(0,10).map(sel);
  out.squashedHidden = all.filter(e => e.classList && e.classList.contains('avatar') && !vis(e) && e.offsetParent!==null).length;
  // double borders
  const dbl = [];
  for (const e of visible) { const cs = getComputedStyle(e); if (!hasBorder(cs)) continue; const kids = [...e.children].filter(vis); if (kids.length!==1) continue; const k = kids[0]; const kcs = getComputedStyle(k); if (!hasBorder(kcs)) continue; const a = e.getBoundingClientRect(), b = k.getBoundingClientRect(); if (Math.abs(a.width-b.width)<14 && Math.abs(a.height-b.height)<14) dbl.push(sel(e)+' ⊃ '+sel(k)); }
  out.doubleBorder = dbl.slice(0,15);
  // backdrop blur
  const blur = visible.filter(e => { const cs = getComputedStyle(e); const f = cs.backdropFilter || cs.webkitBackdropFilter; return f && f!=='none'; });
  out.blurCount = blur.length;
  out.blurNested = blur.filter(e => { let p = e.parentElement; while (p) { if (blur.includes(p)) return true; p = p.parentElement; } return false; }).slice(0,15).map(sel);
  out.blurAllDom = all.filter(e => { const cs = getComputedStyle(e); const f = cs.backdropFilter; return f && f!=='none'; }).length;
  // FA icons as squares
  const fa = visible.filter(e => /\bfa-[a-z]/.test(e.className||'') && (e.className||'').match(/\bfa-(solid|regular|brands|fa)\b|\bfa\b|\bfas\b|\bfar\b/));
  out.faBad = fa.filter(e => { const b = getComputedStyle(e,'::before'); return b.content && b.content!=='none' && b.content!=='normal' && !/Font Awesome/i.test(b.fontFamily); }).slice(0,10).map(e => sel(e)+' ff='+getComputedStyle(e,'::before').fontFamily);
  out.faCount = fa.length;
  // truncated text
  out.truncated = visible.filter(e => { if (e.children.length>0) return false; if (!e.textContent.trim()) return false; const cs = getComputedStyle(e); if (cs.textOverflow==='ellipsis') return false; if (['INPUT','TEXTAREA','SELECT','OPTION'].includes(e.tagName)) return false; return e.scrollWidth > e.clientWidth+2 && /(hidden|clip)/.test(cs.overflowX); }).slice(0,15).map(e => sel(e)+' "'+e.textContent.trim().slice(0,20)+'" '+e.scrollWidth+'/'+e.clientWidth);
  // low contrast
  out.lowAlpha = visible.filter(e => { const t = [...e.childNodes].some(n => n.nodeType===3 && n.textContent.trim()); if (!t) return false; const c = getComputedStyle(e).color; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return false; const p = m[1].split(',').map(parseFloat); const a = p.length>3 ? p[3] : 1; let op = 1, q = e; while (q) { op *= +getComputedStyle(q).opacity; q = q.parentElement; } return a*op < 0.35; }).slice(0,15).map(e => sel(e)+' "'+e.textContent.trim().slice(0,16)+'" '+getComputedStyle(e).color);
  out.unhidden = all.filter(e => { const inl = e.style && e.style.display==='none'; const cls = e.classList && e.classList.contains('displayNone'); return (inl||cls) && getComputedStyle(e).display!=='none'; }).slice(0,40).map(sel);
  // hover transforms present in stylesheet
  const hov = [];
  for (const ss of document.styleSheets) { let rules; try { rules = ss.cssRules; } catch(_) { continue; } const walk = rs => { for (const r of rs) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText && /:hover/.test(r.selectorText) && r.style && r.style.transform && r.style.transform!=='none' && /translate|scale\((1\.[0-9]|[2-9])/.test(r.style.transform)) hov.push((ss.href||'inline').split('/').pop()+' :: '+r.selectorText.slice(0,90)+' { '+r.style.transform+' }'); } }; walk(rules); }
  out.hoverTransforms = hov.slice(0,30); out.hoverTransformCount = hov.length;
  // top bar
  const th = document.querySelector('#top-settings-holder'); if (th) { const r = th.getBoundingClientRect(); out.topBar = {l:Math.round(r.left), r:Math.round(r.right), w:Math.round(r.width), h:Math.round(r.height), centerOff: Math.round((r.left+r.right)/2 - W/2)}; }
  return JSON.stringify(out, null, 1);
}
