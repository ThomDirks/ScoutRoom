/* Positiespel Bench: scoring engine. Pure functions, no DOM. */
const Engine = (() => {
  const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  /* Club names differ between SoFIFA ("SSC Napoli", "1. FSV Mainz 05") and our profiles ("Napoli"). Compare on a stripped key. */
  const CLUB_NOISE = new Set(['fc', 'afc', 'cf', 'sc', 'ssc', 'ss', 'as', 'ac', 'us', 'sv', 'vfb', 'vfl', 'fsv', 'tsg', 'rb', 'bc', 'calcio', 'club', '1', '1899', 'de', 'cd', 'ud', 'cfc']);
  const CLUB_ALIAS = { intermilan: 'inter', internazionale: 'inter', bayernmunchen: 'bayern', bayernmunich: 'bayern', hoffenheim: 'hoffenheim', manchesterutd: 'manchesterunited', manutd: 'manchesterunited', spurs: 'tottenhamhotspur', wolves: 'wolverhamptonwanderers', newcastle: 'newcastleunited', westham: 'westhamunited', brighton: 'brightonhovealbion', leeds: 'leedsunited', leicester: 'leicestercity', norwich: 'norwichcity', borussiamgladbach: 'monchengladbach', borussiamonchengladbach: 'monchengladbach', bmgladbach: 'monchengladbach', eintrachtfrankfurt: 'frankfurt', bayerleverkusen: 'leverkusen', bayer04leverkusen: 'leverkusen' };
  const clubKey = s => {
    const w = String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const kept = w.filter(t => !CLUB_NOISE.has(t)); const k = (kept.length ? kept : w).join('');
    return CLUB_ALIAS[k] || k;
  };
  const sameClub = (a, b) => { const x = clubKey(a); return !!x && x === clubKey(b); };
  const avg = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  /* ---------- field aliases for SoFIFA / Kaggle style headers ---------- */
  const ALIASES = {
    name: ['name', 'playername', 'player', 'longname', 'shortname', 'fullname'],
    id: ['id', 'sofifaid', 'playerid'],
    age: ['age'],
    ovr: ['ovr', 'ova', 'overall', 'overallrating'],
    pot: ['pot', 'potential'],
    club: ['team', 'club', 'clubname', 'teamname', 'teamcontract'],
    contract: ['contract', 'contractend', 'contractuntil', 'contractvaliduntil', 'contractexpiry'],
    positions: ['positions', 'position', 'pos', 'bestposition', 'playerpositions', 'preferredpositions'],
    nationality: ['nationality', 'nation', 'country', 'nat'],
    league: ['league', 'leaguename'],
    value: ['value', 'marketvalue', 'valueeur'],
    wage: ['wage', 'wageeur', 'salary'],
    release: ['releaseclause', 'release', 'relclause', 'buyoutclause'],
    foot: ['preferredfoot', 'foot', 'pf'],
    weak: ['weakfoot', 'wf'],
    kit: ['clubkitnumber', 'kitnumber', 'jerseynumber', 'shirtnumber', 'squadnumber', 'kitno'],
    skill: ['skillmoves', 'sm', 'skills'],
    height: ['height'],
    weight: ['weight'],
    playstyles: ['playstyles', 'playstyle', 'specialities'],
    playstylesPlus: ['playstylesplus'],
    crossing: ['crossing', 'cro'],
    finishing: ['finishing', 'fin'],
    heading: ['headingaccuracy', 'heading', 'hea'],
    shortPass: ['shortpassing', 'shortpass'],
    volleys: ['volleys', 'vol'],
    dribbling: ['dribbling'],
    curve: ['curve', 'cur'],
    fkAcc: ['fkaccuracy', 'freekickaccuracy', 'fka'],
    longPass: ['longpassing', 'longpass'],
    ballControl: ['ballcontrol', 'bco'],
    acceleration: ['acceleration', 'acc'],
    sprintSpeed: ['sprintspeed', 'sprint'],
    agility: ['agility', 'agi'],
    reactions: ['reactions', 'rea'],
    balance: ['balance', 'bal'],
    shotPower: ['shotpower', 'pow'],
    jumping: ['jumping', 'jum'],
    stamina: ['stamina', 'sta'],
    strength: ['strength', 'str'],
    longShots: ['longshots', 'los'],
    aggression: ['aggression', 'agg'],
    interceptions: ['interceptions', 'inte', 'int'],
    positioning: ['positioning', 'attposition', 'attackingposition', 'attpos', 'attackposition'],
    vision: ['vision', 'vis'],
    penalties: ['penalties', 'pen'],
    composure: ['composure', 'com'],
    defAwareness: ['defensiveawareness', 'defawareness', 'marking', 'mar'],
    standTackle: ['standingtackle', 'standtackle', 'stt'],
    slideTackle: ['slidingtackle', 'slidetackle', 'slt'],
    gkDiving: ['gkdiving', 'gkdiv'],
    gkHandling: ['gkhandling', 'gkhan'],
    gkKicking: ['gkkicking', 'gkkic', 'kicking'],
    gkPositioning: ['gkpositioning', 'gkpos'],
    gkReflexes: ['gkreflexes', 'gkref', 'reflexes'],
    pac: ['pac', 'pace'],
    sho: ['sho', 'shooting'],
    pas: ['pas', 'passing'],
    drb: ['dri', 'drb'],
    def: ['def', 'defending'],
    phy: ['phy', 'physical'],
  };
  const ALIAS_LOOKUP = {};
  Object.entries(ALIASES).forEach(([k, arr]) => arr.forEach(a => { if (!ALIAS_LOOKUP[a]) ALIAS_LOOKUP[a] = k; }));

  const ATTR_KEYS = ['crossing', 'finishing', 'heading', 'shortPass', 'volleys', 'dribbling', 'curve', 'fkAcc', 'longPass', 'ballControl', 'acceleration', 'sprintSpeed', 'agility', 'reactions', 'balance', 'shotPower', 'jumping', 'stamina', 'strength', 'longShots', 'aggression', 'interceptions', 'positioning', 'vision', 'penalties', 'composure', 'defAwareness', 'standTackle', 'slideTackle', 'gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes'];
  const FACE_KEYS = ['pac', 'sho', 'pas', 'drb', 'def', 'phy'];
  const NUM_KEYS = ['age', 'ovr', 'pot', 'weak', 'skill', 'kit', ...ATTR_KEYS, ...FACE_KEYS];

  const POS_TOKENS = ['GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LAM', 'RAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'LF', 'RF', 'ST', 'LS', 'RS'];
  const POS_FOLD = { LCB: 'CB', RCB: 'CB', LDM: 'CDM', RDM: 'CDM', LCM: 'CM', RCM: 'CM', LAM: 'CAM', RAM: 'CAM', LS: 'ST', RS: 'ST', LF: 'CF', RF: 'CF' };

  /* ---------- parsers ---------- */
  function money(s) {
    if (s == null || s === '') return null;
    if (typeof s === 'number') return s;
    let t = String(s).replace(/,(?=\d{1,2}\s*[MKBmkb]\b)/, '.').replace(/[,\s]/g, '');
    const m = t.match(/([\d.]+)([MKBmkb])?/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (isNaN(v)) return null;
    const u = (m[2] || '').toUpperCase();
    if (u === 'B') v *= 1e9; else if (u === 'M') v *= 1e6; else if (u === 'K') v *= 1e3;
    return v;
  }
  function fmtMoney(v) {
    if (v == null) return '-';
    if (v >= 1e6) return '€' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '€' + Math.round(v / 1e3) + 'K';
    return '€' + Math.round(v);
  }
  function contractInfo(s) {
    const t = String(s || '');
    const yrs = t.match(/20\d\d/g);
    const end = yrs ? +yrs[yrs.length - 1] : null;
    const free = !end && /free/i.test(t);
    return { end, free, loan: /loan/i.test(t) };
  }
  function parsePositions(s) {
    const toks = String(s || '').toUpperCase().split(/[^A-Z]+/).filter(t => POS_TOKENS.includes(t));
    const out = [];
    toks.forEach(t => { const f = POS_FOLD[t] || t; if (!out.includes(f)) out.push(f); });
    return out;
  }
  function parseInt0(s) { const m = String(s == null ? '' : s).match(/-?\d+/); return m ? parseInt(m[0], 10) : null; }
  const PS_VOCAB = new Set(['finesseshot', 'chipshot', 'powershot', 'deadball', 'powerheader', 'precisionheader', 'lowdrivenshot', 'acrobatic', 'gamechanger', 'incisivepass', 'pingedpass', 'longballpass', 'tikitaka', 'whippedpass', 'inventive', 'jockey', 'block', 'intercept', 'anticipate', 'slidetackle', 'bruiser', 'technical', 'rapid', 'flair', 'firsttouch', 'trickster', 'pressproven', 'quickstep', 'relentless', 'trivela', 'longthrow', 'aerialfortress', 'enforcer', 'footwork', 'crossclaimer', 'rushout', 'farthrow', 'farreach', 'deflector', 'earlycrosser', 'longshottaker', 'penaltytaker']);
  /* SoFIFA scans glue the names together with spaces, so match the longest known name at each position. A trailing + means the upgraded version. */
  function parsePlaystyles(cell) {
    const s = String(cell || '').replace(/\(CPU AI\)/gi, ' ');
    if (/[,;|]/.test(s)) return splitList(s).map(x => { const k = norm(x.replace(/\+/g, '')); return PS_VOCAB.has(k) ? k + (/\+/.test(x) ? 'plus' : '') : null; }).filter(Boolean);
    const w = s.replace(/\+/g, ' + ').split(/\s+/).filter(Boolean); const out = [];
    for (let i = 0; i < w.length;) {
      let hit = null, n = 0;
      for (let len = Math.min(4, w.length - i); len >= 1; len--) { const k = norm(w.slice(i, i + len).join('')); if (PS_VOCAB.has(k)) { hit = k; n = len; break; } }
      if (!hit) { i++; continue; }
      i += n; if (w[i] === '+') { out.push(hit + 'plus'); i++; } else out.push(hit);
    }
    return out;
  }
  function splitList(s) { return String(s || '').split(/[,;|]/).map(x => x.trim()).filter(Boolean); }

  const dedupePs = list => { const set = new Set(list); return [...set].filter(x => x.endsWith('plus') || !set.has(x + 'plus')); };

  function csvParse(text, delim) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }

  /** Parse pasted text (TSV from the snippet, or a CSV file) into player objects. */
  function parseTable(text) {
    text = String(text || '').replace(/^﻿/, '').trim();
    if (!text) return { players: [], recognized: [], unknown: [], error: 'Nothing to import yet.' };
    const first = text.split(/\r?\n/)[0];
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = delim === '\t' ? text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t')) : csvParse(text, delim);
    if (rows.length < 2) return { players: [], recognized: [], unknown: [], error: 'The paste needs a header row and at least one player row.' };
    const headers = rows[0].map(h => String(h).trim());
    const map = headers.map(h => (/\+/.test(h) && norm(h) === 'playstyles') ? 'playstylesPlus' : (ALIAS_LOOKUP[norm(h)] || null));
    // a duplicated header keeps its first column
    const seen = new Set();
    map.forEach((k, i) => { if (k) { if (seen.has(k)) map[i] = null; else seen.add(k); } });
    const recognized = [...seen];
    const unknown = headers.filter((h, i) => !map[i] && h);
    const players = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r]; const p = {};
      map.forEach((k, i) => {
        if (!k) return;
        const v = cells[i] == null ? '' : String(cells[i]).trim();
        if (v === '') return;
        if (NUM_KEYS.includes(k)) { const n = parseInt0(v); if (n != null) p[k] = n; }
        else p['_' + k] = v;
      });
      if (!p._name) continue;
      players.push(finishPlayer(p));
    }
    return { players, recognized, unknown, error: players.length ? null : 'No player rows could be read. Check that a Name column is present.' };
  }

  function finishPlayer(p) {
    let name = p._name; let positions = parsePositions(p._positions);
    name = String(name || '').replace(/^\d{1,2}\s+(?=\S)/, '');
    if (!positions.length) {
      const parts = name.split(/\s+/); const found = [];
      while (parts.length > 1 && POS_TOKENS.includes(parts[parts.length - 1].toUpperCase())) found.unshift(parts.pop().toUpperCase());
      if (found.length) { name = parts.join(' '); positions = parsePositions(found.join(' ')); }
    }
    let club = p._club || ''; let contractTxt = p._contract || '';
    if (!contractTxt && /20\d\d|free|loan/i.test(club)) {
      contractTxt = club; club = club.replace(/\s*(on loan|free agent|free|20\d\d.*)$/i, '').trim();
    }
    const ci = contractInfo(contractTxt);
    const out = {
      key: p.id ? 'id' + p.id : norm(name) + '|' + (p.age || '') + '|' + norm(club),
      id: p._id || null, name, age: p.age ?? null, ovr: p.ovr ?? null, pot: p.pot ?? p.ovr ?? null,
      club, nationality: p._nationality || '', league: p._league || '', positions,
      contractEnd: ci.end, free: ci.free, loan: ci.loan,
      value: money(p._value), wage: money(p._wage), release: money(p._release),
      foot: /left/i.test(p._foot || '') ? 'L' : (/right/i.test(p._foot || '') ? 'R' : ''),
      weak: p.weak ?? null, skill: p.skill ?? null,
      playstyles: dedupePs(parsePlaystyles(p._playstyles).concat(parsePlaystyles(p._playstylesPlus))),
    };
    if (p.kit != null && p.kit >= 1 && p.kit <= 99) out.kit = p.kit;
    ATTR_KEYS.concat(FACE_KEYS).forEach(k => { if (p[k] != null) out[k] = p[k]; });
    return out;
  }

  /* ---------- positions, roles and formations ---------- */
  const POSITIONS = ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'CF', 'ST'];
  const GROUPS = [['Goalkeeper', ['GK']], ['Defence', ['RB', 'RWB', 'CB', 'LB', 'LWB']], ['Midfield', ['CDM', 'CM', 'CAM', 'RM', 'LM']], ['Attack', ['RW', 'LW', 'CF', 'ST']]];
  const sideOf = pos => (['RB', 'RWB', 'RM', 'RW'].includes(pos) ? 'R' : (['LB', 'LWB', 'LM', 'LW'].includes(pos) ? 'L' : null));
  const mirrorTok = t => t.replace(/^R/, '#').replace(/^L/, 'R').replace(/^#/, 'L');
  const mirror = m => { const o = {}; Object.entries(m).forEach(([k, v]) => { o[mirrorTok(k)] = v; }); return o; };

  const PS_CB = ['intercept', 'anticipate', 'block', 'jockey', 'pressproven', 'pingedpass', 'longballpass', 'quickstep', 'slidetackle', 'tikitaka', 'incisivepass'];
  const PS_FB = ['quickstep', 'rapid', 'relentless', 'whippedpass', 'jockey', 'intercept', 'slidetackle', 'pressproven', 'technical'];
  const PS_DM = ['intercept', 'pressproven', 'tikitaka', 'incisivepass', 'pingedpass', 'longballpass', 'quickstep', 'relentless', 'jockey', 'anticipate', 'bruiser', 'slidetackle', 'technical', 'firsttouch'];
  const PS_CM = ['tikitaka', 'incisivepass', 'pingedpass', 'relentless', 'pressproven', 'firsttouch', 'technical', 'intercept', 'longballpass'];
  const PS_WIDE = ['rapid', 'quickstep', 'technical', 'trickster', 'firsttouch', 'whippedpass', 'incisivepass', 'finesseshot', 'relentless', 'flair', 'trivela'];
  const PS_CAM = ['tikitaka', 'incisivepass', 'firsttouch', 'technical', 'flair', 'pressproven', 'finesseshot', 'trickster', 'inventive'];
  const PS_ST = ['finesseshot', 'lowdrivenshot', 'powershot', 'chipshot', 'precisionheader', 'powerheader', 'acrobatic', 'firsttouch', 'rapid', 'quickstep', 'aerialfortress', 'gamechanger'];
  const PS_GK = ['footwork', 'farreach', 'crossclaimer', 'rushout'];

  // pos maps are written for the right side; mirror() is applied for left-side slots.
  const ROLE = {
    GK: { name: 'Sweeper keeper', w: { gkReflexes: 3, gkDiving: 2.5, gkHandling: 2, gkPositioning: 2, gkKicking: 3, reactions: 1, sprintSpeed: 0.8, acceleration: 0.8 }, pos: { GK: 1 }, ps: PS_GK },
    RB: { name: 'Full-back', w: { sprintSpeed: 2.5, acceleration: 2.2, stamina: 2.5, crossing: 2, shortPass: 2, defAwareness: 2.2, standTackle: 2, interceptions: 2, dribbling: 1.5, ballControl: 1.5, longPass: 1, reactions: 1, agility: 1, strength: 0.8 }, pos: { RB: 1, RWB: 0.95, LB: 0.86, LWB: 0.82, CB: 0.78, RM: 0.78, CDM: 0.62 }, ps: PS_FB },
    RWB: { name: 'Wing-back', w: { stamina: 3, sprintSpeed: 2.8, acceleration: 2.5, crossing: 3, dribbling: 2, shortPass: 2, ballControl: 1.8, defAwareness: 1.5, standTackle: 1.5, interceptions: 1.2, agility: 1.2, vision: 1, longPass: 1 }, pos: { RWB: 1, RB: 0.94, RM: 0.9, LWB: 0.86, LB: 0.8, RW: 0.8 }, ps: PS_FB },
    CB: { name: 'Ball-playing centre-back', w: { defAwareness: 3, interceptions: 2.5, standTackle: 2, shortPass: 2.5, longPass: 2.5, ballControl: 1.5, composure: 2, sprintSpeed: 2, acceleration: 1.5, reactions: 1, strength: 1, heading: 1, aggression: 0.5, vision: 0.5 }, pos: { CB: 1, CDM: 0.88, RB: 0.8, LB: 0.8, CM: 0.6 }, ps: PS_CB },
    CDM: { name: 'Pivot, builder', w: { shortPass: 3, longPass: 2.2, ballControl: 2.5, vision: 1.5, composure: 2, interceptions: 2.2, defAwareness: 2, standTackle: 1.8, stamina: 2, acceleration: 2, sprintSpeed: 2, agility: 1, reactions: 1, strength: 1, dribbling: 1 }, pos: { CDM: 1, CM: 0.93, CB: 0.85, CAM: 0.7, RB: 0.6, LB: 0.6 }, ps: PS_DM },
    CDM2: { name: 'Pivot, ball-winner', w: { interceptions: 3, defAwareness: 2.5, standTackle: 2.5, stamina: 2.5, acceleration: 2.2, sprintSpeed: 2.2, shortPass: 2.5, ballControl: 2, composure: 1.8, strength: 1.5, aggression: 1, reactions: 1, longPass: 1.5, agility: 1 }, pos: { CDM: 1, CM: 0.93, CB: 0.85, CAM: 0.7, RB: 0.6, LB: 0.6 }, ps: PS_DM },
    CM: { name: 'Central midfielder', w: { shortPass: 3, longPass: 2.2, ballControl: 2.5, vision: 2.2, dribbling: 1.8, stamina: 2.2, interceptions: 1.5, standTackle: 1.2, composure: 2, reactions: 1.2, positioning: 1.2, acceleration: 1.2, agility: 1, longShots: 1, strength: 0.8 }, pos: { CM: 1, CDM: 0.94, CAM: 0.94, RM: 0.8, LM: 0.8, CB: 0.6 }, ps: PS_CM },
    CAM: { name: 'Free eight', w: { vision: 3, shortPass: 3, ballControl: 2.5, dribbling: 2.5, positioning: 2, composure: 2, finishing: 1.5, agility: 1.5, longShots: 1, curve: 0.5, reactions: 1, acceleration: 1 }, pos: { CAM: 1, CM: 0.95, CF: 0.92, RM: 0.9, LM: 0.9, RW: 0.9, LW: 0.9, CDM: 0.75, ST: 0.7 }, ps: PS_CAM },
    RM: { name: 'Wide midfielder', w: { dribbling: 3.2, ballControl: 3, agility: 2.2, shortPass: 2.6, vision: 1.8, crossing: 1.6, acceleration: 1.6, sprintSpeed: 1.2, composure: 1.5, stamina: 1.5, finishing: 1.2, positioning: 1.2, curve: 1 }, pos: { RM: 1, RW: 0.96, LM: 0.88, LW: 0.85, RWB: 0.9, CAM: 0.86, RB: 0.78, CM: 0.8, ST: 0.65, CF: 0.7 }, ps: PS_WIDE },
    RW: { name: 'Winger', w: { dribbling: 3.4, ballControl: 3.2, agility: 2.6, shortPass: 2.2, vision: 1.6, acceleration: 1.8, sprintSpeed: 1.4, finishing: 1.6, crossing: 1.2, curve: 1.2, positioning: 1.6, composure: 1.6, reactions: 1 }, pos: { RW: 1, RM: 0.96, LW: 0.88, LM: 0.85, CAM: 0.86, ST: 0.8, CF: 0.82, RWB: 0.75 }, ps: PS_WIDE },
    CF: { name: 'Second striker', w: { finishing: 2.5, positioning: 2.5, shortPass: 2.2, vision: 1.8, ballControl: 2.5, dribbling: 2.2, composure: 2, acceleration: 1.5, agility: 1.5, reactions: 1.5, longShots: 1, sprintSpeed: 1 }, pos: { CF: 1, ST: 0.97, CAM: 0.9, RW: 0.85, LW: 0.85 }, ps: PS_CAM.concat(['finesseshot', 'clinicalfinisher']) },
    ST: { name: 'Finisher', w: { finishing: 3.5, positioning: 3, composure: 2, shotPower: 1.5, reactions: 1.5, ballControl: 1.5, acceleration: 1.5, sprintSpeed: 1.5, heading: 1, strength: 1, volleys: 0.5, dribbling: 1 }, pos: { ST: 1, CF: 0.97, RW: 0.86, LW: 0.86, CAM: 0.78 }, ps: PS_ST },
    ST2: { name: 'Link striker', w: { finishing: 2.5, positioning: 2.5, composure: 2, shortPass: 2, vision: 1.2, ballControl: 2, dribbling: 1.8, acceleration: 1.5, sprintSpeed: 1.5, reactions: 1.5, shotPower: 1, agility: 1 }, pos: { ST: 1, CF: 1, RW: 0.9, LW: 0.9, CAM: 0.86 }, ps: PS_ST },
  };
  // LM and LW reuse the right-side templates; the side decides which map is mirrored.
  ROLE.LB = ROLE.RB; ROLE.LWB = ROLE.RWB; ROLE.LM = ROLE.RM; ROLE.LW = ROLE.RW;

  const posSlot = pos => ({ id: pos, pos, role: pos === 'CDM' ? 'CDM' : pos, side: sideOf(pos), x: 50, y: 50 });
  const P = (id, pos, x, y, o) => Object.assign({ id, pos, role: pos, side: sideOf(pos), x, y }, o || {});
  const back3 = [P('LCB', 'CB', 22, 75, { side: 'L' }), P('CB', 'CB', 50, 78), P('RCB', 'CB', 78, 75, { side: 'R' })];
  const back4 = [P('LB', 'LB', 10, 72), P('LCB', 'CB', 35, 77, { side: 'L' }), P('RCB', 'CB', 65, 77, { side: 'R' }), P('RB', 'RB', 90, 72)];
  const gk = P('GK', 'GK', 50, 92);
  const pivot = [P('LDM', 'CDM', 37, 55, { role: 'CDM', side: 'L' }), P('RDM', 'CDM', 63, 55, { role: 'CDM2', side: 'R' })];
  const FORMATIONS = {
    '3-2-3-2': { label: '3-2-3-2', slots: [P('ST1', 'ST', 34, 11), P('ST2', 'ST', 66, 11, { role: 'ST2' }), P('LM', 'LM', 12, 33), P('CAM', 'CAM', 50, 36), P('RM', 'RM', 88, 33), ...pivot, ...back3, gk], m: ['LM', 'ST1', 'CAM', 'ST2', 'RM'] },
    '3-2-3-2w': { label: '3-2-3-2 with wingers', slots: [P('ST1', 'ST', 34, 11), P('ST2', 'ST', 66, 11, { role: 'ST2' }), P('LW', 'LW', 12, 31), P('CAM', 'CAM', 50, 36), P('RW', 'RW', 88, 31), ...pivot, ...back3, gk], m: ['LW', 'ST1', 'CAM', 'ST2', 'RW'] },
    '3-2-4-1': { label: '3-2-4-1', slots: [P('ST', 'ST', 50, 11), P('LM', 'LM', 12, 33), P('LAM', 'CAM', 38, 32), P('RAM', 'CAM', 62, 32), P('RM', 'RM', 88, 33), ...pivot, ...back3, gk], m: [] },
    '3-5-2': { label: '3-5-2', slots: [P('ST1', 'ST', 34, 11), P('ST2', 'ST', 66, 11, { role: 'ST2' }), P('LWB', 'LWB', 9, 42), P('LCM', 'CM', 32, 38, { side: 'L' }), P('CDM', 'CDM', 50, 56), P('RCM', 'CM', 68, 38, { side: 'R' }), P('RWB', 'RWB', 91, 42), ...back3, gk], m: [] },
    '3-4-3': { label: '3-4-3', slots: [P('LW', 'LW', 14, 15), P('ST', 'ST', 50, 10), P('RW', 'RW', 86, 15), P('LWB', 'LWB', 9, 44), P('LCM', 'CM', 38, 46, { side: 'L' }), P('RCM', 'CM', 62, 46, { side: 'R' }), P('RWB', 'RWB', 91, 44), ...back3, gk], m: [] },
    '4-2-3-1': { label: '4-2-3-1', slots: [P('ST', 'ST', 50, 10), P('LW', 'LW', 14, 30), P('CAM', 'CAM', 50, 32), P('RW', 'RW', 86, 30), ...pivot.map(s => Object.assign({}, s, { x: s.x + (s.x < 50 ? 1 : -1), y: 53 })), ...back4, gk], m: [] },
    '4-3-3': { label: '4-3-3', slots: [P('LW', 'LW', 15, 14), P('ST', 'ST', 50, 10), P('RW', 'RW', 85, 14), P('LCM', 'CM', 30, 38, { side: 'L' }), P('CDM', 'CDM', 50, 52), P('RCM', 'CM', 70, 38, { side: 'R' }), ...back4, gk], m: [] },
    '4-4-2': { label: '4-4-2', slots: [P('ST1', 'ST', 36, 11), P('ST2', 'ST', 64, 11, { role: 'ST2' }), P('LM', 'LM', 11, 34), P('LCM', 'CM', 38, 40, { side: 'L' }), P('RCM', 'CM', 62, 40, { side: 'R' }), P('RM', 'RM', 89, 34), ...back4, gk], m: [] },
    '4-1-4-1': { label: '4-1-4-1', slots: [P('ST', 'ST', 50, 10), P('LM', 'LM', 11, 30), P('LCM', 'CM', 38, 35, { side: 'L' }), P('RCM', 'CM', 62, 35, { side: 'R' }), P('RM', 'RM', 89, 30), P('CDM', 'CDM', 50, 54), ...back4, gk], m: [] },
  };

  /* ---------- system fit ---------- */
  function derivedAttrs(p) {
    // fall back to the six face stats when detailed attributes are missing
    const d = {};
    const f = k => p[k] != null ? p[k] : null;
    const pac = f('pac'), sho = f('sho'), pas = f('pas'), drb = f('drb'), def = f('def'), phy = f('phy');
    const set = (k, v) => { if (v != null) d[k] = v; };
    set('shortPass', pas); set('longPass', pas); set('vision', pas); set('crossing', pas);
    set('ballControl', drb); set('dribbling', drb); set('agility', drb);
    set('acceleration', pac); set('sprintSpeed', pac);
    set('finishing', sho); set('positioning', sho); set('shotPower', sho); set('longShots', sho); set('curve', sho);
    set('interceptions', def); set('defAwareness', def); set('standTackle', def); set('slideTackle', def);
    set('strength', phy); set('stamina', phy); set('aggression', phy); set('jumping', phy); set('heading', phy);
    set('composure', avg([pas, drb])); set('reactions', p.ovr);
    return d;
  }

  function roleOf(slot) { return ROLE[slot.role || slot.pos]; }
  function posFactor(p, slot) {
    const r = roleOf(slot); const map = slot.side === 'L' ? mirror(r.pos) : r.pos; let best = 0;
    (p.positions || []).forEach((t, i) => { let f = map[t] || 0; if (i > 0) f *= 0.99; best = Math.max(best, f); });
    return best;
  }

  const fitMemo = new WeakMap(); const derMemo = new WeakMap();
  function slotFit(p, slot, opts) {
    const ck = (slot.id || '') + '|' + (slot.role || '') + '|' + slot.pos + '|' + (slot.side || '') + '|' + (opts && opts.oop ? 1 : 0);
    let m = fitMemo.get(p); if (!m) { m = new Map(); fitMemo.set(p, m); }
    let r = m.get(ck); if (!r) { r = slotFitRaw(p, slot, opts); m.set(ck, r); }
    return r;
  }
  function slotFitRaw(p, slot, opts) {
    const role = roleOf(slot);
    let derived = derMemo.get(p); if (!derived) { derived = derivedAttrs(p); derMemo.set(p, derived); }
    let sw = 0, sv = 0, tot = 0, miss = 0, usedDerived = false;
    Object.entries(role.w).forEach(([k, w]) => {
      tot += w;
      let v = p[k];
      if (v == null) { v = derived[k]; if (v != null) usedDerived = true; }
      if (v == null) { miss += w; return; }
      sw += w; sv += w * v;
    });
    const coverage = tot ? sw / tot : 0;
    if (!sw) return { fit: 0, adj: 0, factor: 0, coverage: 0, approx: true, notes: ['No attributes to score'] };
    const base = sv / sw;
    let factor = posFactor(p, slot);
    if (!factor && opts && opts.oop && slot.pos !== 'GK' && !(p.positions || []).includes('GK')) factor = 0.6;
    let bonus = 0; const hits = [];
    role.ps.forEach(ps => {
      const plain = p.playstyles.includes(ps), plus = p.playstyles.includes(ps + 'plus');
      if (plus) { bonus += 2.2; hits.push(ps + '+'); } else if (plain) { bonus += 1.4; hits.push(ps); }
    });
    bonus = Math.min(bonus, 6);
    let foot = 0;
    if (slot.side && p.foot) foot = (p.foot === slot.side) ? 1.2 : ((p.weak || 0) >= 4 ? 0.4 : -0.8);
    const adj = base * factor + bonus + foot;
    const fit = clamp((adj - 48) / (90 - 48) * 100);
    const notes = [];
    if (factor < 1 && factor > 0) notes.push('Out of position penalty (x' + factor.toFixed(2) + ')');
    if (hits.length) notes.push('PlayStyles: ' + hits.join(', '));
    if (usedDerived || coverage < 0.8) notes.push('Approximate: some attributes estimated from face stats');
    return { fit: Math.round(fit), adj, factor, coverage, approx: usedDerived || coverage < 0.8, notes };
  }

  /* ---------- club pull and signing willingness ---------- */
  function formOne(w) {
    const size = w.leagueSize || 20, pos = clamp(w.leaguePos || Math.ceil(size / 2), 1, size);
    const leaguePart = 75 * (1 - (pos - 1) / Math.max(1, size - 1));
    const eu = [0, 6, 10, 16][w.europe || 0];
    return clamp(leaguePart + eu + (w.cups || 0) * 4 + (w.euroWon ? 10 : 0));
  }
  function clubPull(profile, windows) {
    const prestige = profile ? profile.prestige : 55;
    const ws = (windows || []).slice().reverse().slice(0, 3); // newest first
    let form = null, teamOvr = null;
    if (ws.length) {
      const wt = [0.6, 0.25, 0.15].slice(0, ws.length); const ws_ = wt.reduce((a, b) => a + b, 0);
      form = ws.reduce((s, w, i) => s + formOne(w) * wt[i], 0) / ws_;
      const latest = ws.find(w => w.teamOvr);
      if (latest) teamOvr = clamp((latest.teamOvr - 66) / 20 * 100);
    }
    let parts = [{ k: 'prestige', v: prestige, w: 0.4 }];
    if (form != null) parts.push({ k: 'form', v: form, w: 0.35 });
    if (teamOvr != null) parts.push({ k: 'teamOvr', v: teamOvr, w: 0.25 });
    const sw = parts.reduce((s, x) => s + x.w, 0);
    const pull = parts.reduce((s, x) => s + x.v * x.w, 0) / sw;
    return { pull: Math.round(pull), prestige, form: form == null ? null : Math.round(form), teamOvr: teamOvr == null ? null : Math.round(teamOvr), parts };
  }

  function willingness(p, ctx) {
    // ctx: { pull, lookupClub(name)->profile, realism, wageCap, budget, markup, seasonEnd, incumbent }
    const reasons = []; const pull = ctx.pull;
    let E = clamp((p.ovr - 66) / 25 * 100);
    if (p.age != null && p.age <= 23) E += Math.max(0, (p.pot - p.ovr)) * 0.6;
    if (p.age != null && p.age >= 32) E -= 8;
    E = clamp(E, 0, 110);
    let raw = 55 + (pull - E) * (ctx.realism || 0.8);
    reasons.push(`Your club pull ${pull} against the level this player expects (${Math.round(E)})`);
    const cur = ctx.lookupClub ? ctx.lookupClub(p.club) : null;
    const curPull = cur ? cur.prestige : clamp(E - 5);
    const step = clamp((pull - curPull) * 0.30, -20, 20);
    if (Math.abs(step) >= 2) reasons.push(`${step > 0 ? 'Step up' : 'Step down'} from ${p.club || 'current club'} (${step > 0 ? '+' : ''}${Math.round(step)})`);
    raw += step;
    let flags = [];
    if (p.free) { raw += 25; reasons.push('Free agent (+25)'); flags.push('Free');
    } else if (p.contractEnd != null && ctx.seasonEnd != null) {
      const left = p.contractEnd - ctx.seasonEnd;
      if (left <= 0) { raw += 15; reasons.push(`Contract ends ${p.contractEnd} (+15)`); flags.push('Expiring'); }
      else if (left === 1) { raw += 6; reasons.push(`Contract ends ${p.contractEnd} (+6)`); }
      else if (left >= 4) { raw -= 4; reasons.push(`Long contract to ${p.contractEnd} (-4)`); }
    }
    if (ctx.wageCap && p.wage != null) {
      if (p.wage > ctx.wageCap) { const pen = Math.min(30, 10 + (p.wage / ctx.wageCap - 1) * 25); raw -= pen; reasons.push(`Wage ${fmtMoney(p.wage)}/wk is over your cap (-${Math.round(pen)})`); flags.push('Wage');
      } else raw += 2;
    }
    if (p.release != null && ctx.budget && p.release <= ctx.budget) { raw += 8; reasons.push(`Release clause ${fmtMoney(p.release)} is inside your budget (+8)`); flags.push('Clause'); }
    if (ctx.incumbent) {
      const d = p.ovr - ctx.incumbent;
      const adj = clamp(d * 2.5, -14, 8);
      raw += adj;
      if (Math.abs(adj) >= 1) reasons.push(`${d >= 0 ? '+' : ''}${d} OVR against your current starter (${adj > 0 ? '+' : ''}${Math.round(adj)})`);
    }
    const will = Math.round(clamp(raw));
    const price = p.free ? 0 : (p.value != null ? p.value * (ctx.markup || 1.2) : null);
    const over = ctx.budget && price != null && price > ctx.budget;
    if (over) flags.push('Budget');
    const label = will >= 75 ? 'Likely' : will >= 55 ? 'Possible' : will >= 35 ? 'Reach' : 'Unlikely';
    return { will, label, reasons, flags, price, over };
  }

  /* ---------- lore ---------- */
  const NAT_ALIAS = { korearepublic: 'southkorea', republicofkorea: 'southkorea', unitedstates: 'usa', unitedstatesofamerica: 'usa', czechia: 'czechrepublic', cotedivoire: 'ivorycoast', holland: 'netherlands', turkiye: 'turkey', drcongo: 'drcongo', bosniaherzegovina: 'bosniaandherzegovina' };
  const natKey = s => { const n = norm(s); return NAT_ALIAS[n] || n; };

  function archetype(p) {
    const a = k => p[k];
    const sc = v => v == null ? null : clamp((v - 40) / 50 * 10, 0, 10);
    const age = p.age || 25;
    return {
      youth: age <= 21 ? 10 : age <= 23 ? 7 : age <= 26 ? 4 : age <= 29 ? 2 : 0,
      veteran: age >= 33 ? 10 : age >= 30 ? 7 : age >= 28 ? 4 : 1,
      physical: sc(avg([a('strength'), a('stamina'), a('jumping'), a('aggression')])) ?? sc(avg([p.phy])) ?? 5,
      technical: sc(avg([a('dribbling'), a('ballControl'), a('shortPass'), a('vision')])) ?? sc(avg([p.drb, p.pas])) ?? 5,
      pace: sc(avg([a('acceleration'), a('sprintSpeed')])) ?? sc(p.pac) ?? 5,
    };
  }

  function lore(p, prof) {
    if (!prof) return { lore: 0, reasons: ['No club profile selected'], parts: {} };
    const reasons = []; const parts = { nation: 0, pipeline: 0, link: 0, style: 0, penalty: 0 };
    const src = {}; Object.entries(prof.sources || {}).forEach(([k, v]) => { src[natKey(k)] = +v || 0; });
    const nk = natKey(p.nationality);
    const w = nk ? (src[nk] != null ? src[nk] : 1) : 1;
    parts.nation = 45 * clamp(w, 0, 10) / 10;
    if (p.nationality) reasons.push(`${p.nationality}: ${src[nk] != null ? src[nk] + '/10 for this club' : 'not a usual source'} (+${parts.nation.toFixed(0)})`);
    const pk = norm(p.club);
    if (pk && (prof.feeders || []).some(f => { const fk = norm(f); return fk && (pk.includes(fk) || fk.includes(pk)); })) { parts.pipeline = 20; reasons.push(`Comes from ${p.club}, a usual pipeline (+20)`); }
    else if (p.league && (prof.feederLeagues || []).some(l => norm(l) === norm(p.league))) { parts.pipeline = 10; reasons.push(`League ${p.league} is a usual source (+10)`); }
    const nm = norm(p.name);
    if (nm && (prof.ties || []).some(t => { const tk = norm(t); return tk.length > 3 && (nm.includes(tk) || tk.includes(nm)); })) { parts.link = 20; reasons.push('Known link to the club (+20)'); }
    const st = prof.style || {}; const ar = archetype(p);
    const keys = ['youth', 'veteran', 'physical', 'technical', 'pace'];
    const den = keys.reduce((s, k) => s + (st[k] || 0) * 10, 0);
    parts.style = den ? 15 * keys.reduce((s, k) => s + (st[k] || 0) * ar[k], 0) / den : 7.5;
    reasons.push(`Playing identity match (+${parts.style.toFixed(0)})`);
    if ((prof.rivals || []).some(r => pk && norm(r) && (pk.includes(norm(r)) || norm(r).includes(pk)))) { parts.penalty -= 12; reasons.push(`Comes from a rival, ${p.club} (-12)`); }
    const ai = prof.ageIdeal;
    if (ai && p.age != null) {
      const d = p.age < ai[0] ? ai[0] - p.age : (p.age > ai[1] ? p.age - ai[1] : 0);
      if (d) { const pen = Math.min(15, d * 2); parts.penalty -= pen; reasons.push(`Age ${p.age} is outside the ${ai[0]}-${ai[1]} the club prefers (-${pen})`); }
    }
    const total = clamp(parts.nation + parts.pipeline + parts.link + parts.style + parts.penalty);
    return { lore: Math.round(total), reasons, parts };
  }

  /* ---------- combined ranking ---------- */
  function evaluate(p, slot, ctx) {
    const f = slotFit(p, slot, { oop: ctx.oop });
    const w = willingness(p, Object.assign({}, ctx, { incumbent: ctx.incumbentFor ? ctx.incumbentFor(slot) : (ctx.incumbents ? ctx.incumbents[slot.id] : null) }));
    const l = ctx.loreOf ? ctx.loreOf(p) : lore(p, ctx.profile);
    const wt = ctx.weights; const sum = (wt.fit + wt.will + wt.lore) || 1;
    const total = Math.round((wt.fit * f.fit + wt.will * w.will + wt.lore * l.lore) / sum);
    return { slot: slot.id, fit: f.fit, fitInfo: f, will: w.will, willInfo: w, lore: l.lore, loreInfo: l, total };
  }

  return { clamp, norm, clubKey, sameClub, money, fmtMoney, contractInfo, parseTable, parsePositions, ROLE, FORMATIONS, POSITIONS, GROUPS, posSlot, roleOf, sideOf, slotFit, posFactor, clubPull, willingness, lore, evaluate, formOne, ATTR_KEYS, FACE_KEYS, ALIASES, natKey };
})();
if (typeof module !== 'undefined') module.exports = Engine;
