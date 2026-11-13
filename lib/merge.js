// Merges two copies of the tracker state (e.g. phone + laptop, or browser + server).
// Each day carries its own "u" (last-updated time), so edits made on different
// devices to different days never overwrite each other. Shared by the API and the browser.
(function (root) {
  function mergeState(a, b) {
    if (!a || typeof a !== 'object') return b || null;
    if (!b || typeof b !== 'object') return a;
    var out = { v: 2 };

    var sa = a.settingsAt || 0, sb = b.settingsAt || 0;
    out.activities = (sb >= sa ? b : a).activities || a.activities || b.activities || [];
    out.settingsAt = Math.max(sa, sb);
    var mig = (sb >= sa ? b : a).mig;
    if (mig) out.mig = mig;

    var ta = a.timerAt || 0, tb = b.timerAt || 0;
    out.timer = (tb >= ta ? b : a).timer || null;
    out.timerAt = Math.max(ta, tb);

    out.days = {};
    var da = a.days || {}, db = b.days || {};
    Object.keys(da).forEach(function (k) { out.days[k] = da[k]; });
    Object.keys(db).forEach(function (k) {
      var x = da[k], y = db[k];
      if (!x || ((y && y.u) || 0) >= ((x && x.u) || 0)) out.days[k] = y;
    });

    out.savedAt = Math.max(a.savedAt || 0, b.savedAt || 0);
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = mergeState;
  else root.mergeState = mergeState;
})(this);
