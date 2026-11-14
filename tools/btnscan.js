// tools/btnscan.js — text buttons that wrap, stand taller than wide, or clip their label.
// Expression, evaluated in the page like scan.js:
//   const j = JSON.parse(await page.evaluate(`(${src})(${JSON.stringify(root)})`));
// root: CSS selector of the panel to scan (default: whole document).
// A button counts as a "text button" when it renders >= 2 visible characters of text
// (icons are ::before glyphs, so innerText ignores them; labels at opacity 0 do not count). Flags:
//   wrap — the visible label occupies >= 2 line boxes (Range client rects)
//   tall — height > width * 1.05 (a capsule squeezed into a vertical pill / circle)
//   clip — label wider than the box while overflow hides it
//   spill — label glyphs drawn outside the button's border box (nowrap overflow)
(root) => {
  const scope = root ? document.querySelector(root) : document.body;
  if (!scope) return JSON.stringify({ root, missing: true, n: 0, bad: [] });
  const vis = el => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const onScreen = r => r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.'); const p = el.parentElement; const ps = p ? (p.id ? '#' + p.id : (typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\s+/)[0] : p.tagName.toLowerCase())) : ''; return ps + '>' + s; };
  const lines = el => {
    const rs = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rs.push([r.top, r.bottom]);
    }
    rs.sort((a, b) => a[0] - b[0]);
    let count = 0, last = -1e9;
    for (const [t, b] of rs) { if (t >= last - 2) { count++; last = b; } else last = Math.max(last, b); }
    return count;
  };
  // horizontal extent of the label's glyphs (to catch nowrap labels spilling out of the box)
  const extent = el => {
    let l = 1e9, r = -1e9;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) if (q.width > 0.5) { l = Math.min(l, q.left); r = Math.max(r, q.right); }
    }
    return [l, r];
  };
  const C = '.menu_button, .menu_button_icon, .right_menu_button, .qr--button, button, input[type=button], input[type=submit], input[type=reset]';
  const seen = new Set(), bad = [];
  let n = 0;
  for (const e of scope.querySelectorAll(C)) {
    if (seen.has(e)) continue; seen.add(e);
    if (e.closest('#chat .mes_text') || !vis(e)) continue;
    const r = e.getBoundingClientRect();
    // A customizable select's first button is UA-inert, not an independent capsule.
    // Check its actual chosen-content clipping rather than Range glyph extents (which
    // deliberately include the hidden tail of an ellipsized selected value).
    const select = e.parentElement, chosen = e.querySelector(':scope > selectedcontent');
    if (e.tagName === 'BUTTON' && select?.matches('select:not([multiple]):not([size])') && select.firstElementChild === e && chosen && getComputedStyle(select).appearance === 'base-select') {
      const c = getComputedStyle(chosen), q = chosen.getBoundingClientRect(), s = select.getBoundingClientRect();
      const valid = e.tabIndex === -1 && c.whiteSpace === 'nowrap' && c.textOverflow === 'ellipsis' && c.overflowX === 'hidden'
        && chosen.scrollHeight <= chosen.clientHeight + 1 && q.left >= s.left && q.right <= s.right && q.top >= s.top && q.bottom <= s.bottom;
      if (!valid) bad.push({ sel: sel(e), why: 'invalid-selectedcontent', w: r.width, h: r.height });
      continue;
    }
    if (!onScreen(r) && !e.closest('.drawer-content, .inline-drawer-content, #right-nav-panel, #left-nav-panel')) continue;
    const txt = (e.tagName === 'INPUT' ? e.value : e.innerText || '').replace(/\s+/g, ' ').trim();
    if ([...txt].length < 2) continue;
    // nested candidates (a <button> inside .menu_button): judge the outer one only
    if (e.parentElement && e.parentElement.closest(C) && scope.contains(e.parentElement.closest(C))) continue;
    n++;
    const cs = getComputedStyle(e);
    const ln = e.tagName === 'INPUT' ? 1 : lines(e);
    // label not rendered (hover-only labels at opacity 0, max-width 0): an icon button
    if (ln === 0) { n--; continue; }
    const why = [];
    // "wrapped" = the visible label occupies >= 2 line boxes (counted from the text's
    // client rects). Same intent as "content height >= 2 line heights", without flagging
    // fixed-height capsules whose box is taller than two of their (small) line heights.
    if (ln >= 2) why.push('wrap');
    if (r.height > r.width * 1.05) why.push('tall');
    if (e.scrollWidth > e.clientWidth + 1 && /(hidden|clip)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis') why.push('clip');
    if (e.tagName !== 'INPUT') { const [l, rr] = extent(e); if (l < r.left - 1 || rr > r.right + 1) why.push('spill'); }
    if (why.length) bad.push({ sel: sel(e), txt: txt.slice(0, 16), w: Math.round(r.width), h: Math.round(r.height), lines: ln, rad: cs.borderTopLeftRadius, ws: cs.whiteSpace, why: why.join('+') });
  }
  return JSON.stringify({ root: root || 'body', n, bad });
}
