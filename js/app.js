/* Scout Room: app shell, storage, and views. */
(() => {
  'use strict';
  const E = Engine;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const LS_KEY = 'positiespel.state.v1';
  const fmt = E.fmtMoney;

  /* ---------------------------------------------------------------- state */
  const defaultCareer = () => ({
    id: uid(), name: 'My career', clubId: 'brighton-hove-albion', now: { type: 'Summer', year: 2026 },
    formation: '3-2-3-2', budget: 60, wageCap: 150, markup: 1.2, realism: 0.8,
    weights: { fit: 50, will: 30, lore: 20 }, incumbents: {}, squad: [], sold: [], bought: [], out: [], windows: [], watchlist: [],
  });
  function defaults() {
    const c = defaultCareer();
    return { v: 2, savedAt: 0, careers: [c], activeId: c.id, customProfiles: {}, hidden: [], ui: { f3: 1, tab: 'home', pos: 'LINEUP', sort: 'total', q: '', minOvr: 70, minPot: 0, maxPrice: 0, nat: '', contract: 'any', maxAge: 40, hideUnlikely: false, oop: false, affordable: false, limit: 48, view: 'list', drawer: null, squadSlot: null, loreId: null, loreQ: '' } };
  }
  function adopt(o) {
    const d = defaults(); const s = Object.assign(d, o, { ui: Object.assign(d.ui, o.ui || {}) });
    if (s.ui.tab === 'targets') s.ui.tab = 'market';
    if (!s.ui.pos || s.ui.pos === 'ALL') s.ui.pos = 'LINEUP';
    if (!s.ui.f3) { s.ui.f3 = 1; s.ui.minOvr = 70; }
    s.careers.forEach(c => { if (!E.FORMATIONS[c.formation]) c.formation = '3-2-3-2'; if (!c.squad) c.squad = []; if (!c.sold) c.sold = []; if (!c.bought) c.bought = []; if (!c.out) c.out = []; });
    return s;
  }
  let S = defaults();
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { const o = JSON.parse(raw); if (o && o.careers && o.careers.length) S = adopt(o); } } catch (e) { /* storage unavailable */ }

  let DB = [];
  let DEMO = false;
  let cloud = { status: 'checking', ref: null };
  const career = () => S.careers.find(c => c.id === S.activeId) || S.careers[0];

  /* ------------------------------------------------------------- storage */
  let saveTimer = null;
  function save() {
    S.savedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const json = JSON.stringify(S);
      try { localStorage.setItem(LS_KEY, json); } catch (e) { /* ignore */ }
      if (cloud.ref) {
        try { await cloud.ref.set({ json, savedAt: S.savedAt }); cloud.status = 'synced'; } catch (e) { cloud.status = 'local'; }
        renderHeader();
      }
    }, 900);
  }
  async function initCloud() {
    try {
      if (typeof claude === 'undefined' || !claude.use) { cloud.status = 'local'; return renderHeader(); }
      const [user, db] = await Promise.all([claude.use('user'), claude.use('db')]);
      if (!user || !db) { cloud.status = 'local'; return renderHeader(); }
      const id = await user.id();
      cloud.ref = db.collection('data/users/' + id).doc('positiespel');
      const snap = await cloud.ref.get();
      const data = snap && (typeof snap.data === 'function' ? snap.data() : (snap.data !== undefined ? snap.data : snap));
      if (data && data.json) {
        const remote = JSON.parse(data.json);
        if (remote && remote.careers && (remote.savedAt || 0) > (S.savedAt || 0)) {
          S = adopt(remote);
          try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
        }
      }
      cloud.status = 'synced'; renderAll();
    } catch (e) { cloud.status = 'local'; renderHeader(); }
  }

  const idb = {
    open() { return new Promise((res, rej) => { try { const r = indexedDB.open('positiespel', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
    async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
    async del(k) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  };
  async function loadPlayers() {
    try { const v = await idb.get('players'); if (v && v.length) { DB = v; DEMO = false; return; } } catch (e) { /* no idb */ }
    DB = makeDemo(); DEMO = true;
  }
  async function persistPlayers() { try { await idb.set('players', DB); return true; } catch (e) { return false; } }

  /* --------------------------------------------------------- profile data */
  function allProfiles() {
    const map = {};
    BUILTIN_CLUBS.forEach(c => { if (!S.hidden.includes(c.id)) map[c.id] = c; });
    Object.values(S.customProfiles).forEach(c => { map[c.id] = c; });
    return Object.values(map).sort((a, b) => (a.league + a.name).localeCompare(b.league + b.name));
  }
  const getProfile = id => S.customProfiles[id] || BUILTIN_CLUBS.find(c => c.id === id) || null;
  let clubCache = null;
  function lookupClub(name) {
    const k = E.norm(name); if (!k) return null;
    if (!clubCache) clubCache = new Map();
    if (clubCache.has(k)) return clubCache.get(k);
    const ps = allProfiles(); let hit = ps.find(p => E.norm(p.name) === k);
    if (!hit) {
      const cands = ps.filter(p => { const pk = E.norm(p.name); return pk.length >= 6 && (k.includes(pk) || (k.length >= 6 && pk.includes(k))); });
      cands.sort((a, b) => E.norm(b.name).length - E.norm(a.name).length); hit = cands[0] || null;
    }
    clubCache.set(k, hit); return hit;
  }

  /* ------------------------------------------------------------- context */
  const formation = () => E.FORMATIONS[career().formation] || E.FORMATIONS['3-2-3-2'];
  const slotAny = id => formation().slots.find(s => s.id === id) || E.posSlot(id);
  const ownKeys = () => new Set(career().squad || []);
  const hiddenKeys = () => { const c = career(); return new Set([...(c.squad || []), ...(c.sold || []).map(x => x.key)]); };
  function ownPlayers() { const k = ownKeys(); return k.size ? DB.filter(p => k.has(p.key) && p.ovr != null) : []; }
  function passesFloor(p, ctx) {
    const u = S.ui;
    if (u.minOvr && p.ovr < u.minOvr) return false;
    if (u.minPot && (p.pot == null || p.pot < u.minPot)) return false;
    if (u.maxAge && p.age != null && p.age > u.maxAge) return false;
    if (u.nat && !E.norm(p.nationality).includes(E.norm(u.nat))) return false;
    if (u.contract === 'free' && !p.free) return false;
    if (u.contract === 'expiring' && (p.free || p.contractEnd == null || p.contractEnd > ctx.seasonEnd)) return false;
    if (u.maxPrice && !p.free && p.value != null && p.value * ctx.markup > u.maxPrice * 1e6) return false;
    return true;
  }
  function buildCtx() {
    const c = career(); const prof = getProfile(c.clubId);
    const pullInfo = E.clubPull(prof, c.windows);
    const seasonEnd = c.now.type === 'Summer' ? c.now.year + 1 : c.now.year;
    return {
      profile: prof, pull: pullInfo.pull, pullInfo, lookupClub, realism: c.realism, wageCap: c.wageCap * 1e3, budget: c.budget * 1e6, markup: c.markup, seasonEnd,
      incumbentFor: slot => {
        if (c.incumbents[slot.id]) return c.incumbents[slot.id];
        let best = 0; ownPlayers().forEach(p => { const f = E.posFactor(p, slot); if (f > 0) best = Math.max(best, p.ovr * Math.min(1, f)); });
        return best ? Math.round(best) : null;
      },
      weights: c.weights, oop: S.ui.oop,
    };
  }
  function candidateSlots(pos) {
    if (pos === 'LINEUP') return formation().slots;
    if (pos === 'ANY') return E.POSITIONS.map(E.posSlot);
    return [E.posSlot(pos)];
  }

  /** Rank the player pool. opts.pos overrides the position filter, opts.raw skips the filter bar. */
  function rank(opts = {}) {
    const ctx = buildCtx(); const u = S.ui; const raw = !!opts.raw; const q = raw ? '' : E.norm(u.q);
    const cand = candidateSlots(opts.pos || u.pos);
    const out = []; const own = hiddenKeys();
    for (const p of DB) {
      if (p.ovr == null || own.has(p.key)) continue;
      if (!passesFloor(p, ctx)) continue;
      if (!raw) {
        if (q && !(E.norm(p.name).includes(q) || E.norm(p.club).includes(q) || E.norm(p.nationality).includes(q))) continue;
      }
      let best = null;
      for (const s of cand) {
        if (!(raw ? false : u.oop) && !E.posFactor(p, s)) continue;
        const ev = E.evaluate(p, s, ctx);
        if (!best || ev.total > best.total) best = ev;
      }
      if (!best) continue;
      if (!raw && u.hideUnlikely && best.will < 35) continue;
      if (!raw && u.affordable && best.willInfo.over) continue;
      out.push({ p, ev: best });
    }
    const key = { total: r => r.ev.total, fit: r => r.ev.fit, will: r => r.ev.will, lore: r => r.ev.lore, ovr: r => r.p.ovr }[raw ? 'total' : u.sort] || (r => r.ev.total);
    out.sort((a, b) => key(b) - key(a) || b.p.ovr - a.p.ovr);
    return { rows: out, ctx };
  }

  /* --------------------------------------------------------- shared bits */
  const ISO3 = { england: 'ENG', france: 'FRA', germany: 'GER', spain: 'ESP', italy: 'ITA', portugal: 'POR', netherlands: 'NED', belgium: 'BEL', brazil: 'BRA', argentina: 'ARG', norway: 'NOR', sweden: 'SWE', denmark: 'DEN', switzerland: 'SUI', austria: 'AUT', croatia: 'CRO', serbia: 'SRB', poland: 'POL', turkey: 'TUR', uruguay: 'URU', colombia: 'COL', ecuador: 'ECU', mexico: 'MEX', usa: 'USA', canada: 'CAN', japan: 'JPN', southkorea: 'KOR', morocco: 'MAR', senegal: 'SEN', nigeria: 'NGA', ghana: 'GHA', ivorycoast: 'CIV', egypt: 'EGY', cameroon: 'CMR', algeria: 'ALG', scotland: 'SCO', wales: 'WAL', ireland: 'IRL', republicofireland: 'IRL', czechrepublic: 'CZE', ukraine: 'UKR', hungary: 'HUN', slovenia: 'SVN', slovakia: 'SVK', greece: 'GRE', finland: 'FIN', iceland: 'ISL', paraguay: 'PAR', chile: 'CHI', peru: 'PER', venezuela: 'VEN', australia: 'AUS', georgia: 'GEO', albania: 'ALB', kosovo: 'KOS', romania: 'ROU', bulgaria: 'BUL', mali: 'MLI', guinea: 'GUI', tunisia: 'TUN', drcongo: 'COD', northernireland: 'NIR', bosniaandherzegovina: 'BIH', northmacedonia: 'MKD', montenegro: 'MNE', israel: 'ISR', jamaica: 'JAM', iran: 'IRN', china: 'CHN', saudiarabia: 'KSA', uzbekistan: 'UZB', armenia: 'ARM' };
  const nat3 = n => n ? (ISO3[E.natKey(n)] || n.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()) : '';
  const tierOf = o => o >= 85 ? 'elite' : o >= 78 ? 'gold' : o >= 70 ? 'silver' : 'bronze';
  const initials = n => n.replace(/^Demo\s+/, '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const shortName = n => { if (n.length <= 15) return n; const w = n.split(/\s+/); return w.length > 1 ? w[0][0] + '. ' + w.slice(1).join(' ') : n; };
  const willClass = l => ({ Likely: 'good', Possible: 'ok', Reach: 'warn', Unlikely: 'bad' }[l]);
  const meter = (v, cls) => `<span class="meter ${cls || ''}" role="img" aria-label="${v} of 100"><i style="width:${E.clamp(v)}%"></i><b>${v}</b></span>`;

  function card(r) {
    const p = r.p, e = r.ev;
    return `<article class="pc ${tierOf(p.ovr)}" data-act="open" data-v="${esc(p.key)}" tabindex="0" aria-label="${esc(p.name)}, ${p.ovr} overall">
      <div class="pc-top"><b class="pc-ovr">${p.ovr}</b><span class="pc-pos">${esc(p.positions[0] || '?')}</span><span class="pc-nat">${esc(nat3(p.nationality))}</span></div>
      <div class="pc-art" aria-hidden="true"><span>${esc(initials(p.name))}</span></div>
      <h3 class="pc-name">${esc(shortName(p.name))}</h3>
      <p class="pc-club">${esc(p.club || 'Free agent')} · ${p.age ?? '?'}</p>
      <div class="pc-scores"><span><i>Fit</i>${e.fit}</span><span><i>Sign</i>${e.will}</span><span><i>Lore</i>${e.lore}</span></div>
      <div class="pc-foot"><span>${p.free ? 'Free' : fmt(e.willInfo.price)}</span><span class="lbl ${willClass(e.willInfo.label)}">${e.willInfo.label}</span></div>
    </article>`;
  }

  const tabs = [['home', 'Home'], ['market', 'Market'], ['squad', 'Squad'], ['club', 'Club'], ['lore', 'Lore'], ['watch', 'Watchlist'], ['data', 'Data']];

  function renderHeader() {
    const c = career(); const prof = getProfile(c.clubId); const ctx = buildCtx();
    const sync = cloud.status === 'synced' ? ['synced', 'Saved to your account'] : (cloud.status === 'checking' ? ['', 'Checking save'] : ['local', 'Saved in this browser']);
    $('#hdr').innerHTML = `
      <div class="bar-in">
        <a class="brand" href="#home" data-act="tab" data-v="home"><span class="mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M3 27 L9 6 L16 20 L23 6 L29 27" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/></svg></span><span class="bn">Scout<em>Room</em></span></a>
        <nav class="tabs" aria-label="Sections">${tabs.map(([k, l]) => `<a href="#${k}" class="${S.ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</a>`).join('')}</nav>
        <div class="vitals">
          <span class="vit"><em>${esc(c.now.type)} ${c.now.year}</em><strong>${esc(prof ? prof.name : 'Pick a club')}</strong></span>
          <span class="vit pull"><em>Pull</em><strong>${ctx.pull}</strong></span>
          ${DEMO ? '<span class="vit demo"><em>Data</em><strong>Demo</strong></span>' : `<span class="vit"><em>Players</em><strong>${DB.length.toLocaleString()}</strong></span>`}
          <span class="sync ${sync[0]}" title="${sync[1]}"></span>
        </div>
      </div>`;
  }

  /* ----------------------------------------------------------------- Home */
  function bestXI(ctx) {
    const slots = formation().slots; const used = new Set(); const res = {}; const own = hiddenKeys();
    const order = [...slots].sort((a, b) => (a.pos === 'GK' ? -1 : 0) - (b.pos === 'GK' ? -1 : 0));
    order.forEach(s => {
      let best = null;
      for (const p of DB) {
        if (used.has(p.key) || p.ovr == null || own.has(p.key) || !passesFloor(p, ctx)) continue;
        if (!E.posFactor(p, s)) continue;
        const ev = E.evaluate(p, s, ctx);
        if (ev.will < 40) continue;
        if (!best || ev.total > best.ev.total) best = { p, ev };
      }
      if (best) { used.add(best.p.key); res[s.id] = best; }
    });
    return res;
  }

  function pitchSVG(xi, selected, opts = {}) {
    const f = formation(); const c = career(); const pctx = buildCtx();
    const mpath = f.m.length ? f.m.map(id => f.slots.find(s => s.id === id)).filter(Boolean).map(s => `${s.x * 3.6},${s.y * 4.8}`).join(' ') : '';
    return `<svg viewBox="0 0 360 480" class="pitch" role="img" aria-label="Formation ${esc(f.label)}">
      <defs><linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10261f"/><stop offset="1" stop-color="#0b1a16"/></linearGradient></defs>
      <rect x="2" y="2" width="356" height="476" rx="10" fill="url(#grass)" class="pf"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="2" y="${2 + i * 79.3}" width="356" height="39.6" class="stripe"/>`).join('')}
      <line x1="2" y1="240" x2="358" y2="240" class="pl"/><circle cx="180" cy="240" r="40" class="pl nofill"/>
      <rect x="86" y="2" width="188" height="62" class="pl nofill"/><rect x="86" y="416" width="188" height="62" class="pl nofill"/>
      ${mpath ? `<polyline points="${mpath}" class="mline"/>` : ''}
      ${f.slots.map(s => {
      const r = xi && xi[s.id]; const inc = pctx.incumbentFor(s); const on = selected === s.id;
      const top = r ? r.p.ovr : (inc || '');
      const label = r ? shortName(r.p.name).split(' ').slice(-1)[0].slice(0, 11) : s.pos;
      return `<g class="node ${on ? 'on' : ''} ${r ? 'filled' : ''}" ${opts.click ? `data-act="${opts.click}" data-v="${s.id}" tabindex="0"` : ''} transform="translate(${s.x * 3.6},${s.y * 4.8})">
          <circle r="21"/><text y="${r ? 4 : -1}" class="t1">${r ? top : s.pos}</text>${r ? '' : `<text y="12" class="t2">${inc ? inc : 'set'}</text>`}
          ${r ? `<text y="35" class="t3">${esc(label)}</text><text y="-26" class="t4">${s.pos}</text>` : ''}</g>`;
    }).join('')}
    </svg>`;
  }

  function viewHome() {
    const c = career(); const prof = getProfile(c.clubId); const ctx = buildCtx(); const u = S.ui;
    const all = rank({ pos: 'LINEUP', raw: true }).rows; const own = ownPlayers();
    const xi = bestXI(ctx); const slots = formation().slots;
    const filled = slots.filter(s => xi[s.id]).length;
    const word = ctx.pull >= 85 ? 'Almost any player will take your call.' : ctx.pull >= 70 ? 'Strong enough to pull most targets, with a few stars out of reach.' : ctx.pull >= 55 ? 'You can sign solid players, so aim at the right fit rather than the biggest name.' : 'Expect to win on fit and free agents. Stars will say no for now.';
    const gaps = slots.map(s => { const inc = ctx.incumbentFor(s); const x = xi[s.id]; return x && inc ? { s, x, d: x.p.ovr - inc } : null; }).filter(g => g && g.d >= 2).sort((a, b) => b.d - a.d).slice(0, 4);
    const rails = [
      { t: 'Built for your system', s: 'Best fit for the lineup that you can realistically sign', rows: all.filter(r => r.ev.will >= 55).sort((a, b) => b.ev.fit - a.ev.fit) },
      { t: 'Ready to sign', s: 'They want to come. Ranked by total score', rows: all.filter(r => r.ev.will >= 75) },
      { t: 'Free agents', s: 'No fee, only wages', rows: all.filter(r => r.p.free) },
      { t: 'Value picks', s: 'Good fit for under half your budget', rows: all.filter(r => !r.p.free && r.ev.willInfo.price != null && r.ev.willInfo.price <= ctx.budget * 0.5 && r.ev.will >= 55 && r.ev.fit >= 55).sort((a, b) => b.ev.fit - a.ev.fit) },
      { t: 'Wonderkids', s: '21 or younger, highest potential first', rows: all.filter(r => r.p.age != null && r.p.age <= 21).sort((a, b) => (b.p.pot || 0) - (a.p.pot || 0)) },
      { t: 'Contracts running out', s: 'Cheaper now, free next summer', rows: all.filter(r => !r.p.free && r.p.contractEnd != null && r.p.contractEnd <= ctx.seasonEnd) },
    ].filter(r => r.rows.length);
    return `
    ${DEMO ? `<div class="banner"><div><strong>You are looking at demo players.</strong> They are made up so you can try everything. Load your SoFIFA scan to see real names.</div><a class="btn primary" href="#data" data-act="tab" data-v="data">Load real players</a></div>` : ''}
    <section class="quick"><span class="lab">Show players</span>
      ${[60, 65, 70, 75, 80, 85].map(n => `<button class="pill ${u.minOvr === n ? 'on' : ''}" data-act="ovr" data-v="${n}">${n}+</button>`).join('')}
      <span class="lab sp">Age</span>
      ${[[40, 'Any'], [30, 'Under 31'], [25, 'Under 26'], [21, 'Under 22']].map(([n, l]) => `<button class="pill ${u.maxAge === n ? 'on' : ''}" data-act="age" data-v="${n}">${l}</button>`).join('')}
      <a class="link" href="#market" data-act="tab" data-v="market">More filters</a>
      ${own.length ? `<span class="hint">Your ${own.length} players are left out.</span>` : ''}
    </section>
    <section class="hero">
      <div class="hero-l">
        <p class="eyebrow">${esc(c.now.type)} ${c.now.year} window · ${esc(prof ? prof.league : '')}</p>
        <h1>${esc(prof ? prof.name : 'Pick your club')}</h1>
        <p class="lede">Your club pull is <b>${ctx.pull}</b>. ${word}</p>
        <div class="tiles">
          <div class="tile"><em>Club pull</em><b>${ctx.pull}</b></div>
          <div class="tile"><em>Budget</em><b>€${c.budget}M</b></div>
          <div class="tile"><em>Wage cap</em><b>€${c.wageCap}K</b><small>a week</small></div>
          <div class="tile"><em>Pool</em><b>${DB.length.toLocaleString()}</b><small>players</small></div>
        </div>
        <div class="row gap wrap"><a class="btn primary" href="#market" data-act="tab" data-v="market">Open the market</a><a class="btn" href="#club" data-act="tab" data-v="club">Log this window</a></div>
        ${gaps.length ? `<h3 class="mini-h">Biggest upgrades on offer</h3><ul class="gaps">${gaps.map(g => `<li data-act="open" data-v="${esc(g.x.p.key)}" tabindex="0"><b>${g.s.pos}</b><span>${esc(g.x.p.name)}</span><em>+${g.d} OVR</em></li>`).join('')}</ul>` : `<p class="hint">Enter your starters on the Squad tab and the biggest upgrades show up here.</p>`}
      </div>
      <div class="hero-r"><p class="eyebrow">Best realistic ${esc(formation().label)}</p>${pitchSVG(xi, null)}<p class="hint center">${filled} of ${slots.length} slots filled from players who would sign.</p></div>
    </section>
    ${rails.map(r => `<section class="rail"><header><h2>${esc(r.t)}</h2><p>${esc(r.s)}</p></header><div class="rail-row">${r.rows.slice(0, 12).map(card).join('')}</div></section>`).join('')}
    ${!rails.length ? '<section class="panel"><div class="empty"><h3>No players to show yet</h3><p>Load a scan on the Data tab and this page fills with targets.</p></div></section>' : ''}`;
  }

  /* --------------------------------------------------------------- Market */
  function viewMarket() {
    const u = S.ui; const c = career();
    const pp = (id, label) => `<button class="pill ${u.pos === id ? 'on' : ''}" data-act="pos" data-v="${id}">${label || id}</button>`;
    return `
    <section class="panel controls">
      <div class="posbar">
        <div class="pg"><span class="lab">Scope</span>${pp('LINEUP', 'My lineup')}${pp('ANY', 'Any position')}</div>
        ${E.GROUPS.map(([g, arr]) => `<div class="pg"><span class="lab">${g}</span>${arr.map(a => pp(a)).join('')}</div>`).join('')}
      </div>
      <div class="grid4">
        <label>Search<input id="f-q" type="search" value="${esc(u.q)}" placeholder="Name, club or country"></label>
        <label>Min OVR<input id="f-min" type="number" min="0" max="99" value="${u.minOvr || ''}" placeholder="0"></label>
        <label>Min potential<input id="f-pot" type="number" min="0" max="99" value="${u.minPot || ''}" placeholder="0"></label>
        <label>Max age<input id="f-age" type="number" min="15" max="45" value="${u.maxAge || ''}" placeholder="40"></label>
        <label>Max price (€M)<input id="f-price" type="number" min="0" step="1" value="${u.maxPrice || ''}" placeholder="No limit"></label>
        <label>Country<input id="f-nat" type="search" value="${esc(u.nat)}" placeholder="e.g. Portugal"></label>
        <label>Contract<select id="f-con">${[['any', 'Any'], ['free', 'Free agents only'], ['expiring', 'Running out this season']].map(([k, l]) => `<option value="${k}" ${u.contract === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Sort by<select id="f-sort">${[['total', 'Total score'], ['fit', 'System fit'], ['will', 'Willingness'], ['lore', 'Lore'], ['ovr', 'OVR']].map(([k, l]) => `<option value="${k}" ${u.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="row wrap gap between">
        <div class="row wrap gap">
          <label class="chk"><input id="f-unl" type="checkbox" ${u.hideUnlikely ? 'checked' : ''}> Hide unlikely signings</label>
          <label class="chk"><input id="f-aff" type="checkbox" ${u.affordable ? 'checked' : ''}> Only inside my budget</label>
          <label class="chk"><input id="f-oop" type="checkbox" ${u.oop ? 'checked' : ''}> Include players not listed there</label>
        </div>
        <div class="seg" role="group" aria-label="View"><button class="${u.view === 'list' ? 'on' : ''}" data-act="view" data-v="list">List</button><button class="${u.view === 'cards' ? 'on' : ''}" data-act="view" data-v="cards">Cards</button></div>
      </div>
      <div class="weights">
        <span class="lab">Balance</span>
        ${[['fit', 'System fit'], ['will', 'Willingness'], ['lore', 'Lore']].map(([k, l]) => `<label class="w"><span>${l} <b id="wv-${k}">${c.weights[k]}</b></span><input id="w-${k}" type="range" min="0" max="100" step="5" value="${c.weights[k]}"></label>`).join('')}
      </div>
    </section>
    <section class="panel results" id="results"></section>`;
  }

  function renderResults() {
    const box = $('#results'); if (!box) return;
    const { rows } = rank(); const u = S.ui; const shown = rows.slice(0, u.limit);
    if (!rows.length) { box.innerHTML = `<div class="empty"><h3>Nobody matches yet</h3><p>Loosen the filters, try another position, or load more players on the Data tab.</p></div>`; return; }
    const more = `<div class="foot">Showing ${shown.length} of ${rows.length.toLocaleString()}. ${rows.length > shown.length ? '<button class="link" data-act="more">Show more</button>' : ''}</div>`;
    if (u.view === 'cards') { box.innerHTML = `<div class="cardgrid">${shown.map(card).join('')}</div>${more}`; return; }
    box.innerHTML = `
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th class="num">#</th><th>Player</th><th class="num">OVR</th><th>Fit</th><th>Signing</th><th>Lore</th><th class="num">Total</th><th class="num">Price</th><th></th></tr></thead>
        <tbody>${shown.map((r, i) => {
      const p = r.p, e = r.ev; const watched = career().watchlist.some(w => w.key === p.key);
      return `<tr data-act="open" data-v="${esc(p.key)}" tabindex="0">
            <td class="num dim">${i + 1}</td>
            <td><div class="pname">${esc(p.name)}<span class="ptag t-${tierOf(p.ovr)}">${esc(e.slot !== p.positions[0] && u.pos === 'LINEUP' ? e.slot : (p.positions[0] || '?'))}</span></div><div class="psub">${esc(p.positions.join(' · ') || '?')} · age ${p.age ?? '?'} · ${esc(p.club || 'No club')}${p.nationality ? ' · ' + esc(p.nationality) : ''}</div></td>
            <td class="num"><b>${p.ovr}</b><span class="dim">/${p.pot ?? '?'}</span></td>
            <td>${meter(e.fit)}${e.fitInfo.coverage === 0 ? '<span class="tag bad">no stats</span>' : (e.fitInfo.approx ? '<span class="tag">est.</span>' : '')}</td>
            <td>${meter(e.will, willClass(e.willInfo.label))}<span class="lbl ${willClass(e.willInfo.label)}">${e.willInfo.label}</span></td>
            <td>${meter(e.lore, 'lore')}</td>
            <td class="num total">${e.total}</td>
            <td class="num">${p.free ? 'Free' : fmt(e.willInfo.price)}${e.willInfo.over ? '<span class="tag bad">over</span>' : ''}</td>
            <td><button class="star ${watched ? 'on' : ''}" data-act="watch" data-v="${esc(p.key)}" aria-label="${watched ? 'Remove from' : 'Add to'} watchlist">${watched ? '★' : '☆'}</button></td>
          </tr>`;
    }).join('')}</tbody></table></div>${more}`;
  }

  /* --------------------------------------------------------------- Drawer */
  function renderDrawer() {
    const d = $('#drawer'); const dr = S.ui.drawer;
    if (!dr) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = ''; return; }
    const p = DB.find(x => x.key === dr.key) || (career().watchlist.find(w => w.key === dr.key) || {}).snap;
    if (!p) { S.ui.drawer = null; return renderDrawer(); }
    const ctx = buildCtx(); let ev;
    const pos = dr.pos || 'LINEUP';
    const cand = candidateSlots(pos); cand.forEach(s => { const e = E.evaluate(p, s, Object.assign({}, ctx, { oop: true })); if (!ev || e.total > ev.total) ev = e; });
    const slot = slotAny(ev.slot); const role = E.roleOf(slot);
    const topAttrs = Object.entries(role.w).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const nice = k => ({ shortPass: 'Short passing', longPass: 'Long passing', ballControl: 'Ball control', defAwareness: 'Defensive awareness', standTackle: 'Standing tackle', slideTackle: 'Sliding tackle', sprintSpeed: 'Sprint speed', shotPower: 'Shot power', longShots: 'Long shots', gkReflexes: 'GK reflexes', gkDiving: 'GK diving', gkHandling: 'GK handling', gkKicking: 'GK kicking', gkPositioning: 'GK positioning' }[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()));
    const watched = career().watchlist.some(w => w.key === p.key);
    d.setAttribute('aria-hidden', 'false'); d.classList.add('open');
    d.innerHTML = `
      <div class="dr-in">
        <button class="x" data-act="close" aria-label="Close player details">Close</button>
        <div class="dr-card ${tierOf(p.ovr)}"><div><b class="big-ovr">${p.ovr}</b><span class="pc-pos">${esc(p.positions[0] || '?')}</span></div><div><h2>${esc(p.name)}</h2><p>${esc(p.positions.join(' · ') || '?')} · age ${p.age ?? '?'} · ${esc(p.club || 'No club')}${p.nationality ? ' · ' + esc(p.nationality) : ''}</p></div></div>
        <dl class="facts">
          <div><dt>POT</dt><dd>${p.pot ?? '?'}</dd></div><div><dt>Value</dt><dd>${fmt(p.value)}</dd></div><div><dt>Wage</dt><dd>${p.wage != null ? fmt(p.wage) + '/wk' : '-'}</dd></div>
          <div><dt>Clause</dt><dd>${p.release != null ? fmt(p.release) : '-'}</dd></div><div><dt>Contract</dt><dd>${p.free ? 'Free' : (p.contractEnd || '-')}</dd></div><div><dt>Foot</dt><dd>${p.foot || '-'}${p.weak ? ' · WF ' + p.weak : ''}</dd></div>
        </dl>
        <div class="row gap wrap"><button class="btn ${watched ? '' : 'primary'}" data-act="watch" data-v="${esc(p.key)}">${watched ? 'Remove from watchlist' : 'Add to watchlist'}</button>
          <button class="btn" data-act="own" data-v="${esc(p.key)}">${career().squad.includes(p.key) ? 'Remove from my squad' : 'He is in my squad'}</button>
          <label class="inl">Judge as<select id="dr-pos">${[['LINEUP', 'Best slot in my lineup'], ['ANY', 'Best of any position'], ...E.POSITIONS.map(x => [x, x])].map(([k, l]) => `<option value="${k}" ${pos === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        ${career().squad.includes(p.key) ? '' : `<div class="signbox"><label>Signed for (€M)<input id="dr-fee" type="number" min="0" step="0.5" value="${p.free ? 0 : Math.round((ev.willInfo.price || 0) / 1e5) / 10}"></label><button class="btn primary" data-act="sign" data-v="${esc(p.key)}">I signed him</button></div>`}
        <div class="trio">
          <div><em>System fit</em><b>${ev.fit}</b></div><div><em>Signing</em><b class="${willClass(ev.willInfo.label)}">${ev.will}</b><small>${ev.willInfo.label}</small></div><div><em>Lore</em><b>${ev.lore}</b></div><div class="tot"><em>Total</em><b>${ev.total}</b></div>
        </div>
        <section><h3>Fit as ${esc(slot.pos)}: ${esc(role.name)}</h3>
          <ul class="bars">${topAttrs.map(([k]) => { const v = p[k]; return `<li><span>${esc(nice(k))}</span><span class="bar"><i style="width:${v == null ? 0 : v}%"></i></span><b>${v == null ? '-' : v}</b></li>`; }).join('')}</ul>
          ${ev.fitInfo.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}</section>
        <section><h3>Will he sign?</h3><ul class="reasons">${ev.willInfo.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>
        <section><h3>Does he fit the club's story?</h3><ul class="reasons">${ev.loreInfo.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>
      </div>`;
    const cb = d.querySelector('.x'); if (cb && !dr.focused) { cb.focus({ preventScroll: true }); dr.focused = true; }
  }
  const openPlayer = (key, pos) => { S.ui.drawer = { key, pos: pos || 'LINEUP', focused: false }; renderDrawer(); };
  const closeDrawer = () => { S.ui.drawer = null; renderDrawer(); };

  /* ---------------------------------------------------------------- Squad */
  function viewSquad() {
    const c = career(); const f = formation(); const slots = f.slots;
    const sel = S.ui.squadSlot && slots.some(s => s.id === S.ui.squadSlot) ? S.ui.squadSlot : slots[0].id;
    const s = slots.find(x => x.id === sel); const role = E.roleOf(s);
    const { rows } = rank({ pos: 'LINEUP', raw: true });
    const here = rows.filter(r => r.ev.slot === sel).slice(0, 6);
    const ctx = buildCtx(); const top = (() => { const out = []; for (const p of DB) { if (!E.posFactor(p, s)) continue; out.push({ p, ev: E.evaluate(p, s, ctx) }); } return out.sort((a, b) => b.ev.total - a.ev.total).slice(0, 6); })();
    return `
    <div class="split squad">
      <section class="panel">
        <div class="row wrap gap"><label>Formation<select id="s-form">${Object.entries(E.FORMATIONS).map(([k, v]) => `<option value="${k}" ${c.formation === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          <p class="hint grow">${f.m.length ? 'The lit line is the M. Wide players and strikers set its points, the free eight sits in its dip, and the double pivot and back three sit behind so every row has cover.' : 'Click a slot to set your starter and see targets for it.'}</p></div>
        ${pitchSVG(null, sel, { click: 'sq' })}
        <p class="hint">The small number under a position is your current starter's OVR. A player will not sign to sit on the bench, so it feeds the signing score.</p>
      </section>
      <section class="panel">
        <h2>${esc(s.pos)} <span class="sub">${esc(role.name)}</span></h2>
        <label>Your current starter's OVR<input id="s-inc" type="number" min="40" max="99" value="${c.incumbents[s.id] || ''}" placeholder="${ctx.incumbentFor(s) ? 'From your squad: ' + ctx.incumbentFor(s) : 'Leave empty for an open slot'}"></label>
        <h3>What this role looks for</h3>
        <p class="hint">${Object.entries(role.w).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}.</p>
        <h3>Best targets for ${esc(s.pos)}</h3>
        ${top.length ? `<ol class="mini">${top.map(r => `<li data-act="open" data-v="${esc(r.p.key)}" data-pos="${s.id}" tabindex="0"><b>${esc(r.p.name)}</b><span>${r.p.ovr} OVR · ${esc(r.p.club || 'Free agent')} · ${r.ev.willInfo.label}</span><em>${r.ev.total}</em></li>`).join('')}</ol>` : '<p class="hint">Nobody in your data fits this slot yet.</p>'}
      </section>
    </div>
    ${squadPanel()}`;
  }
  function squadPanel() {
    const c = career(); const own = ownPlayers(); const slots = formation().slots; const q = E.norm(S.ui.sqQ || '');
    const hits = q.length < 2 ? [] : DB.filter(p => !c.squad.includes(p.key) && (E.norm(p.name).includes(q) || E.norm(p.club).includes(q))).sort((a, b) => b.ovr - a.ovr).slice(0, 8);
    const slotOf = p => { let b = null, bf = 0; slots.forEach(s => { const f = E.posFactor(p, s); if (f > bf) { bf = f; b = s; } }); return b ? b.pos : '-'; };
    return `<section class="panel squadlist"><h2>Your players</h2>
      <p class="hint">Add the players you already have. Their ratings set who you need to beat at each position, and they are left out of the targets.</p>
      <div class="row gap wrap between"><label class="grow">Add a player by name or club<input id="sq-q" type="search" value="${esc(S.ui.sqQ || '')}" placeholder="Start typing a name"></label>
        <div class="row gap wrap bottomrow"><button class="btn" data-act="sq-club">Add everyone from ${esc((getProfile(c.clubId) || {}).name || 'my club')}</button><button class="btn" data-act="sq-clear" ${own.length ? '' : 'disabled'}>Clear list</button></div></div>
      <div id="sq-msg" class="hint"></div><div id="sq-res" class="sqres">${sqResults(hits)}</div>
      ${own.length ? `<p class="hint">Sell adds the price to your budget and moves him to the sold list, so he is not suggested as a target. Remove only takes him off this list.</p><div class="tablewrap"><table class="tbl small"><thead><tr><th>Player</th><th>Positions</th><th class="num">OVR</th><th class="num">POT</th><th>Plays as</th><th>Injured</th><th>Sell for (€M)</th><th></th></tr></thead><tbody>
        ${own.slice().sort((a, b) => b.ovr - a.ovr).map(p => `<tr><td class="clk" data-act="open" data-v="${esc(p.key)}" tabindex="0"><div class="pname">${esc(p.name)}</div><div class="psub">age ${p.age ?? '?'}</div></td><td>${esc(p.positions.join(' · '))}</td><td class="num"><b>${p.ovr}</b></td><td class="num">${p.pot ?? '-'}</td><td>${slotOf(p)}</td><td><input type="checkbox" class="outbox" data-act="out" data-v="${esc(p.key)}" ${c.out.includes(p.key) ? 'checked' : ''} aria-label="${esc(p.name)} is injured or suspended"></td><td><div class="sellbox"><input class="fee" type="number" min="0" step="0.5" data-fee="${esc(p.key)}" value="${p.value ? Math.round(p.value / 1e5) / 10 : ''}" aria-label="Sale price in millions for ${esc(p.name)}"><button class="btn" data-act="sq-sell" data-v="${esc(p.key)}">Sell</button></div></td><td><button class="link" data-act="sq-rm" data-v="${esc(p.key)}" title="Only take him off this list, no money">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nobody added yet.</p>'}
      ${(c.sold || []).length ? `<h3>Sold</h3><ul class="soldlist">${c.sold.slice().reverse().map(x => `<li><b>${esc(x.name)}</b><span>${x.ovr || ''} OVR · €${x.fee}M · ${esc(x.when)}</span><button class="link" data-act="sq-undo" data-v="${esc(x.key)}">Undo</button><button class="link" data-act="sq-forget" data-v="${esc(x.key)}" title="Keep the sale but allow him as a target again">Allow as target</button></li>`).join('')}</ul>` : ''}
      ${(c.bought || []).length ? `<h3>Signed</h3><ul class="soldlist">${c.bought.slice().reverse().map(x => `<li><b>${esc(x.name)}</b><span>${x.ovr || ''} OVR · €${x.fee}M · ${esc(x.when)}</span><button class="link" data-act="buy-undo" data-v="${esc(x.key)}">Undo</button><span></span></li>`).join('')}</ul>` : ''}</section>
    ${coverPanel()}`;
  }
  /* Best XI from my own players. Injured ones are skipped. */
  function ownXI(excludeOut) {
    const c = career(); const slots = formation().slots; const ctx = buildCtx(); const out = new Set(excludeOut ? c.out : []);
    const pool = ownPlayers().filter(p => !out.has(p.key));
    const score = (p, s) => {
      const f = E.posFactor(p, s); const o = !f; const fit = E.slotFit(p, s, { oop: true }).fit;
      const oa = E.clamp((p.ovr * Math.min(1, f || 0.6) - 55) / 35 * 100);
      return { p, slot: s, fit, ovr: p.ovr, oop: o, sc: 0.5 * oa + 0.5 * fit - (o ? 15 : 0) };
    };
    const order = [...slots].sort((a, b) => (a.pos === 'GK' ? -1 : 0) - (b.pos === 'GK' ? -1 : 0));
    const used = new Set(); const xi = {};
    order.forEach(s => {
      const cand = pool.filter(p => !used.has(p.key) && (s.pos === 'GK') === (p.positions[0] === 'GK')).map(p => score(p, s)).sort((a, b) => b.sc - a.sc);
      if (cand.length && (!cand[0].oop || s.pos !== 'GK')) { xi[s.id] = cand[0]; used.add(cand[0].p.key); }
    });
    return { xi, used, pool, score };
  }
  function coverPanel() {
    const c = career(); const own = ownPlayers(); const slots = formation().slots;
    if (own.length < 2) return `<section class="panel"><h2>Injuries and cover</h2><p class="hint">Add your players above. Then tick Injured on anyone who is out and this shows who steps in and how good the next options are.</p></section>`;
    const base = ownXI(false); const now = ownXI(true);
    const rows = slots.map(s => {
      const b = base.xi[s.id]; const n = now.xi[s.id];
      const bench = now.pool.filter(p => !now.used.has(p.key)).map(p => now.score(p, s)).filter(r => !r.oop).sort((a, b2) => b2.sc - a.sc).slice(0, 3);
      const changed = n && b && n.p.key !== b.p.key;
      const drop = n && b ? b.ovr - n.ovr : null;
      return { s, b, n, bench, changed, drop };
    });
    const outP = own.filter(p => c.out.includes(p.key));
    return `<section class="panel cover"><h2>Injuries and cover</h2>
      <p class="hint">Tick <b>Injured</b> next to a player in the list above. The lineup is rebuilt from the players who are left, and every slot shows the best cover on the bench.${outP.length ? ` Out now: <b>${outP.map(p => esc(p.name)).join(', ')}</b>. <button class="link" data-act="out-clear">Everyone is fit</button>` : ''}</p>
      <div class="tablewrap"><table class="tbl small"><thead><tr><th>Slot</th><th>Plays</th><th class="num">OVR</th><th class="num">Fit</th><th>Best cover on the bench</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.changed ? 'chg' : ''}"><td><b>${r.s.pos}</b></td>
        <td>${r.n ? `<span class="pname">${esc(r.n.p.name)}${r.n.oop ? '<span class="tag bad">out of position</span>' : ''}${r.changed ? '<span class="tag">cover</span>' : ''}</span>` : '<span class="bad">Nobody</span>'}</td>
        <td class="num">${r.n ? r.n.ovr : '-'}${r.changed && r.drop > 0 ? `<small class="bad"> −${r.drop}</small>` : ''}</td><td class="num">${r.n ? Math.round(r.n.fit) : '-'}</td>
        <td>${r.bench.length ? r.bench.map(x => `<span class="chipc" title="Fit ${Math.round(x.fit)}">${esc(shortName(x.p.name))} <i>${x.ovr}</i></span>`).join('') : `<span class="warn">No cover. <a class="link" href="#market" data-act="mk" data-v="${r.s.pos}">Find a ${r.s.pos}</a></span>`}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }
  const sqResults = hits => hits.length ? hits.map(p => `<button class="hit" data-act="sq-add" data-v="${esc(p.key)}"><b>${esc(p.name)}</b><span>${esc(p.positions.join('/'))} · ${p.ovr} OVR · ${esc(p.club || 'No club')}</span></button>`).join('') : '';

  /* ---------------------------------------------------------------- Club */
  function viewClub() {
    const c = career(); const ctx = buildCtx(); const pi = ctx.pullInfo; const prof = getProfile(c.clubId);
    const byLeague = {}; allProfiles().forEach(p => { (byLeague[p.league] = byLeague[p.league] || []).push(p); });
    const euro = ['None', 'Conference League', 'Europa League', 'Champions League'];
    const bar = (l, v, d) => `<div class="pb"><span>${l}</span><span class="bar"><i style="width:${v == null ? 0 : v}%"></i></span><b>${v == null ? 'n/a' : v}</b><small>${d}</small></div>`;
    return `
    <div class="split">
      <section class="panel">
        <h2>Your career</h2>
        <div class="grid2">
          <label>Save name<input id="c-name" value="${esc(c.name)}"></label>
          <label>Club<select id="c-club">${Object.entries(byLeague).map(([lg, ps]) => `<optgroup label="${esc(lg)}">${ps.map(p => `<option value="${p.id}" ${p.id === c.clubId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <label>Transfer window now<select id="c-wtype"><option ${c.now.type === 'Summer' ? 'selected' : ''}>Summer</option><option ${c.now.type === 'Winter' ? 'selected' : ''}>Winter</option></select></label>
          <label>Year<input id="c-wyear" type="number" min="2026" max="2045" value="${c.now.year}"></label>
          <label>Transfer budget (€M)<input id="c-bud" type="number" min="0" step="1" value="${c.budget}"></label>
          <label>Wage cap per player (€K a week)<input id="c-wage" type="number" min="0" step="5" value="${c.wageCap}"></label>
          <label>Asking price over SoFIFA value<select id="c-mark">${[1, 1.1, 1.2, 1.35, 1.5].map(m => `<option value="${m}" ${c.markup === m ? 'selected' : ''}>x${m}</option>`).join('')}</select></label>
          <label>Realism <span class="hint">(how hard club level counts)</span><input id="c-real" type="range" min="0.4" max="1.4" step="0.1" value="${c.realism}"></label>
        </div>
        <div class="row gap wrap"><button class="btn" data-act="career-new">New career</button><button class="btn" data-act="career-del" ${S.careers.length < 2 ? 'disabled' : ''}>Delete this career</button>
          ${S.careers.length > 1 ? `<label class="inl">Switch<select id="c-switch">${S.careers.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}</div>
      </section>
      <aside class="panel">
        <h2>Club pull <span class="big">${pi.pull}</span></h2>
        <p class="hint">How attractive ${esc(prof ? prof.name : 'your club')} looks to a player right now. It drives every signing score.</p>
        ${bar('Prestige', pi.prestige, 'Set in the club profile')}
        ${bar('Recent form', pi.form, pi.form == null ? 'Log a window to count it' : 'Last three windows, newest first')}
        ${bar('Squad level', pi.teamOvr, pi.teamOvr == null ? 'Add your team OVR to a window' : 'Latest team OVR')}
      </aside>
    </div>
    <section class="panel">
      <h2>Window log</h2>
      <p class="hint">Add one row at each transfer window (summer and winter), using what the game shows you then. The newest row counts most.</p>
      <div class="tablewrap"><table class="tbl small"><thead><tr><th>Window</th><th>League place</th><th>Europe</th><th>Cups</th><th>Euro trophy</th><th class="num">Team OVR</th><th class="num">Form</th><th></th></tr></thead><tbody>
      ${c.windows.length ? c.windows.slice().reverse().map(w => `<tr><td>${esc(w.label)}</td><td>${w.leaguePos} of ${w.leagueSize}</td><td>${euro[w.europe || 0]}</td><td>${w.cups || 0}</td><td>${w.euroWon ? 'Yes' : 'No'}</td><td class="num">${w.teamOvr || '-'}</td><td class="num">${Math.round(E.formOne(w))}</td><td><button class="link" data-act="win-del" data-v="${w.id}">Remove</button></td></tr>`).join('') : '<tr><td colspan="8" class="dim">Nothing logged yet. Until you add a window, only club prestige counts.</td></tr>'}
      </tbody></table></div>
      <h3>Add this window</h3>
      <div class="grid6">
        <label>League place<input id="w-pos" type="number" min="1" max="30" value="8"></label>
        <label>Teams in league<input id="w-size" type="number" min="8" max="30" value="${prof && prof.league === 'Bundesliga' ? 18 : 20}"></label>
        <label>Europe this season<select id="w-eu">${euro.map((e, i) => `<option value="${i}">${e}</option>`).join('')}</select></label>
        <label>Domestic cups won<input id="w-cups" type="number" min="0" max="3" value="0"></label>
        <label>Team OVR in game<input id="w-ovr" type="number" min="55" max="92" placeholder="e.g. 79"></label>
        <label class="chk bottom"><input id="w-ew" type="checkbox"> Won a European trophy</label>
      </div>
      <button class="btn primary" data-act="win-add">Log ${esc(c.now.type)} ${c.now.year}</button>
    </section>`;
  }

  /* ----------------------------------------------------------------- Lore */
  const LORE_PROMPT = `Draft a club lore profile for <CLUB> as EA FC 27 would start the career. Reply with one JSON object only, using these keys: name, league, country, prestige (0-100), sources (object of country: weight 0-10), feeders (array of clubs it usually buys from), ties (array of players or managers with a history there), rivals (array of clubs), style (object with youth, veteran, physical, technical, pace, each 0-10), ageIdeal ([min, max]), notes (one or two sentences).`;
  const LEAGUE_PROMPT = `Draft club lore profiles for every club in <LEAGUE> for the <SEASON> season, as EA FC would start the career. Reply with one JSON array only, one object per club, with these keys: name, league, country, prestige (0-100), sources (object of country: weight 0-10, where 10 is the club's classic pipeline), feeders (array of clubs it usually buys from), feederLeagues (array), ties (array of players or managers with a history there), rivals (array of clubs), style (object with youth, veteran, physical, technical, pace, each 0-10), ageIdeal ([min, max]), notes (one or two sentences).`;
  function viewLore() {
    const sel = S.ui.loreId && getProfile(S.ui.loreId) ? S.ui.loreId : career().clubId;
    const prof = getProfile(sel) || allProfiles()[0]; const ps = allProfiles(); const q = E.norm(S.ui.loreQ || '');
    const byLeague = {}; ps.filter(p => !q || E.norm(p.name).includes(q) || E.norm(p.league).includes(q)).forEach(p => { (byLeague[p.league] = byLeague[p.league] || []).push(p); });
    const st = prof.style || {};
    return `
    <div class="split lore">
      <aside class="panel list">
        <label>Find a club<input id="l-q" type="search" value="${esc(S.ui.loreQ || '')}" placeholder="Club or league"></label>
        <div class="scroll">${Object.entries(byLeague).map(([lg, arr]) => `<h4>${esc(lg)}</h4><ul>${arr.map(p => `<li><button class="${p.id === sel ? 'on' : ''}" data-act="lore-pick" data-v="${p.id}">${esc(p.name)}${S.customProfiles[p.id] ? '<i> edited</i>' : ''}</button></li>`).join('')}</ul>`).join('')}</div>
        <button class="btn" data-act="lore-new">Add a club</button>
      </aside>
      <section class="panel editor">
        <h2>${esc(prof.name)}</h2>
        <p class="hint">These are drafts from general knowledge. Change anything that does not match how you see the club. Edits stay in your save.</p>
        <div class="grid2">
          <label>Name<input id="e-name" value="${esc(prof.name)}"></label>
          <label>League<input id="e-league" value="${esc(prof.league)}"></label>
          <label>Country<input id="e-country" value="${esc(prof.country || '')}"></label>
          <label>Prestige (0 to 100)<input id="e-prestige" type="number" min="0" max="100" value="${prof.prestige}"></label>
        </div>
        <label>Where players usually come from <span class="hint">one per line, like "Portugal 10"</span>
          <textarea id="e-sources" rows="6">${esc(Object.entries(prof.sources || {}).map(([k, v]) => k + ' ' + v).join('\n'))}</textarea></label>
        <div class="grid2">
          <label>Clubs it buys from <span class="hint">separate with ;</span><textarea id="e-feeders" rows="3">${esc((prof.feeders || []).join('; '))}</textarea></label>
          <label>Players or managers with a history there<textarea id="e-ties" rows="3">${esc((prof.ties || []).join('; '))}</textarea></label>
          <label>Rivals<textarea id="e-rivals" rows="2">${esc((prof.rivals || []).join('; '))}</textarea></label>
          <label>Leagues it likes to buy from<textarea id="e-fl" rows="2">${esc((prof.feederLeagues || []).join('; '))}</textarea></label>
        </div>
        <h3>Playing identity</h3>
        <div class="grid5">${['youth', 'veteran', 'physical', 'technical', 'pace'].map(k => `<label class="w"><span>${k} <b id="ev-${k}">${st[k] ?? 5}</b></span><input id="e-${k}" type="range" min="0" max="10" value="${st[k] ?? 5}"></label>`).join('')}</div>
        <div class="grid2"><label>Youngest age it signs<input id="e-amin" type="number" min="15" max="40" value="${(prof.ageIdeal || [18, 32])[0]}"></label><label>Oldest age it signs<input id="e-amax" type="number" min="18" max="45" value="${(prof.ageIdeal || [18, 32])[1]}"></label></div>
        <label>Notes<textarea id="e-notes" rows="3">${esc(prof.notes || '')}</textarea></label>
        <div class="row gap wrap"><button class="btn primary" data-act="lore-save" data-v="${esc(prof.id)}">Save changes</button>
          ${prof.builtin && S.customProfiles[prof.id] ? `<button class="btn" data-act="lore-reset" data-v="${prof.id}">Back to the draft</button>` : ''}
          ${!prof.builtin ? `<button class="btn" data-act="lore-del" data-v="${prof.id}">Delete club</button>` : ''}
          <button class="btn" data-act="copy-json" data-v="${prof.id}">Copy this profile as JSON</button></div>
        <div id="lore-msg" class="hint"></div>
        <h3>Paste a draft from Claude</h3>
        <p class="hint">Ask Claude for a club and paste the JSON it sends back. It adds the club or replaces one with the same name.</p>
        <textarea id="e-paste" rows="4" placeholder='{"name": "Lyon", "league": "Ligue 1", ...}'></textarea>
        <div class="row gap wrap"><button class="btn" data-act="lore-paste">Add pasted profile</button><button class="btn" data-act="copy-prompt">Copy the club request template</button><button class="btn" data-act="copy-league-prompt">Copy the whole-league request template</button><button class="btn" data-act="copy-mine">Copy my edited clubs as a league file</button></div>
      </section>
    </div>`;
  }

  /* ------------------------------------------------------------ Watchlist */
  function viewWatch() {
    const c = career(); const ctx = buildCtx();
    if (!c.watchlist.length) return `<section class="panel"><div class="empty"><h3>Your watchlist is empty</h3><p>Star players on the Market. They stay here between windows, and their signing score updates as your club pull changes.</p></div></section>`;
    const rows = c.watchlist.map(w => {
      const p = DB.find(x => x.key === w.key) || w.snap; const slot = slotAny(w.slot);
      return { w, p, ev: E.evaluate(p, slot, Object.assign({}, ctx, { oop: true })) };
    });
    const status = ['Scouting', 'Target', 'Bought', 'Passed'];
    return `<section class="panel"><h2>Watchlist</h2>
      <p class="hint">Players you did not buy stay here. Scores use your club's pull today, and the change since you added them.</p>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Player</th><th>Slot</th><th class="num">OVR</th><th>Fit</th><th>Signing</th><th class="num">Since added</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>
      ${rows.map(({ w, p, ev }) => { const d = ev.will - (w.at ? w.at.will : ev.will); return `<tr>
        <td data-act="open" data-v="${esc(w.key)}" tabindex="0" class="clk"><div class="pname">${esc(p.name)}</div><div class="psub">${esc(p.positions.join('/'))} · ${p.age ?? '?'} · ${esc(p.club || '')}</div></td>
        <td>${esc(w.slot)}</td><td class="num"><b>${p.ovr}</b></td><td>${meter(ev.fit)}</td>
        <td>${meter(ev.will, willClass(ev.willInfo.label))}<span class="lbl ${willClass(ev.willInfo.label)}">${ev.willInfo.label}</span></td>
        <td class="num">${d === 0 ? '0' : (d > 0 ? '+' : '') + d}<small class="dim"> ${esc(w.when || '')}</small></td>
        <td><select data-act="w-status" data-v="${esc(w.key)}" aria-label="Status for ${esc(p.name)}">${status.map(s => `<option ${w.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><input class="note-in" data-act="w-note" data-v="${esc(w.key)}" value="${esc(w.note || '')}" placeholder="Why him" aria-label="Note for ${esc(p.name)}"></td>
        <td><button class="link" data-act="watch" data-v="${esc(w.key)}">Remove</button></td></tr>`; }).join('')}
      </tbody></table></div></section>`;
  }

  /* ----------------------------------------------------------------- Data */
  /* Runs inside sofifa.com (pasted in the console). Reads every page of the current list. */
  function scraper() {
    const tx = e => e.innerText !== undefined ? e.innerText : e.textContent;
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const nameLink = c => [...c.querySelectorAll('a[href*="/player/"]')].find(a => clean(tx(a)));
    const teamLink = c => [...c.querySelectorAll('a[href*="/team/"]')].find(a => clean(tx(a)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function extract(doc) {
      const t = doc.querySelector('table'); if (!t) return null;
      const heads = [...t.querySelectorAll('thead th')].map(h => clean(tx(h)) || h.getAttribute('data-col') || '');
      const rows = [...t.querySelectorAll('tbody tr')]; if (!rows.length) return { cols: [], lines: [] };
      const cols = [];
      [...rows[0].children].forEach((c, i) => {
        if (nameLink(c)) cols.push('Name', 'ID', 'Positions', 'Nationality');
        else if (teamLink(c)) cols.push('Team', 'Contract');
        else cols.push(heads[i] || c.getAttribute('data-col') || 'col' + i);
      });
      const lines = rows.map(r => {
        const line = [];
        [...r.children].forEach(c => {
          const n = nameLink(c), tm = teamLink(c);
          if (n) {
            const id = (n.getAttribute('href').match(/player\/(\d+)/) || [])[1] || '';
            const pos = [...c.querySelectorAll('.pos, span[class*="pos"]')].map(x => clean(tx(x))).filter(Boolean).join(' ');
            const flag = c.querySelector('img.flag, img[class*="flag"]');
            let nm = clean(tx(n)); const pl = pos.split(' ').filter(Boolean);
            for (let k = 0; k < 6; k++) { const hit = pl.find(q => nm.endsWith(q) && nm.length > q.length); if (!hit) break; nm = nm.slice(0, nm.length - hit.length).trim(); }
            line.push(nm, id, pos, flag ? (flag.getAttribute('title') || flag.getAttribute('alt') || '') : '');
          } else if (tm) { const name = clean(tx(tm)); line.push(name, clean(tx(c)).replace(name, '').trim()); }
          else line.push(clean(tx(c)));
        });
        return line;
      });
      return { cols, lines };
    }
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;padding:14px 16px;border-radius:12px;background:#0b111b;color:#e9eef7;font:14px/1.4 system-ui,sans-serif;border:2px solid #c6ff3d;box-shadow:0 10px 40px #000a';
    const say = m => { box.textContent = 'Scout Room: ' + m; };
    document.body.appendChild(box);
    (async () => {
      const first = extract(document);
      if (!first || !first.lines.length) { say('I can not see a player table here. Open a players list first (sofifa.com/players).'); return; }
      if (first.cols.length < 30 && !confirm('Scout Room: this list only shows ' + first.cols.length + ' columns, and none of the player attributes (passing, pace, defending and so on). Without them I can not score system fit.\n\nPress Cancel, then on SoFIFA open the Columns menu, tick every attribute group (plus PlayStyles, Value, Wage and Release clause), let the page reload, and run this again.\n\nPress OK only if you want to read the list anyway.')) { say('stopped. Switch the attribute columns on first (Columns menu), then run it again.'); setTimeout(() => box.remove(), 15000); return; }
      const asked = prompt('How many pages should I read? Each page has ' + first.lines.length + ' players. Type 0 to read the whole list.', '10');
      if (asked === null) { box.remove(); return; }
      const maxPages = +asked > 0 ? +asked : 400;
      const idCol = first.cols.indexOf('ID'); const seen = new Set(); const all = [];
      const add = r => { r.lines.forEach(l => { const id = idCol >= 0 ? l[idCol] : l.join('|'); if (!seen.has(id)) { seen.add(id); all.push(l); } }); };
      add(first);
      const step = first.lines.length; const base = new URL(location.href); const start = +(base.searchParams.get('offset') || 0);
      for (let p = 1; p < maxPages; p++) {
        say('reading page ' + (p + 1) + ' of ' + (maxPages === 400 ? 'all' : maxPages) + '. ' + all.length + ' players so far. Keep this tab open.');
        await sleep(3000 + Math.random() * 3000);
        base.searchParams.set('offset', start + p * step);
        let res; try { res = await fetch(base.href, { credentials: 'include' }); } catch (e) { say('the network stopped me on page ' + (p + 1) + '. Saving what I have.'); break; }
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const r = extract(doc);
        if (!r || !r.lines.length) { say('page ' + (p + 1) + ' had no players (end of list, or SoFIFA asked for a check). Saving what I have.'); await sleep(1500); break; }
        const before = all.length; add(r); if (all.length === before) break;
      }
      const text = [first.cols.join('\t'), ...all.map(l => l.join('\t'))].join('\n');
      const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/tab-separated-values;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'scout_room_players.tsv'; document.body.appendChild(a); a.click(); a.remove();
      try { await navigator.clipboard.writeText(text); } catch (e) { /* download is enough */ }
      say('done, ' + all.length + ' players saved as scout_room_players.tsv in your Downloads. Upload it in Scout Room (Data tab).');
      setTimeout(() => box.remove(), 20000);
    })();
  }
  const SNIPPET = '(' + scraper.toString() + ')();';

  function viewData() {
    const real = DB.filter(p => !p.demo).length;
    return `
    <section class="panel steps">
      <h2>Load your SoFIFA players</h2>
      <p class="hint">Nothing to install. You copy a small script, paste it into SoFIFA in your own Chrome, and it reads the list page by page with a pause between pages. You clear SoFIFA's check yourself, so it never gets blocked.</p>
      <ol class="how">
        <li><b>Copy the script.</b>
          <div class="row gap wrap"><button class="btn primary" data-act="copy-snippet">Copy the script</button><a class="btn" href="https://sofifa.com/players?type=all" target="_blank" rel="noopener">Open SoFIFA</a></div></li>
        <li><b>Set up your list on SoFIFA.</b> Filter it to what you want (a league, a position, an age range, a minimum OVR). Open the <em>Columns</em> menu on SoFIFA and tick <b>every attribute group</b> (crossing, finishing, passing, pace, defending and the rest), plus PlayStyles, Value, Wage and Release clause. Total stats alone is not enough. Wait for the page to reload and check that the table is now much wider. The script reads exactly the columns on screen, and it warns you if the attributes are missing.</li>
        <li><b>Paste it into the console.</b> On that SoFIFA page press <code>F12</code>, open the <em>Console</em> tab, type <code>allow pasting</code> and press Enter (Chrome asks for this once), then paste the script and press Enter. Say how many pages you want. A box in the corner shows progress, and the file lands in your Downloads when it finishes.</li>
        <li><b>Upload the file here.</b> Lists merge, so you can scan one league at a time and upload each file in turn.
          <div class="drop" id="drop"><label class="btn primary file">Choose scout_room_players.tsv<input id="d-file" type="file" accept=".csv,.tsv,.txt"></label><span class="hint">or drop the file onto this box</span></div>
          <div id="d-report" class="report" aria-live="polite"></div></li>
      </ol>
      <details class="alt"><summary>Prefer to paste the text instead of uploading a file</summary>
        <p class="hint">The script also copies the players to your clipboard when it finishes. Paste them here.</p>
        <textarea id="d-paste" rows="5" placeholder="Paste the copied table here"></textarea>
        <button class="btn" data-act="import">Add players</button></details>
      <details class="alt"><summary>See the script before you run it</summary>
        <div class="code"><pre>${esc(SNIPPET)}</pre></div></details>
    </section>
    <div class="split">
      <section class="panel"><h2>Your player data</h2>
        <p>${DEMO ? 'Demo players only. Load a scan to replace them.' : `${real.toLocaleString()} players stored in this browser.`}</p>
        <p class="hint">Player data stays in this browser. Your career, windows, watchlist and club edits are saved to your account when you are signed in.</p>
        <div class="row gap wrap"><button class="btn" data-act="clear-players" ${DEMO ? 'disabled' : ''}>Remove all players</button></div></section>
      <section class="panel"><h2>Backup</h2>
        <p class="hint">Copy everything except the player list, or restore it on another device.</p>
        <div class="row gap wrap"><button class="btn" data-act="backup">Copy backup</button><button class="btn" data-act="restore">Restore from paste</button></div>
        <textarea id="d-backup" rows="3" placeholder="Paste a backup here to restore it"></textarea><div id="d-bmsg" class="hint"></div></section>
    </div>`;
  }

  /* ---------------------------------------------------------- demo players */
  function makeDemo() {
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = a => a[Math.floor(rnd() * a.length)]; const n = (m, sd) => Math.round(m + (rnd() + rnd() + rnd() - 1.5) * sd * 1.6);
    const nations = ['England', 'France', 'Netherlands', 'Germany', 'Spain', 'Portugal', 'Brazil', 'Argentina', 'Belgium', 'Italy', 'Norway', 'Japan'];
    const clubs = ['Ajax', 'Benfica', 'Sporting CP', 'Brighton & Hove Albion', 'Lyon', 'Atalanta', 'Real Sociedad', 'Feyenoord', 'Villarreal', 'Girona', 'Eintracht Frankfurt', 'AS Monaco'];
    const A = {
      GK: { gkReflexes: 80, gkDiving: 78, gkHandling: 76, gkPositioning: 77, gkKicking: 72, reactions: 76, sprintSpeed: 50, acceleration: 50 },
      CB: { defAwareness: 80, interceptions: 78, standTackle: 80, shortPass: 68, longPass: 66, ballControl: 64, composure: 74, sprintSpeed: 68, acceleration: 64, reactions: 74, strength: 78, heading: 78, aggression: 74, vision: 55 },
      FB: { sprintSpeed: 80, acceleration: 80, stamina: 82, crossing: 74, shortPass: 70, defAwareness: 72, standTackle: 72, interceptions: 70, dribbling: 72, ballControl: 72, longPass: 64, reactions: 72, agility: 76, strength: 66 },
      CDM: { shortPass: 78, longPass: 74, ballControl: 76, vision: 70, composure: 74, interceptions: 76, defAwareness: 74, standTackle: 76, stamina: 80, acceleration: 70, sprintSpeed: 70, agility: 70, reactions: 76, strength: 72, dribbling: 72, aggression: 72 },
      CM: { shortPass: 80, longPass: 76, ballControl: 80, vision: 76, dribbling: 76, stamina: 80, interceptions: 68, standTackle: 66, composure: 76, reactions: 76, positioning: 72, acceleration: 72, agility: 74, longShots: 70, strength: 68 },
      CAM: { vision: 80, shortPass: 80, ballControl: 82, dribbling: 80, positioning: 76, composure: 76, finishing: 70, agility: 78, longShots: 72, reactions: 78, acceleration: 74, curve: 70 },
      WIDE: { acceleration: 82, sprintSpeed: 82, dribbling: 80, agility: 82, ballControl: 78, crossing: 72, shortPass: 72, vision: 68, finishing: 70, stamina: 74, composure: 70, positioning: 74, curve: 68 },
      ST: { finishing: 80, positioning: 80, composure: 74, shotPower: 78, reactions: 77, ballControl: 74, acceleration: 74, sprintSpeed: 76, heading: 70, strength: 70, volleys: 72, dribbling: 72, shortPass: 62, vision: 60, agility: 70 },
    };
    const mix = [['GK', 'GK', 6], ['CB', 'CB', 18], ['FB', 'RB', 7], ['FB', 'LB', 7], ['FB', 'RWB', 3], ['FB', 'LWB', 3], ['CDM', 'CDM', 14], ['CM', 'CM', 12], ['CAM', 'CAM', 10], ['WIDE', 'RM', 5], ['WIDE', 'LM', 5], ['WIDE', 'RW', 6], ['WIDE', 'LW', 6], ['ST', 'CF', 4], ['ST', 'ST', 14]];
    const out = []; let i = 0;
    mix.forEach(([arch, pos, cnt]) => {
      for (let k = 0; k < cnt; k++) {
        i++; const p = { demo: true, key: 'demo' + i, id: null, name: `Demo ${pos} ${String(k + 1).padStart(2, '0')}`, age: E.clamp(n(25, 5), 17, 37), club: pick(clubs), nationality: pick(nations), positions: [pos], playstyles: [] };
        if (rnd() < 0.25) p.positions.push(pick(['CM', 'CDM', 'RM', 'LM', 'CAM', 'RB', 'LB'].filter(x => x !== pos)));
        const lvl = n(0, 7); p.ovr = E.clamp(n(77, 5), 62, 90); p.pot = E.clamp(p.ovr + Math.max(0, 28 - p.age) + n(1, 2), p.ovr, 94);
        Object.entries(A[arch]).forEach(([a, v]) => { p[a] = E.clamp(v + (p.ovr - 77) * 1.2 + n(0, 6) + lvl * 0.2, 25, 96); });
        p.foot = rnd() < 0.3 ? 'L' : 'R'; p.weak = 2 + Math.floor(rnd() * 3);
        p.value = Math.round(Math.pow(1.35, p.ovr - 60) * 0.35) * 1e6; p.wage = Math.round(Math.pow(1.3, p.ovr - 60) * 2) * 1e3;
        p.release = p.value * 2; p.contractEnd = 2026 + Math.floor(rnd() * 6);
        if (rnd() < 0.06) { p.free = true; p.contractEnd = null; p.club = ''; }
        if (rnd() < 0.3) p.playstyles = [pick(['tikitaka', 'pressproven', 'intercept', 'quickstep', 'rapid', 'technical', 'clinicalfinisher', 'incisivepass'])];
        out.push(p);
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------- render */
  function renderAll() { clubCache = null; renderHeader(); renderView(); renderDrawer(); }
  function renderView() {
    const t = S.ui.tab; const v = $('#view');
    v.innerHTML = { home: viewHome, market: viewMarket, squad: viewSquad, club: viewClub, lore: viewLore, watch: viewWatch, data: viewData }[t]();
    if (t === 'market') renderResults();
    v.className = 'tab-' + t;
  }
  const setTab = t => { S.ui.tab = t; S.ui.drawer = null; save(); renderAll(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + t); } catch (e) { /* ignore */ } };

  /* ---------------------------------------------------------------- events */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      try { const a = document.createElement('textarea'); a.value = text; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch (e2) { return false; }
    }
  }
  const flash = (el, msg) => { if (el) el.textContent = msg; };

  function addWatch(key) {
    const c = career(); const i = c.watchlist.findIndex(w => w.key === key);
    if (i >= 0) { c.watchlist.splice(i, 1); return; }
    const p = DB.find(x => x.key === key); if (!p) return;
    const ctx = buildCtx(); let best = null;
    const pos = (S.ui.drawer && S.ui.drawer.pos) || S.ui.pos;
    candidateSlots(pos).forEach(s => { const e = E.evaluate(p, s, Object.assign({}, ctx, { oop: true })); if (!best || e.total > best.total) best = e; });
    c.watchlist.push({ key, slot: best.slot, snap: Object.assign({}, p), status: 'Scouting', note: '', when: `${c.now.type} ${c.now.year}`, at: { fit: best.fit, will: best.will, lore: best.lore, total: best.total } });
  }

  function readProfileForm(id) {
    const base = getProfile(id) || {}; const val = s => $(s).value; const sources = {};
    val('#e-sources').split('\n').forEach(l => { const m = l.trim().match(/^(.*?)[\s:]+(\d+(?:\.\d+)?)$/); if (m) sources[m[1].trim()] = +m[2]; });
    const lst = s => val(s).split(/[;\n]/).map(x => x.trim()).filter(Boolean);
    return Object.assign({}, base, {
      id, name: val('#e-name').trim() || base.name, league: val('#e-league').trim(), country: val('#e-country').trim(), prestige: E.clamp(+val('#e-prestige') || 50),
      sources, feeders: lst('#e-feeders'), ties: lst('#e-ties'), rivals: lst('#e-rivals'), feederLeagues: lst('#e-fl'),
      style: { youth: +val('#e-youth'), veteran: +val('#e-veteran'), physical: +val('#e-physical'), technical: +val('#e-technical'), pace: +val('#e-pace') },
      ageIdeal: [+val('#e-amin') || 18, +val('#e-amax') || 35], notes: val('#e-notes'), builtin: base.builtin,
    });
  }
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function normaliseProfile(o) {
    if (!o || typeof o !== 'object' || !o.name) throw new Error('Each profile needs a name.');
    const sources = {};
    if (Array.isArray(o.sources)) o.sources.forEach(s => { if (s && s.country) sources[s.country] = +s.weight || 0; }); else Object.entries(o.sources || {}).forEach(([k, v]) => { sources[k] = +v || 0; });
    const arr = v => Array.isArray(v) ? v.map(String) : String(v || '').split(';').map(x => x.trim()).filter(Boolean);
    const st = o.style || {}; const num = (v, d) => (typeof v === 'number' ? v : d);
    return { id: o.id || slug(o.name), name: String(o.name), league: String(o.league || 'Other'), country: String(o.country || ''), prestige: E.clamp(num(+o.prestige, 55)), sources, feeders: arr(o.feeders), feederLeagues: arr(o.feederLeagues), ties: arr(o.ties), rivals: arr(o.rivals), style: { youth: num(st.youth, 5), veteran: num(st.veteran, 5), physical: num(st.physical, 5), technical: num(st.technical, 5), pace: num(st.pace, 5) }, ageIdeal: Array.isArray(o.ageIdeal) && o.ageIdeal.length === 2 ? o.ageIdeal.map(Number) : [18, 32], notes: String(o.notes || ''), builtin: false };
  }

  document.addEventListener('click', async ev => {
    const t = ev.target.closest('[data-act]'); const ov = ev.target.id === 'scrim';
    if (ov) return closeDrawer();
    if (!t) return;
    const act = t.dataset.act, v = t.dataset.v; const c = career();
    if (t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
    if (act === 'tab') { ev.preventDefault(); return setTab(v); }
    if (act === 'pos') { S.ui.pos = v; S.ui.limit = 48; save(); return renderView(); }
    if (act === 'mk') { ev.preventDefault(); S.ui.pos = v; S.ui.tab = 'market'; save(); return renderAll(); }
    if (act === 'ovr') { S.ui.minOvr = +v; save(); return renderView(); }
    if (act === 'age') { S.ui.maxAge = +v; save(); return renderView(); }
    if (act === 'own') { const i = c.squad.indexOf(v); if (i >= 0) c.squad.splice(i, 1); else c.squad.push(v); save(); renderView(); return renderDrawer(); }
    if (act === 'sq-add') { if (!c.squad.includes(v)) c.squad.push(v); S.ui.sqQ = ''; save(); return renderView(); }
    if (act === 'sign') {
      const p = DB.find(x => x.key === v) || (c.watchlist.find(w => w.key === v) || {}).snap; if (!p) return;
      const inp = document.querySelector('#dr-fee'); const fee = inp && inp.value !== '' ? +inp.value : 0;
      if (!c.squad.includes(v)) c.squad.push(v);
      c.sold = (c.sold || []).filter(x => x.key !== v);
      c.bought.push({ key: v, name: p.name, ovr: p.ovr, fee, when: c.now.type + ' ' + c.now.year });
      c.budget = Math.round((c.budget - fee) * 10) / 10;
      const w = c.watchlist.find(x => x.key === v); if (w) w.status = 'Bought';
      S.ui.drawer = null; save(); return renderAll();
    }
    if (act === 'buy-undo') {
      const i = c.bought.findIndex(x => x.key === v); if (i < 0) return; const x = c.bought.splice(i, 1)[0];
      c.squad = c.squad.filter(k => k !== v); c.out = c.out.filter(k => k !== v); c.budget = Math.round((c.budget + (x.fee || 0)) * 10) / 10;
      const w = c.watchlist.find(y => y.key === v); if (w && w.status === 'Bought') w.status = 'Target'; save(); return renderAll();
    }
    if (act === 'out-clear') { c.out = []; save(); return renderView(); }
    if (act === 'sq-sell') {
      const inp = document.querySelector('[data-fee="' + v.replace(/"/g, '') + '"]'); const p = DB.find(x => x.key === v);
      const fee = inp && inp.value !== '' ? +inp.value : (p && p.value ? Math.round(p.value / 1e5) / 10 : 0);
      c.squad = c.squad.filter(k => k !== v); c.out = c.out.filter(k => k !== v); c.sold = c.sold || [];
      c.sold.push({ key: v, name: p ? p.name : v, ovr: p ? p.ovr : null, fee: fee || 0, when: c.now.type + ' ' + c.now.year });
      c.budget = Math.round((c.budget + (fee || 0)) * 10) / 10; save(); return renderAll();
    }
    if (act === 'sq-undo') {
      const i = c.sold.findIndex(x => x.key === v); if (i < 0) return; const x = c.sold.splice(i, 1)[0];
      if (!c.squad.includes(v)) c.squad.push(v); c.budget = Math.round((c.budget - (x.fee || 0)) * 10) / 10; save(); return renderAll();
    }
    if (act === 'sq-forget') { c.sold = c.sold.filter(x => x.key !== v); save(); return renderView(); }
    if (act === 'sq-rm') { c.squad = c.squad.filter(k => k !== v); c.out = c.out.filter(k => k !== v); save(); return renderView(); }
    if (act === 'sq-club') {
      const prof = getProfile(c.clubId); const k = prof ? E.norm(prof.name) : ''; let n = 0;
      DB.forEach(p => { if (!p.demo && k && E.norm(p.club) === k && !c.squad.includes(p.key)) { c.squad.push(p.key); n++; } });
      save(); renderView(); return flash($('#sq-msg'), n ? 'Added ' + n + ' players.' : 'No players with that club name in your data. Add them by name instead.');
    }
    if (act === 'sq-clear') { c.squad = []; save(); return renderView(); }
    if (act === 'view') { S.ui.view = v; save(); return renderView(); }
    if (act === 'open') { if (ev.target.closest('.star')) return; return openPlayer(v, t.dataset.pos); }
    if (act === 'close') return closeDrawer();
    if (act === 'more') { S.ui.limit += 48; return renderResults(); }
    if (act === 'watch') { ev.stopPropagation(); addWatch(v); save(); renderView(); return renderDrawer(); }
    if (act === 'sq') { S.ui.squadSlot = v; return renderView(); }
    if (act === 'career-new') { const n = defaultCareer(); n.name = 'Career ' + (S.careers.length + 1); n.clubId = c.clubId; S.careers.push(n); S.activeId = n.id; save(); return renderAll(); }
    if (act === 'career-del') { if (S.careers.length < 2) return; S.careers = S.careers.filter(x => x.id !== c.id); S.activeId = S.careers[0].id; save(); return renderAll(); }
    if (act === 'win-add') {
      const g = id => $('#' + id); const size = +g('w-size').value || 20;
      c.windows.push({ id: uid(), label: `${c.now.type} ${c.now.year}`, leaguePos: E.clamp(+g('w-pos').value || 8, 1, size), leagueSize: size, europe: +g('w-eu').value, cups: +g('w-cups').value || 0, euroWon: g('w-ew').checked, teamOvr: +g('w-ovr').value || null });
      save(); return renderAll();
    }
    if (act === 'win-del') { c.windows = c.windows.filter(w => w.id !== v); save(); return renderAll(); }
    if (act === 'lore-pick') { S.ui.loreId = v; return renderView(); }
    if (act === 'lore-new') { const id = 'club-' + uid(); S.customProfiles[id] = normaliseProfile({ id, name: 'New club', league: 'Other', prestige: 55, sources: {}, style: {} }); S.ui.loreId = id; save(); return renderAll(); }
    if (act === 'lore-save') { S.customProfiles[v] = readProfileForm(v); save(); renderAll(); return flash($('#lore-msg'), 'Saved.'); }
    if (act === 'lore-reset') { delete S.customProfiles[v]; save(); return renderAll(); }
    if (act === 'lore-del') { delete S.customProfiles[v]; S.ui.loreId = null; if (c.clubId === v) c.clubId = BUILTIN_CLUBS[0].id; save(); return renderAll(); }
    if (act === 'copy-json') { const p = Object.assign({}, getProfile(v)); delete p.builtin; delete p.id; const ok = await copyText(JSON.stringify(p, null, 2)); return flash($('#lore-msg'), ok ? 'Copied.' : 'Copy was blocked. Select the profile text and copy it by hand.'); }
    if (act === 'copy-prompt') { const ok = await copyText(LORE_PROMPT); return flash($('#lore-msg'), ok ? 'Request template copied. Send it to Claude with the club name filled in.' : LORE_PROMPT); }
    if (act === 'copy-league-prompt') { const ok = await copyText(LEAGUE_PROMPT); return flash($('#lore-msg'), ok ? 'Copied. Give it to any AI with the league and season filled in, then paste the answer below.' : LEAGUE_PROMPT); }
    if (act === 'copy-mine') { const list = Object.values(S.customProfiles).map(p => { const q = Object.assign({}, p); delete q.builtin; return q; }); const ok = await copyText(JSON.stringify(list, null, 2)); return flash($('#lore-msg'), ok ? list.length + ' clubs copied. Save them as a .json file in data/clubs in your repo and add the name to index.json.' : 'Copy blocked.'); }
    if (act === 'lore-paste') {
      try {
        const txt = $('#e-paste').value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim(); const data = JSON.parse(txt); const list = Array.isArray(data) ? data : [data];
        let added = 0, last = null; list.forEach(o => { const p = normaliseProfile(o); S.customProfiles[p.id] = p; last = p.id; added++; });
        S.ui.loreId = last; save(); renderAll(); flash($('#lore-msg'), `Added ${added} club${added === 1 ? '' : 's'}.`);
      } catch (e) { flash($('#lore-msg'), 'That did not read as a profile: ' + e.message); }
      return;
    }
    if (act === 'copy-snippet') { const ok = await copyText(SNIPPET); t.textContent = ok ? 'Copied' : 'Copy blocked, select the text by hand'; return; }
    if (act === 'import') return doImport($('#d-paste').value);
    if (act === 'clear-players') { DB = makeDemo(); DEMO = true; try { await idb.del('players'); } catch (e) { /* ignore */ } return renderAll(); }
    if (act === 'backup') { const ok = await copyText(JSON.stringify(S)); return flash($('#d-bmsg'), ok ? 'Backup copied.' : 'Copy blocked. Your save is also stored in this browser.'); }
    if (act === 'restore') { try { const o = JSON.parse($('#d-backup').value); if (!o.careers) throw new Error('This is not a backup.'); S = adopt(o); save(); renderAll(); flash($('#d-bmsg'), 'Restored.'); } catch (e) { flash($('#d-bmsg'), 'Could not restore: ' + e.message); } return; }
  });

  async function doImport(text) {
    const rep = $('#d-report'); const r = E.parseTable(text);
    if (r.error) { rep.innerHTML = `<p class="bad">${esc(r.error)}</p>`; return; }
    if (DEMO) DB = [];
    const map = new Map(DB.map(p => [p.key, p])); let added = 0, updated = 0;
    r.players.forEach(p => { if (map.has(p.key)) updated++; else added++; map.set(p.key, p); });
    DB = [...map.values()]; DEMO = false; clubCache = null;
    const stored = await persistPlayers();
    const withAttr = r.players.filter(p => E.ATTR_KEYS.filter(k => p[k] != null).length >= 20).length;
    const usable = r.players.filter(p => E.ATTR_KEYS.filter(k => p[k] != null).length >= 10 || E.FACE_KEYS.filter(k => p[k] != null).length >= 4).length;
    const missing = ['name', 'age', 'ovr', 'pot', 'club', 'positions', 'nationality', 'value', 'wage', 'contract'].filter(k => !r.recognized.includes(k));
    const unk = r.unknown.filter(h => !/^col\d+$/.test(h));
    rep.innerHTML = `
      <p class="good"><b>${added} added, ${updated} updated.</b> ${DB.length.toLocaleString()} players are in the bench.${stored ? '' : ' Storage is blocked in this browser, so they will be gone after a reload.'}</p>
      <p>${withAttr} of ${r.players.length} rows carry the full attribute set. ${usable > withAttr ? 'Some rows only have the six face stats, so they are scored from those and marked <em>est.</em>' : ''}</p>
      ${usable < r.players.length ? `<p class="warn">${r.players.length - usable} rows have no attributes at all, so their system fit shows 0. Switch on the attribute columns on SoFIFA and scan again.</p>` : ''}
      <p class="hint">Recognised columns: ${r.recognized.map(esc).join(', ')}.</p>
      ${missing.length ? `<p class="warn">Not found: ${missing.join(', ')}. Scores that rely on these will be softer.</p>` : ''}
      ${unk.length ? `<p class="hint">Ignored columns: ${unk.slice(0, 12).map(esc).join(', ')}${unk.length > 12 ? '…' : ''}.</p>` : ''}
      <p><a class="btn primary" href="#home" data-act="tab" data-v="home">See your players on Home</a></p>`;
    const pt = $('#d-paste'); if (pt) pt.value = ''; renderHeader();
  }

  document.addEventListener('change', ev => {
    const t = ev.target; const id = t.id; const c = career(); const u = S.ui;
    if (id === 'd-file') { const f = t.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => doImport(String(rd.result)); rd.readAsText(f); return; }
    if (id === 'dr-pos') { u.drawer.pos = t.value; return renderDrawer(); }
    if (t.dataset.act === 'out') { const k = t.dataset.v; c.out = c.out.filter(x => x !== k); if (t.checked) c.out.push(k); save(); return renderView(); }
    if (t.dataset.act === 'w-status') { const w = c.watchlist.find(x => x.key === t.dataset.v); if (w) { w.status = t.value; save(); } return; }
    if (t.dataset.act === 'w-note') { const w = c.watchlist.find(x => x.key === t.dataset.v); if (w) { w.note = t.value; save(); } return; }
    const m = {
      'f-min': () => { u.minOvr = +t.value || 0; }, 'f-pot': () => { u.minPot = +t.value || 0; }, 'f-price': () => { u.maxPrice = +t.value || 0; }, 'f-nat': () => { u.nat = t.value.trim(); }, 'f-con': () => { u.contract = t.value; }, 'f-age': () => { u.maxAge = +t.value || 0; }, 'f-sort': () => { u.sort = t.value; },
      'f-unl': () => { u.hideUnlikely = t.checked; }, 'f-aff': () => { u.affordable = t.checked; }, 'f-oop': () => { u.oop = t.checked; },
    };
    if (m[id]) { m[id](); u.limit = 48; save(); return renderResults(); }
    const cm = {
      'c-name': () => { c.name = t.value; }, 'c-club': () => { c.clubId = t.value; }, 'c-wtype': () => { c.now.type = t.value; }, 'c-wyear': () => { c.now.year = +t.value || 2026; },
      'c-bud': () => { c.budget = +t.value || 0; }, 'c-wage': () => { c.wageCap = +t.value || 0; }, 'c-mark': () => { c.markup = +t.value; }, 'c-real': () => { c.realism = +t.value; },
      's-form': () => { c.formation = t.value; u.squadSlot = null; }, 's-inc': () => { const s = u.squadSlot || formation().slots[0].id; if (t.value) c.incumbents[s] = +t.value; else delete c.incumbents[s]; },
    };
    if (cm[id]) { cm[id](); save(); return renderAll(); }
    if (id === 'c-switch') { S.activeId = t.value; save(); return renderAll(); }
  });
  document.addEventListener('input', ev => {
    const t = ev.target; const id = t.id; const c = career();
    if (id === 'f-q') { S.ui.q = t.value; S.ui.limit = 48; clearTimeout(window.__qt); window.__qt = setTimeout(renderResults, 180); return; }
    if (id.startsWith('w-') && ['fit', 'will', 'lore'].includes(id.slice(2))) { const k = id.slice(2); c.weights[k] = +t.value; const b = $('#wv-' + k); if (b) b.textContent = t.value; save(); clearTimeout(window.__wt); window.__wt = setTimeout(renderResults, 120); return; }
    if (id.startsWith('e-') && ['youth', 'veteran', 'physical', 'technical', 'pace'].includes(id.slice(2))) { const b = $('#ev-' + id.slice(2)); if (b) b.textContent = t.value; return; }
    if (id === 'sq-q') { S.ui.sqQ = t.value; const q = E.norm(t.value); const c2 = career(); const hits = q.length < 2 ? [] : DB.filter(p => !c2.squad.includes(p.key) && (E.norm(p.name).includes(q) || E.norm(p.club).includes(q))).sort((a, b) => b.ovr - a.ovr).slice(0, 8); $('#sq-res').innerHTML = sqResults(hits); return; }
    if (id === 'l-q') { S.ui.loreQ = t.value; const pos = t.selectionStart; renderView(); const n = $('#l-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && S.ui.drawer) return closeDrawer();
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-act="open"], [data-act="sq"]')) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  document.addEventListener('dragover', ev => { if (ev.target.closest && ev.target.closest('#drop')) { ev.preventDefault(); ev.target.closest('#drop').classList.add('over'); } });
  document.addEventListener('dragleave', ev => { const d = ev.target.closest && ev.target.closest('#drop'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', ev => {
    const d = ev.target.closest && ev.target.closest('#drop'); if (!d) return; ev.preventDefault(); d.classList.remove('over');
    const f = ev.dataTransfer && ev.dataTransfer.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => doImport(String(rd.result)); rd.readAsText(f);
  });
  window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (tabs.some(([k]) => k === h) && h !== S.ui.tab) { S.ui.tab = h; renderAll(); } });

  /* Each league is its own file under data/clubs. index.json lists them. */
  async function loadClubFiles() {
    const get = async u => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error('Could not read ' + u + ' (' + r.status + ').'); return r.json(); };
    const idx = await get('data/clubs/index.json'); const out = [];
    for (const f of idx.files) { const list = await get('data/clubs/' + f); (Array.isArray(list) ? list : [list]).forEach(o => { try { const p = normaliseProfile(o); p.builtin = true; out.push(p); } catch (e) { console.warn(f, e.message); } }); }
    if (!out.length) throw new Error('data/clubs/index.json lists no clubs.');
    return out;
  }

  /* ------------------------------------------------------------------ boot */
  (async () => {
    const h = location.hash.replace('#', ''); if (tabs.some(([k]) => k === h)) S.ui.tab = h;
    S.ui.drawer = null;
    if (typeof BUILTIN_CLUBS === 'undefined') {
      try { window.BUILTIN_CLUBS = await loadClubFiles(); } catch (e) {
        window.BUILTIN_CLUBS = [];
        $('#view').innerHTML = `<section class="panel"><div class="empty"><h3>The club files did not load</h3><p>${esc(e.message)}</p><p class="hint">If you opened index.html straight from a folder, the browser blocks reading the data folder. Use the GitHub Pages link, or run a local server in this folder (for example <code>python -m http.server</code>) and open http://localhost:8000.</p></div></section>`;
        return;
      }
    }
    if (!getProfile(career().clubId)) career().clubId = BUILTIN_CLUBS[0].id;
    await loadPlayers();
    renderAll();
    initCloud();
  })();
  window.__bench = { get S() { return S; }, get DB() { return DB; }, rank, buildCtx, doImport, bestXI };
})();
