(function () {
  'use strict';
  var merge = window.mergeState;

  // ---------- storage ----------
  var LS = 'tracker_cache_v2', LSD = 'tracker_dirty', LSP = 'tracker_pass', LSUI = 'tracker_ui';
  function lsGet(k) { try { var v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function defaults() {
    return { v: 2, savedAt: 0, settingsAt: 0, timerAt: 0, timer: null, days: {}, activities: [
      { id: 'cyber', name: 'Cybersecurity', type: 'time', goal: 120 },
      { id: 'reading', name: 'Reading', type: 'time', goal: 30 },
      { id: 'leetcode', name: 'LeetCode', type: 'time', goal: 45 },
      { id: 'projects', name: 'Projects', type: 'time', goal: 60 },
      { id: 'gym', name: 'Gym', type: 'check' },
      { id: 'shake', name: 'Protein shake', type: 'check' }
    ] };
  }

  var S = lsGet(LS) || defaults();
  if (!S.days) S.days = {};
  if (!Array.isArray(S.activities)) S.activities = defaults().activities;
  var dirty = !!lsGet(LSD);
  var pass = lsGet(LSP);
  var sync = 'idle', syncMsg = '', editSeq = 0, inflight = false, again = false, pushTimer = null, needRender = false;
  var ui = lsGet(LSUI) || {};
  var view = ['today', 'week', 'month', 'year', 'settings'].indexOf(ui.view) >= 0 ? ui.view : 'today';
  var cur = todayKey();
  var pendingDel = null, lockErr = '', flash = '';

  // ---------- helpers ----------
  function key(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parse(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(k, n) { var d = parse(k); d.setDate(d.getDate() + n); return key(d); }
  function todayKey() { return key(new Date()); }
  function h(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { return +v || 0; }
  function sum(arr) { return arr.reduce(function (s, x) { return s + x; }, 0); }
  function fmt(m) { m = Math.round(m || 0); if (m < 60) return m + 'm'; var hh = Math.floor(m / 60), mm = m % 60; return hh + 'h' + (mm ? ' ' + mm + 'm' : ''); }
  function fmtS(m) { m = Math.round(m || 0); if (m < 60) return m + 'm'; var hr = m / 60; return (hr >= 10 ? Math.round(hr) : Math.round(hr * 10) / 10) + 'h'; }
  function clock(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (x) { return String(x).padStart(2, '0'); }).join(':'); }
  function act(id) { for (var i = 0; i < S.activities.length; i++) if (S.activities[i].id === id) return S.activities[i]; return null; }
  function timeActs() { return S.activities.filter(function (a) { return a.type === 'time'; }); }
  function checkActs() { return S.activities.filter(function (a) { return a.type === 'check'; }); }
  function getV(k, id) { var d = S.days[k]; return d && d.v ? d.v[id] : undefined; }
  function day(k) { var d = S.days[k]; if (!d) d = S.days[k] = { v: {}, u: 0 }; if (!d.v) d.v = {}; return d; }
  function setV(k, id, val) { var d = day(k); if (!val) delete d.v[id]; else d.v[id] = val; d.u = Date.now(); }
  function focus(k) { return timeActs().reduce(function (s, a) { return s + num(getV(k, a.id)); }, 0); }
  function done(k, a) { var v = getV(k, a.id); return a.type === 'check' ? !!v : num(v) > 0; }
  function onGoal(k, a) { var v = getV(k, a.id); return a.type === 'check' ? !!v : (a.goal > 0 && num(v) >= a.goal); }
  function level(m) { return !m ? 0 : m < 30 ? 1 : m < 90 ? 2 : m < 180 ? 3 : 4; }
  function monthKeys(y, m) { var n = new Date(y, m + 1, 0).getDate(), o = []; for (var i = 1; i <= n; i++) o.push(key(new Date(y, m, i))); return o; }
  function yearKeys(y) { var o = []; for (var m = 0; m < 12; m++) o = o.concat(monthKeys(y, m)); return o; }
  function elapsed(keys) { var tk = todayKey(); var c = keys.filter(function (k) { return k <= tk; }).length; return c || keys.length; }
  function actTotal(keys, a) { return keys.reduce(function (s, k) { var v = getV(k, a.id); return s + (a.type === 'check' ? (v ? 1 : 0) : num(v)); }, 0); }
  function longest(keys, test) { var best = 0, run = 0; keys.forEach(function (k) { if (test(k)) { run++; if (run > best) best = run; } else run = 0; }); return best; }
  // ---------- workouts ----------
  var P = window.WORKOUT_PLAN || { rotation: [], order: [], sessions: {} };
  function wOf(k) { var d = S.days[k]; return d && d.w && P.sessions[d.w.s] ? d.w : null; }
  function setDone(s) { return Array.isArray(s) && num(s[1]) > 0; }
  function doneSets(w, exId) { return ((w && w.sets && w.sets[exId]) || []).filter(setDone); }
  function hasSets(w) { return !!w && P.sessions[w.s].exercises.some(function (ex) { return doneSets(w, ex.id).length > 0; }); }
  function pastKeys(k) { return Object.keys(S.days).filter(function (x) { return x < k; }).sort().reverse(); }
  function lastLogged(k) { var ks = pastKeys(k); for (var i = 0; i < ks.length; i++) if (hasSets(wOf(ks[i]))) return ks[i]; return null; }
  function lastOf(sess, k) { var ks = pastKeys(k); for (var i = 0; i < ks.length; i++) { var w = wOf(ks[i]); if (w && w.s === sess && hasSets(w)) return ks[i]; } return ''; }
  function resolveSlot(slot, k) { return slot === 'push' ? (lastOf('pushA', k) <= lastOf('pushB', k) ? 'pushA' : 'pushB') : slot; }
  function nextPos(k) { var l = lastLogged(k), w = l && wOf(l); return w && typeof w.pos === 'number' ? (w.pos + 1) % P.rotation.length : 0; }
  function suggest(k) { var p = nextPos(k); return { pos: p, s: resolveSlot(P.rotation[p], k) }; }
  function posFor(sess, k) {
    var start = nextPos(k), n = P.rotation.length;
    for (var i = 0; i < n; i++) {
      var p = (start + i) % n, slot = P.rotation[p];
      if (slot === sess || (slot === 'push' && /^push/.test(sess))) return p;
    }
    return start;
  }
  function slotLabel(p) { var half = P.rotation.length / 2; return 'Week ' + (p < half ? 'A' : 'B') + ' · session ' + (p % half + 1) + ' of ' + half; }
  function lastSets(exId, k) {
    var ks = pastKeys(k);
    for (var i = 0; i < ks.length; i++) { var w = S.days[ks[i]].w, s = w ? doneSets(w, exId) : []; if (s.length) return { k: ks[i], sets: s }; }
    return null;
  }
  function kgTxt(v) { return v === '' || v == null ? '' : String(v); }
  function setTxt(s, bw) { var kg = kgTxt(s[0]); return (kg ? (bw ? '+' : '') + kg + '×' : (bw ? 'BW×' : '')) + s[1]; }
  function startW(sess) { var d = day(cur); d.w = { s: sess, pos: posFor(sess, cur), sets: {}, n: {} }; d.u = Date.now(); }

  function vWorkout() {
    var w = wOf(cur), sg = suggest(cur);
    var o = '<h2>Workout</h2><section class="card wk">';
    if (!w) {
      var ss = P.sessions[sg.s];
      if (!ss) return '';
      o += '<div class="row"><div><div class="name">Next: ' + h(ss.name) + '</div><div class="goal">' + h(slotLabel(sg.pos)) + (ss.sub ? ' · ' + h(ss.sub) : '') + '</div></div>' +
        '<button class="go" data-act="wstart" data-s="' + sg.s + '">Start</button></div>' +
        '<div class="chips"><span>or</span>' + P.order.filter(function (id) { return id !== sg.s; }).map(function (id) {
          return '<button data-act="wstart" data-s="' + id + '">' + h(P.sessions[id].name) + '</button>';
        }).join('') + '</div>';
      return o + '</section>';
    }
    var sess = P.sessions[w.s], tgt = 0, dn = 0;
    sess.exercises.forEach(function (ex) { tgt += ex.sets; dn += Math.min(ex.sets, doneSets(w, ex.id).length); });
    o += '<div class="row"><div><div class="name">' + h(sess.name) + '</div><div class="goal">' + h(slotLabel(w.pos || 0)) + (sess.sub ? ' · ' + h(sess.sub) : '') + '</div></div><div class="val">' + dn + '<span class="goal"> / ' + tgt + ' sets</span></div></div>' +
      '<div class="bar"><i style="width:' + (tgt ? Math.min(100, dn / tgt * 100) : 0) + '%"></i></div>';
    o += '<div class="chips">' + P.order.map(function (id) {
      return '<button class="' + (id === w.s ? 'on' : '') + '" data-act="wsess" data-s="' + id + '">' + h(P.sessions[id].name) + '</button>';
    }).join('') + (hasSets(w) ? '' : '<button data-act="wsess" data-s="none">Cancel</button>') + '</div>';
    sess.exercises.forEach(function (ex) {
      var logged = (w.sets && w.sets[ex.id]) || [], last = lastSets(ex.id, cur);
      var rows = Math.max(ex.sets + num(w.n && w.n[ex.id]), logged.length);
      var reps = ex.min ? (ex.min === ex.max ? ex.min : ex.min + '–' + ex.max) : 'near failure';
      o += '<div class="ex"><div class="row"><div class="name">' + h(ex.name) + '</div><div class="goal">' + ex.sets + ' × ' + reps + ' · ' + h(ex.rest) + '</div></div>';
      if (ex.note) o += '<div class="exnote">' + h(ex.note) + '</div>';
      if (last) {
        var top = ex.max && last.sets.length >= ex.sets && last.sets.every(function (s) { return num(s[1]) >= ex.max; });
        o += '<div class="last">Last (' + parse(last.k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '): ' +
          last.sets.map(function (s) { return setTxt(s, ex.bw); }).join(' · ') +
          '<br><span class="' + (top ? 'up' : '') + '">' + (top ? 'Top of the range on every set: add weight.' : 'Beat it: one more rep or a bit more weight.') + '</span></div>';
      }
      for (var i = 0; i < rows; i++) {
        var s = logged[i] || [], ls = last && last.sets[Math.min(i, last.sets.length - 1)];
        o += '<div class="srow"><span class="n">' + (i + 1) + '</span>' +
          '<input type="number" min="0" step="0.5" inputmode="decimal" data-act="wset" data-ex="' + ex.id + '" data-i="' + i + '" data-f="0" value="' + h(kgTxt(s[0])) + '" placeholder="' + (ls && kgTxt(ls[0]) ? h(ls[0]) : (ex.bw ? '+0' : 'kg')) + '"><span>' + (ex.bw ? '+kg' : 'kg') + '</span>' +
          '<input type="number" min="0" step="0.5" inputmode="decimal" data-act="wset" data-ex="' + ex.id + '" data-i="' + i + '" data-f="1" value="' + h(s[1] || '') + '" placeholder="' + (ls ? h(ls[1]) : 'reps') + '"><span>reps</span></div>';
      }
      o += '<button class="addset" data-act="wadd" data-ex="' + ex.id + '">+ set</button></div>';
    });
    return o + '<p class="muted">Grey numbers are last time. Logging a set ticks Gym for the day.</p></section>';
  }

  function delta(now, before, isTime, label) {
    var d = now - before; if (!before) return '';
    var cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
    var txt = d === 0 ? 'same as ' + label : (d > 0 ? '+' : '−') + (isTime ? fmt(Math.abs(d)) : Math.abs(d)) + ' vs ' + label;
    return '<span class="' + cls + '">' + txt + '</span>';
  }

  // ---------- sync ----------
  function saveCache() { lsSet(LS, S); lsSet(LSD, dirty); }
  function setSync(s, msg) {
    sync = s; syncMsg = msg || '';
    var el = document.getElementById('sync');
    if (el) { el.className = 'sync ' + s; el.innerHTML = '<i></i>' + h(syncLabel()); }
  }
  function syncLabel() {
    if (sync === 'syncing') return 'Syncing…';
    if (sync === 'synced') return 'Synced';
    if (sync === 'offline') return dirty ? 'Offline · saved on device' : 'Offline';
    return dirty ? 'Not synced yet' : '';
  }
  function api(method, body) {
    return fetch('/api/data', {
      method: method, cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + pass, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error) || ('Error ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function onErr(e) {
    if (e && e.status === 401) { pass = null; lsDel(LSP); lockErr = 'Passcode changed. Enter it again.'; render(); return; }
    setSync('offline', e && e.message);
  }
  function adopt(server) {
    if (!server) return false;
    var before = JSON.stringify(S);
    S = merge(server, S);
    saveCache();
    return JSON.stringify(S) !== before;
  }
  function pull() {
    if (!pass) return Promise.resolve();
    if (dirty) return push();
    if (inflight) return Promise.resolve();
    setSync('syncing');
    return api('GET').then(function (j) {
      if (!j.state) { dirty = true; return push(); }
      var changed = adopt(j.state);
      setSync('synced');
      if (changed) safeRender();
    }).catch(onErr);
  }
  function push() {
    if (!pass) return Promise.resolve();
    if (inflight) { again = true; return Promise.resolve(); }
    inflight = true; clearTimeout(pushTimer); pushTimer = null;
    var seq = editSeq;
    setSync('syncing');
    return api('PUT', { state: S }).then(function (j) {
      var changed = adopt(j.state);
      if (seq === editSeq) { dirty = false; saveCache(); }
      setSync('synced');
      if (changed) safeRender();
    }).catch(onErr).then(function () {
      inflight = false;
      if (again) { again = false; push(); }
    });
  }
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); }
  function commit(quiet) {
    S.savedAt = Date.now(); editSeq++; dirty = true; saveCache();
    // quiet: don't rebuild the page right away, so tapping from one set field to the next keeps focus
    if (quiet) { needRender = true; setTimeout(safeRender, 0); } else render();
    if (pass) schedulePush(); else setSync('idle');
  }
  function unlock(p) {
    pass = p; lockErr = '';
    api('GET').then(function (j) {
      lsSet(LSP, p);
      adopt(j.state);
      render();
      if (!j.state || dirty) { dirty = true; push(); } else setSync('synced');
    }).catch(function (e) {
      pass = null;
      lockErr = e.status === 401 ? 'Wrong passcode.' : (e.message || 'Could not reach the server.');
      render();
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (pushTimer) push(); }
    else pull();
  });
  window.addEventListener('online', function () { pull(); });
  setInterval(function () { if (!document.hidden && pass) { if (dirty) push(); else pull(); } }, 60000);

  // ---------- views ----------
  function header() {
    var tabs = [['today', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['settings', 'Edit']];
    return '<div class="top"><h1>Daily Tracker</h1><button id="sync" class="sync ' + sync + '" data-act="syncnow" title="Sync now"><i></i>' + h(syncLabel()) + '</button></div>' +
      '<nav>' + tabs.map(function (t) { return '<button class="tab ' + (view === t[0] ? 'on' : '') + '" data-act="view" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>';
  }

  function runBar() {
    if (!S.timer) return ''; var a = act(S.timer.id); if (!a) return '';
    return '<div class="runbar"><div class="t"><b id="tclock">' + clock(Date.now() - S.timer.start) + '</b><span>' + h(a.name) + ' · running</span></div><button data-act="timer" data-id="' + a.id + '">Stop &amp; log</button></div>';
  }

  function vToday() {
    var d = parse(cur), isT = cur === todayKey();
    var lbl = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    var tA = timeActs(), total = focus(cur);
    var g = S.activities.filter(function (a) { return a.type === 'check' || a.goal > 0; });
    var met = g.filter(function (a) { return onGoal(cur, a); }).length;
    var o = '<div class="datebar"><button data-act="day" data-n="-1" aria-label="Previous day">‹</button><div class="lbl">' + h(lbl) +
      '<small>' + (isT ? 'Today' : '<a href="#" data-act="gotoday">Back to today</a>') + '</small></div><button data-act="day" data-n="1" aria-label="Next day">›</button></div>';
    o += '<div class="sum"><div class="stat"><b>' + fmt(total) + '</b><span>focused time</span></div><div class="stat"><b>' + met + ' / ' + g.length + '</b><span>goals hit</span></div></div>';
    o += runBar();
    tA.forEach(function (a) {
      var v = num(getV(cur, a.id)), pct = a.goal ? Math.min(100, v / a.goal * 100) : 0, run = S.timer && S.timer.id === a.id;
      o += '<section class="card ' + (a.goal && v >= a.goal ? 'done' : '') + '"><div class="row"><div class="name">' + h(a.name) + '</div><div class="val">' + fmt(v) +
        (a.goal ? '<span class="goal"> / ' + fmt(a.goal) + '</span>' : '') + '</div></div>' +
        (a.goal ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '<div style="height:10px"></div>') +
        '<div class="btns"><button data-act="add" data-id="' + a.id + '" data-n="-15">−15</button><button data-act="add" data-id="' + a.id + '" data-n="15">+15</button><button data-act="add" data-id="' + a.id + '" data-n="30">+30</button><button data-act="add" data-id="' + a.id + '" data-n="60">+1h</button>' +
        '<button class="tbtn ' + (run ? 'stop' : '') + '" data-act="timer" data-id="' + a.id + '">' + (run ? '■ Stop' : '▶ Timer') + '</button></div>' +
        '<label class="manual"><input type="number" min="0" inputmode="numeric" data-act="set" data-id="' + a.id + '" value="' + (v || '') + '" placeholder="0"> minutes (type an exact total)</label></section>';
    });
    var cA = checkActs();
    if (cA.length) {
      o += '<h2>Done today?</h2>';
      cA.forEach(function (a) {
        var on = !!getV(cur, a.id);
        o += '<button class="check ' + (on ? 'on' : '') + '" data-act="toggle" data-id="' + a.id + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="name">' + h(a.name) + '</span><span class="goal">' + (on ? 'Done' : 'Not yet') + '</span></button>';
      });
    }
    o += vWorkout();
    var note = (S.days[cur] && S.days[cur].note) || '';
    o += '<h2>Notes</h2><textarea data-act="note" placeholder="What went well? What pulled you off track?">' + h(note) + '</textarea>';
    return o;
  }

  function streak(a) {
    var k = todayKey(), n = 0; if (!done(k, a)) k = addDays(k, -1);
    while (done(k, a) && n < 5000) { n++; k = addDays(k, -1); }
    return n;
  }

  function vWeek() {
    var days = []; for (var i = 6; i >= 0; i--) days.push(addDays(cur, -i));
    var prev = days.map(function (k) { return addDays(k, -7); });
    var tk = todayKey();
    var f = parse(days[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), l = parse(days[6]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    var o = '<div class="datebar"><button data-act="day" data-n="-7" aria-label="Previous week">‹</button><div class="lbl">' + f + ' – ' + l + '<small>7 days ending ' + (days[6] === tk ? 'today' : l) + '</small></div><button data-act="day" data-n="7" aria-label="Next week">›</button></div>';
    var totals = days.map(focus), wk = sum(totals), pwk = sum(prev.map(focus));
    o += '<div class="sum"><div class="stat"><b>' + fmt(wk) + '</b><span>' + (delta(wk, pwk, true, 'prev 7 days') || 'focused this week') + '</span></div><div class="stat"><b>' + fmt(wk / 7) + '</b><span>average per day</span></div></div>';
    var mx = Math.max.apply(null, totals.concat([60]));
    o += '<h2>Focused time per day</h2><div class="chart">' + days.map(function (k, i) {
      var d = parse(k);
      return '<div class="c ' + (k === tk ? 'now' : '') + '" data-act="goday" data-k="' + k + '"><b>' + (totals[i] ? fmtS(totals[i]) : '') + '</b><i style="height:' + (totals[i] / mx * 78) + '%"></i>' + d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2) + '</div>';
    }).join('') + '</div>';
    o += '<h2>Breakdown</h2><div class="wrap"><table class="tbl"><tr><th></th>' + days.map(function (k) {
      var d = parse(k); return '<th class="' + (k === tk ? 'today' : '') + '">' + d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2) + '<br>' + d.getDate() + '</th>';
    }).join('') + '<th>Total</th></tr>';
    S.activities.forEach(function (a) {
      o += '<tr><td title="' + h(a.name) + '">' + h(a.name) + '</td>';
      days.forEach(function (k) {
        var v = getV(k, a.id);
        if (a.type === 'check') o += '<td class="' + (v ? 'hit' : 'z') + '">' + (v ? '✓' : '·') + '</td>';
        else { v = num(v); o += '<td class="' + (!v ? 'z' : (onGoal(k, a) ? 'hit' : '')) + '">' + (v ? fmtS(v) : '·') + '</td>'; }
      });
      o += '<td class="tot">' + (a.type === 'check' ? actTotal(days, a) + '/7' : fmt(actTotal(days, a))) + '</td></tr>';
    });
    var wkN = 0;
    o += '<tr><td>Workout</td>' + days.map(function (k) {
      var w = wOf(k); if (!hasSets(w)) return '<td class="z">·</td>';
      wkN++; return '<td class="hit">' + h(P.sessions[w.s].short || w.s) + '</td>';
    }).join('') + '<td class="tot">' + wkN + '/7</td></tr>';
    o += '<tr><td>All focus</td>' + totals.map(function (t) { return '<td class="' + (t ? '' : 'z') + '">' + (t ? fmtS(t) : '·') + '</td>'; }).join('') + '<td class="tot">' + fmt(wk) + '</td></tr></table></div>';
    o += '<p class="muted">Green = daily goal hit. Tap a bar to open that day.</p>';
    o += '<h2>Current streaks</h2><div class="list">' + S.activities.map(function (a) {
      var s = streak(a); return '<div class="li"><b>' + h(a.name) + '</b><span>' + (s ? '<em>' + s + '</em> day' + (s > 1 ? 's' : '') : '—') + '</span></div>';
    }).join('') + '</div>';
    return o;
  }

  function vMonth() {
    var d = parse(cur), y = d.getFullYear(), m = d.getMonth(), tk = todayKey();
    var keys = monthKeys(y, m), pd = new Date(y, m - 1, 1), pk = monthKeys(pd.getFullYear(), pd.getMonth());
    var pLabel = pd.toLocaleDateString('en-GB', { month: 'short' });
    var foc = keys.map(focus), tot = sum(foc);
    var el = elapsed(keys), partial = el < keys.length, pkc = partial ? pk.slice(0, el) : pk, ptot = sum(pkc.map(focus));
    if (partial) pLabel = pLabel + ' 1–' + el;
    var active = foc.filter(Boolean).length;
    var bi = foc.indexOf(Math.max.apply(null, foc));
    var o = '<div class="datebar"><button data-act="month" data-n="-1" aria-label="Previous month">‹</button><div class="lbl">' +
      h(d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })) + '<small>' + (keys.indexOf(tk) >= 0 ? 'This month' : '<a href="#" data-act="gotoday">Back to this month</a>') + '</small></div><button data-act="month" data-n="1" aria-label="Next month">›</button></div>';
    o += '<div class="sum">' +
      '<div class="stat"><b>' + fmt(tot) + '</b><span>' + (delta(tot, ptot, true, pLabel) || 'focused time') + '</span></div>' +
      '<div class="stat"><b>' + fmt(tot / el) + '</b><span>average per day</span></div>' +
      '<div class="stat"><b>' + active + ' / ' + el + '</b><span>days with focus</span></div>' +
      '<div class="stat"><b>' + (tot ? fmt(foc[bi]) : '—') + '</b><span>' + (tot ? 'best day · ' + parse(keys[bi]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'best day') + '</span></div></div>';
    o += '<h2>Focus calendar</h2><div class="cal">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (x) { return '<div class="hd">' + x + '</div>'; }).join('');
    var off = (new Date(y, m, 1).getDay() + 6) % 7;
    for (var i = 0; i < off; i++) o += '<div></div>';
    keys.forEach(function (k, i) {
      var f = foc[i], checks = checkActs().filter(function (a) { return getV(k, a.id); }).length;
      o += '<div class="cell l' + level(f) + (k === tk ? ' today' : '') + (k > tk ? ' future' : '') + '" data-act="goday" data-k="' + k + '" title="' + fmt(f) + '"><span>' + (i + 1) + '</span><small>' + (f ? fmtS(f) : '') + (checks ? ' ' + '•'.repeat(Math.min(checks, 3)) : '') + '</small></div>';
    });
    o += '</div><div class="legend">less <i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> more · dots = check items done</div>';
    o += '<h2>By activity</h2><div class="list">' + S.activities.map(function (a) {
      var t = actTotal(keys, a), pt = actTotal(pkc, a), gd = keys.filter(function (k) { return onGoal(k, a); }).length;
      var main = a.type === 'check' ? '<em>' + t + '</em> / ' + el + ' days' : '<em>' + fmt(t) + '</em>' + (a.goal ? ' · goal hit ' + gd + 'd' : '');
      return '<div class="li"><b>' + h(a.name) + '</b><span>' + main + '<br>' + delta(t, pt, a.type === 'time', pLabel) + '</span></div>';
    }).join('') + '</div>';
    o += '<p class="muted">Tap any day to open it. Longest focus streak this month: ' + longest(keys, function (k) { return focus(k) > 0; }) + ' days.</p>';
    return o;
  }

  function vYear() {
    var y = parse(cur).getFullYear(), tk = todayKey(), keys = yearKeys(y), py = yearKeys(y - 1);
    var foc = {}; keys.forEach(function (k) { foc[k] = focus(k); });
    var el = elapsed(keys);
    var tot = sum(keys.map(function (k) { return foc[k]; })), ptot = sum(py.slice(0, el).map(focus)), active = keys.filter(function (k) { return foc[k] > 0; }).length;
    var months = []; for (var m = 0; m < 12; m++) months.push(monthKeys(y, m));
    var mt = months.map(function (ks) { return sum(ks.map(function (k) { return foc[k]; })); });
    var bm = mt.indexOf(Math.max.apply(null, mt));
    var mname = function (i, len) { return new Date(y, i, 1).toLocaleDateString('en-GB', { month: len || 'short' }); };
    var o = '<div class="datebar"><button data-act="year" data-n="-1" aria-label="Previous year">‹</button><div class="lbl">' + y + '<small>' + (y === new Date().getFullYear() ? 'This year' : '<a href="#" data-act="gotoday">Back to this year</a>') + '</small></div><button data-act="year" data-n="1" aria-label="Next year">›</button></div>';
    o += '<div class="sum">' +
      '<div class="stat"><b>' + fmtS(tot) + '</b><span>' + (delta(tot, ptot, true, (el < keys.length ? 'same point in ' : '') + (y - 1)) || 'focused time') + '</span></div>' +
      '<div class="stat"><b>' + fmt(tot / el) + '</b><span>average per day</span></div>' +
      '<div class="stat"><b>' + active + '</b><span>days with focus (of ' + el + ')</span></div>' +
      '<div class="stat"><b>' + longest(keys, function (k) { return foc[k] > 0; }) + ' days</b><span>longest focus streak</span></div></div>';
    o += '<h2>Every day of ' + y + '</h2><div class="heatwrap"><div class="heat">';
    var off = (new Date(y, 0, 1).getDay() + 6) % 7;
    for (var i = 0; i < off; i++) o += '<div class="blank"></div>';
    keys.forEach(function (k) { o += '<div class="l' + level(foc[k]) + (k === tk ? ' today' : '') + '" data-act="goday" data-k="' + k + '" title="' + k + ': ' + fmt(foc[k]) + '"></div>'; });
    o += '</div><div class="legend">less <i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> more</div></div>';
    var mx = Math.max.apply(null, mt.concat([60]));
    o += '<h2>Focused hours per month</h2><div class="chart">' + mt.map(function (t, i) {
      var isNow = y === new Date().getFullYear() && i === new Date().getMonth();
      return '<div class="c ' + (isNow ? 'now' : '') + '" data-act="gomonth" data-m="' + i + '"><b>' + (t ? fmtS(t) : '') + '</b><i style="height:' + (t / mx * 74) + '%"></i>' + mname(i, 'narrow') + '</div>';
    }).join('') + '</div>';
    o += '<h2>Activity × month</h2><div class="wrap"><table class="tbl"><tr><th></th>' + months.map(function (_, i) { return '<th>' + mname(i).slice(0, 3) + '</th>'; }).join('') + '<th>Total</th></tr>';
    S.activities.forEach(function (a) {
      o += '<tr><td title="' + h(a.name) + '">' + h(a.name) + '</td>';
      var all = 0;
      months.forEach(function (ks) { var t = actTotal(ks, a); all += t; o += '<td class="' + (t ? '' : 'z') + '">' + (t ? (a.type === 'check' ? t + 'd' : fmtS(t)) : '·') + '</td>'; });
      o += '<td class="tot">' + (a.type === 'check' ? all + 'd' : fmtS(all)) + '</td></tr>';
    });
    o += '</table></div><p class="muted">“d” = days done. ' + (tot ? 'Best month: ' + mname(bm, 'long') + ' (' + fmt(mt[bm]) + ').' : '') + ' Tap a month bar to open it.</p>';
    return o;
  }

  function vSettings() {
    var o = '<p class="muted">Rename, reorder or add what you track. “Time” items get a timer and a daily goal; “Yes/No” items are a simple check. Deleting an item hides it but keeps its past data in backups.</p>';
    S.activities.forEach(function (a, i) {
      o += '<div class="set"><input class="nm" data-act="rename" data-id="' + a.id + '" value="' + h(a.name) + '" aria-label="Name">' +
        '<div class="mv"><button data-act="mv" data-id="' + a.id + '" data-n="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button data-act="mv" data-id="' + a.id + '" data-n="1" aria-label="Move down"' + (i === S.activities.length - 1 ? ' disabled' : '') + '>↓</button></div>' +
        '<div class="opts"><select data-act="type" data-id="' + a.id + '"><option value="time"' + (a.type === 'time' ? ' selected' : '') + '>Time</option><option value="check"' + (a.type === 'check' ? ' selected' : '') + '>Yes/No</option></select>' +
        (a.type === 'time' ? '<span>Daily goal</span><input type="number" min="0" inputmode="numeric" data-act="goal" data-id="' + a.id + '" value="' + (a.goal || '') + '" placeholder="none"><span>min</span>' : '') +
        '<span style="flex:1"></span><button class="del ' + (pendingDel === a.id ? 'sure' : '') + '" data-act="del" data-id="' + a.id + '">' + (pendingDel === a.id ? 'Tap again to delete' : 'Delete') + '</button></div></div>';
    });
    o += '<button class="add" data-act="addact">+ Add something to track</button>';
    o += '<h2>Backup</h2><button class="wide" data-act="export">Download backup (.json)</button>' +
      '<label class="filebtn">Import a backup (merges with current data)<input type="file" accept="application/json,.json" data-act="import"></label>' +
      '<p class="muted">' + (flash ? h(flash) : 'Days logged: ' + Object.keys(S.days).length + '.') + '</p>';
    o += '<h2>This device</h2><button class="wide" data-act="syncnow">Sync now</button><button class="wide" data-act="logout">Forget passcode on this device</button>';
    return o;
  }

  function vLock() {
    return '<div class="lock"><h1>Daily Tracker</h1><p class="muted">Enter your passcode. Your data syncs to your own database on every device you use.</p>' +
      '<form id="lockf"><input type="password" id="pw" autocomplete="current-password" placeholder="Passcode" required><button type="submit">Unlock</button></form>' +
      '<p class="err">' + h(lockErr) + '</p></div>';
  }

  var app = document.getElementById('app');
  function render() {
    needRender = false;
    if (!pass) { app.innerHTML = vLock(); var p = document.getElementById('pw'); if (p) p.focus(); return; }
    var body = view === 'week' ? vWeek() : view === 'month' ? vMonth() : view === 'year' ? vYear() : view === 'settings' ? vSettings() : vToday();
    app.innerHTML = header() + body;
  }
  function safeRender() {
    var ae = document.activeElement;
    if (ae && ae !== document.body && app.contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type !== 'file'))) { needRender = true; return; }
    render();
  }
  app.addEventListener('focusout', function () { if (needRender) setTimeout(function () { if (needRender) safeRender(); }, 0); });

  // ---------- actions ----------
  function stopTimer() {
    var t = S.timer; if (!t) return;
    S.timer = null; S.timerAt = Date.now();
    var m = Math.round((Date.now() - t.start) / 60000);
    if (m > 0) setV(t.day, t.id, num(getV(t.day, t.id)) + m);
  }
  function setView(v) { view = v; ui.view = v; lsSet(LSUI, { view: v }); }

  app.addEventListener('submit', function (e) {
    if (e.target.id === 'lockf') { e.preventDefault(); var v = document.getElementById('pw').value; if (v) unlock(v); }
  });

  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA') return;
    var A = b.getAttribute('data-act'), id = b.getAttribute('data-id'), n = +b.getAttribute('data-n');
    if (A !== 'del') pendingDel = null;
    if (A !== 'export' && A !== 'import') flash = '';
    switch (A) {
      case 'view': setView(b.getAttribute('data-v')); if (view !== 'settings') cur = todayKey(); render(); window.scrollTo(0, 0); break;
      case 'day': cur = addDays(cur, n); render(); break;
      case 'month': var d = parse(cur); cur = key(new Date(d.getFullYear(), d.getMonth() + n, 1)); render(); break;
      case 'year': var dy = parse(cur); cur = key(new Date(dy.getFullYear() + n, 0, 1)); render(); break;
      case 'gotoday': e.preventDefault(); cur = todayKey(); render(); break;
      case 'goday': cur = b.getAttribute('data-k'); setView('today'); render(); window.scrollTo(0, 0); break;
      case 'gomonth': cur = key(new Date(parse(cur).getFullYear(), +b.getAttribute('data-m'), 1)); setView('month'); render(); window.scrollTo(0, 0); break;
      case 'add': setV(cur, id, Math.max(0, num(getV(cur, id)) + n)); commit(); break;
      case 'toggle': setV(cur, id, !getV(cur, id)); commit(); break;
      case 'timer':
        if (S.timer && S.timer.id === id) stopTimer();
        else { if (S.timer) stopTimer(); S.timer = { id: id, start: Date.now(), day: cur }; S.timerAt = Date.now(); }
        commit(); break;
      case 'mv':
        var i = S.activities.findIndex(function (a) { return a.id === id; }), j = i + n;
        if (j < 0 || j >= S.activities.length) return;
        var t = S.activities[i]; S.activities[i] = S.activities[j]; S.activities[j] = t; S.settingsAt = Date.now(); commit(); break;
      case 'del':
        if (pendingDel === id) {
          S.activities = S.activities.filter(function (a) { return a.id !== id; });
          if (S.timer && S.timer.id === id) { S.timer = null; S.timerAt = Date.now(); }
          S.settingsAt = Date.now(); pendingDel = null; commit();
        } else { pendingDel = id; render(); }
        break;
      case 'addact':
        S.activities.push({ id: 'a' + Date.now().toString(36), name: 'New activity', type: 'time', goal: 0 });
        S.settingsAt = Date.now(); commit();
        var ins = document.querySelectorAll('.nm'), last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); }
        break;
      case 'export':
        var blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tracker-backup-' + todayKey() + '.json';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        break;
      case 'wstart': startW(b.getAttribute('data-s')); commit(); break;
      case 'wsess':
        var ws = b.getAttribute('data-s'), dd = day(cur);
        if (ws === 'none') { if (!hasSets(wOf(cur))) delete dd.w; }
        else if (!wOf(cur)) startW(ws);
        else { dd.w.s = ws; dd.w.pos = posFor(ws, cur); }
        dd.u = Date.now(); commit(); break;
      case 'wadd':
        var wa = wOf(cur), ex = b.getAttribute('data-ex');
        if (wa) { wa.n = wa.n || {}; wa.n[ex] = num(wa.n[ex]) + 1; day(cur).u = Date.now(); commit(); }
        break;
      case 'syncnow': if (dirty) push(); else pull(); break;
      case 'logout': pass = null; lsDel(LSP); lockErr = ''; render(); break;
    }
  });

  app.addEventListener('change', function (e) {
    var el = e.target, A = el.getAttribute('data-act'), id = el.getAttribute('data-id'); if (!A) return;
    var a = act(id);
    if (A === 'wset') {
      var w = wOf(cur); if (!w) return;
      var exId = el.getAttribute('data-ex'), si = +el.getAttribute('data-i'), sf = +el.getAttribute('data-f');
      w.sets = w.sets || {}; var arr = w.sets[exId] = w.sets[exId] || [];
      while (arr.length <= si) arr.push(['', 0]);
      var val = el.value === '' ? (sf ? 0 : '') : Math.max(0, Math.round(num(el.value) * 2) / 2);
      arr[si][sf] = val;
      while (arr.length && !setDone(arr[arr.length - 1]) && arr[arr.length - 1][0] === '') arr.pop();
      if (setDone(arr[si]) && act('gym') && act('gym').type === 'check' && !getV(cur, 'gym')) setV(cur, 'gym', true);
      day(cur).u = Date.now(); commit(true);
    }
    else if (A === 'set') { setV(cur, id, Math.max(0, Math.round(num(el.value)))); commit(); }
    else if (A === 'note') { var d = day(cur); d.note = el.value.trim() ? el.value : ''; d.u = Date.now(); commit(); }
    else if (A === 'rename' && a) { a.name = el.value.trim() || a.name; S.settingsAt = Date.now(); commit(); }
    else if (A === 'type' && a) {
      a.type = el.value; if (a.type === 'check') delete a.goal; else a.goal = a.goal || 0;
      if (S.timer && S.timer.id === id && a.type === 'check') { S.timer = null; S.timerAt = Date.now(); }
      S.settingsAt = Date.now(); commit();
    }
    else if (A === 'goal' && a) { a.goal = Math.max(0, Math.round(num(el.value))); S.settingsAt = Date.now(); commit(); }
    else if (A === 'import' && el.files && el.files[0]) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var imp = JSON.parse(r.result);
          if (!imp || !Array.isArray(imp.activities) || !imp.days) throw new Error('bad');
          S = merge(S, imp); flash = 'Backup imported.'; commit();
        } catch (err) { flash = 'That file is not a tracker backup.'; render(); }
      };
      r.readAsText(el.files[0]);
    }
  });

  setInterval(function () { var el = document.getElementById('tclock'); if (el && S.timer) el.textContent = clock(Date.now() - S.timer.start); }, 1000);

  // rollover: if the app stays open past midnight, move "today" forward
  var lastToday = todayKey();
  setInterval(function () { var t = todayKey(); if (t !== lastToday) { if (cur === lastToday) cur = t; lastToday = t; if (!needRender) safeRender(); } }, 30000);

  render();
  if (pass) pull();
})();
