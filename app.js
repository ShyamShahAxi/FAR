/* =============================================================
   Fixed Asset Register — accounting & tax registers
   Pure client-side app. Data persists in localStorage.
   ============================================================= */

'use strict';

const STORE_KEY = 'far.assets.v1';
const SETTINGS_KEY = 'far.settings.v1';
const LEASES_KEY = 'far.leases.v1';
const DATA_VERSION_KEY = 'far.dataVersion'; // tracks which bundled dataset is loaded
const ACTIVE_ENTITY_KEY = 'far.activeEntity';  // code of the entity whose register is active
const ENTITIES_KEY = 'far.entities.v1';        // archive of {settings,assets,leases} per entity

/* ---------- Settings ---------- */
const defaultSettings = {
  companyName: 'Your Company Pty Ltd',
  currency: '$',
  fyEndMonth: 6,   // 1-12 ; Australian default 30 June
  fyEndDay: 30,
  reportingDate: null, // ISO yyyy-mm-dd ; null => today
  dtRate: 17,      // deferred-tax rate % (Singapore corporate tax 17%)
  locked: false,   // when true the entity/year is finalised — edits are blocked
};

let settings = loadSettings();
let assets = loadAssets();

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return Object.assign({}, defaultSettings, s || {});
  } catch (e) { return Object.assign({}, defaultSettings); }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

function loadAssets() {
  try {
    const a = JSON.parse(localStorage.getItem(STORE_KEY));
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}
function saveAssets() { localStorage.setItem(STORE_KEY, JSON.stringify(assets)); }

let leases = loadLeases();
function loadLeases() {
  try {
    const l = JSON.parse(localStorage.getItem(LEASES_KEY));
    return Array.isArray(l) ? l : [];
  } catch (e) { return []; }
}
function saveLeases() { localStorage.setItem(LEASES_KEY, JSON.stringify(leases)); }

/* ---------- Helpers ---------- */
function uid() {
  return 'A' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1e4).toString(36).toUpperCase();
}
function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function fmt(v) {
  const n = num(v);
  return settings.currency + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(v) {
  const n = num(v);
  const s = fmt(Math.abs(n));
  if (n < -0.005) return '(' + s + ')';
  return s;
}
function pct(v) { return num(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function parseDate(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? null : d; }
function toISO(d) {
  if (!d) return '';
  // Use LOCAL date parts, not toISOString() (which shifts to UTC and can roll
  // a local-midnight date back a day in timezones ahead of UTC — that made the
  // FY selector report 29 Jun instead of 30 Jun, under-depreciating by a day).
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function reportingDate() { return parseDate(settings.reportingDate) || new Date(new Date().toDateString()); }

/* Financial-year end on/after a given date */
function fyEndFor(date) {
  const m = settings.fyEndMonth, d = settings.fyEndDay;
  let end = new Date(date.getFullYear(), m - 1, d);
  if (date > end) end = new Date(date.getFullYear() + 1, m - 1, d);
  return end;
}
function fyStartFor(fyEnd) {
  return addDays(new Date(fyEnd.getFullYear() - 1, settings.fyEndMonth - 1, settings.fyEndDay), 1);
}
function fyLabel(fyEnd) {
  return 'FY' + String(fyEnd.getFullYear()).slice(-2);
}

/* Total capitalised accounting cost */
function acctCost(a) { return num(a.purchaseCost) + num(a.installationCost) + num(a.otherCost); }
/* Tax cost base (defaults to accounting cost when not overridden) */
function taxCost(a) { return a.taxCostOverride !== '' && a.taxCostOverride != null ? num(a.taxCostOverride) : acctCost(a); }

/* ---------- Work in progress / in-service ----------
   An asset may sit in a WIP holding category, carried at cost with no
   depreciation, until it is placed in service. From that in-service date it
   moves to its operating category and begins depreciating. These attributes
   are effective-dated so historical financial years stay stable: the asset is
   resolved to the category and depreciation status it held AS AT the reporting
   date, not its latest state. */
function hasWIP(a) { return !!(a && a.wipCategory && parseDate(a.inServiceDate)); }
/* Date depreciation starts — the in-service date, else the acquisition date. */
function depStartDate(a) { return parseDate(a.inServiceDate) || parseDate(a.acquisitionDate); }
/* Category the asset is presented under as at a given date. */
function categoryAsAt(a, atDate) {
  const cat = a.category || 'Uncategorised';
  if (!hasWIP(a)) return cat;
  const h = atDate || reportingDate();
  const svc = parseDate(a.inServiceDate);
  return (svc && h < svc) ? a.wipCategory : cat;
}

/* =============================================================
   DEPRECIATION ENGINE
   Builds a FY-by-FY schedule from acquisition to the earlier of
   disposal / end-of-life. Movements (opening, addition, charge,
   disposal, closing) are captured per financial year.
   ============================================================= */

function endOfLife(a, startDate, method, lifeYears) {
  if (method === 'reducing-balance' || method === 'diminishing-value' || method === 'prime-cost' && !lifeYears) {
    // rate-based methods have no fixed end date; cap by a long horizon
    return new Date(startDate.getFullYear() + 60, startDate.getMonth(), startDate.getDate());
  }
  const y = lifeYears || 0;
  const whole = Math.floor(y);
  const monthFrac = Math.round((y - whole) * 12);
  const e = new Date(startDate);
  e.setFullYear(e.getFullYear() + whole);
  e.setMonth(e.getMonth() + monthFrac);
  return e;
}

/* Build a generic schedule. cfg carries method + params + costs. */
function buildSchedule(a, kind, asOf) {
  const acq = parseDate(a.acquisitionDate);
  if (!acq) return { rows: [], error: 'No acquisition date' };

  // Opening-balance (opening-WDV) mode — accounting only. The asset is brought
  // forward at a net book value as at openingDate (= openingCost − openingAccDep),
  // and only depreciation from that date is computed, over the remaining life in
  // usefulLife. Lets a register tie to an opening trial balance without
  // re-deriving each asset's full pre-opening history.
  const opWDV = (kind === 'acct' && parseDate(a.openingDate)) ? parseDate(a.openingDate) : null;
  const startDate = opWDV || acq;

  const disposal = a.disposed ? parseDate(a.disposalDate) : null;
  const horizon = asOf || reportingDate();
  const depStart = opWDV || depStartDate(a) || acq;   // depreciation begins here (in-service date)

  let method, base, residual, lifeYears, rate, initialAllow;
  if (kind === 'acct') {
    method = a.acctMethod || 'straight-line';
    base = opWDV ? (num(a.openingCost) - num(a.openingAccDep)) : acctCost(a);
    residual = num(a.residualValue);
    lifeYears = num(a.usefulLife);
    rate = num(a.acctRate);
    initialAllow = 0;
  } else {
    method = a.taxMethod || 'prime-cost';
    base = taxCost(a);
    residual = 0; // tax written-down value depreciates toward nil
    lifeYears = num(a.taxLife);
    rate = num(a.taxRate);
    initialAllow = num(a.taxInitialAllowance);
  }

  const lifeEnd = (method === 'straight-line' && lifeYears)
    ? endOfLife(a, depStart, 'straight-line', lifeYears)
    : (method === 'prime-cost' && lifeYears && !rate ? endOfLife(a, depStart, 'prime-cost', lifeYears) : null);

  const rows = [];
  let opening = 0;
  let accumulated = opWDV ? num(a.openingAccDep) : 0;
  let fyEnd = fyEndFor(startDate);
  let carry = base;               // current book/written-down value
  let firstFY = true;
  let guard = 0;

  const depreciable = Math.max(0, base - residual);

  while (guard++ < 200) {
    const fyStart = fyStartFor(fyEnd);

    // Existence window inside this FY (cost sits on the register from acquisition,
    // or from the opening-balance date in opening-WDV mode)
    const winStart = startDate > fyStart ? startDate : fyStart;
    let winEnd = fyEnd;
    if (disposal && disposal < winEnd) winEnd = disposal;
    // Only accrue depreciation up to the reporting date (partial final year)
    if (horizon < winEnd) winEnd = horizon;
    if (winEnd < winStart) break;

    // Depreciation only runs once the asset is in service; while it is WIP
    // (before depStart) it is carried at cost and earns no depreciation.
    const depWinStart = depStart > winStart ? depStart : winStart;
    const daysInFY = daysBetween(fyStart, fyEnd) + 1;
    const depDays = winEnd >= depWinStart ? daysBetween(depWinStart, winEnd) + 1 : 0;
    let frac = Math.min(1, depDays / daysInFY);
    const inServiceThisFY = depStart >= fyStart && depStart <= fyEnd;

    // Tax (capital allowances) are NOT time-apportioned: a full annual
    // allowance is claimed in each year of assessment the asset is in use,
    // from the in-service YA — no pro-rating for the acquisition-year part
    // period. (Accounting depreciation keeps the day-count proration above.)
    if (kind === 'tax') frac = depDays > 0 ? 1 : 0;

    opening = carry;
    const addition = firstFY ? base : 0;
    let charge = 0;

    if (opening - residual > 0.005) {
      if (method === 'straight-line' || method === 'prime-cost') {
        let annual;
        if (method === 'prime-cost' && rate) {
          annual = base * (rate / 100);            // capital allowance % of cost
        } else if (lifeYears) {
          annual = depreciable / lifeYears;        // straight-line over life
        } else {
          annual = 0;
        }
        charge = annual * frac;
      } else { // reducing-balance / diminishing-value
        charge = opening * (rate / 100) * frac;
      }
      // Additional tax initial allowance, in the year the asset enters service
      if (inServiceThisFY && initialAllow) charge += base * (initialAllow / 100);
      // Never depreciate below residual (nil for tax)
      charge = Math.min(charge, opening - residual);
      if (charge < 0) charge = 0;
    }

    // One-off accounting depreciation adjustment (FX / catch-up / impairment),
    // applied in a single financial year and independent of the base — used for
    // reconciling lines (e.g. fixed-asset register to GL on foreign-currency
    // assets), so the adjustment shows in the depreciation column. It applies in
    // the FY of acctDepAdjDate if set, otherwise the reporting FY (so it stays put
    // when the register rolls forward to a later year).
    if (kind === 'acct' && a.acctDepAdjustment) {
      const adjEnd = a.acctDepAdjDate ? fyEndFor(parseDate(a.acctDepAdjDate)) : fyEndFor(horizon);
      if (adjEnd && fyEnd.getTime() === adjEnd.getTime()) charge += num(a.acctDepAdjustment);
    }

    accumulated += charge;
    carry = opening - charge;

    let disposalRemoval = 0;
    let disposed = false;
    if (disposal && disposal <= fyEnd && disposal >= fyStart && disposal <= horizon) {
      disposalRemoval = carry; // remove remaining book value at disposal
      disposed = true;
    }

    rows.push({
      fyEnd: new Date(fyEnd),
      label: fyLabel(fyEnd),
      opening, addition, charge,
      closing: disposed ? 0 : carry,
      accumulated,
      disposalRemoval,
      disposed,
      current: horizon >= fyStart && horizon <= fyEnd,
    });

    if (disposed) break;
    if (lifeEnd && fyEnd >= lifeEnd) break;
    if (carry - residual <= 0.005 && (method === 'straight-line' || method === 'prime-cost')) break;
    if (fyEnd >= horizon) break;
    if (rate === 0 && method !== 'straight-line' && method !== 'prime-cost') break;

    firstFY = false;
    fyEnd = new Date(fyEnd.getFullYear() + 1, settings.fyEndMonth - 1, settings.fyEndDay);
  }

  return { rows, base, residual, method };
}

/* Position of an asset (accounting or tax) as at the reporting date */
function positionAt(a, kind) {
  const sched = buildSchedule(a, kind);
  const horizon = reportingDate();
  const base = kind === 'acct' ? acctCost(a) : taxCost(a);
  let accumulated = 0, nbv = base;
  let chargeThisFY = 0, openingThisFY = base, disposalRemoval = 0;
  let disposedInView = false;

  for (const r of sched.rows) {
    if (sameFY(r.fyEnd, horizon)) {
      // The financial year containing the reporting date — the movement year.
      chargeThisFY = r.charge;
      openingThisFY = r.opening;
      disposalRemoval = r.disposalRemoval;
      disposedInView = r.disposed;
      accumulated = r.accumulated;
      nbv = r.disposed ? 0 : r.closing;
      break;
    }
    if (r.fyEnd < horizon) {
      accumulated = r.accumulated;
      nbv = r.disposed ? 0 : r.closing;
      // No movement row in the reporting FY yet: opening = last closing balance.
      openingThisFY = nbv;
      chargeThisFY = 0;
      disposalRemoval = 0;
    } else {
      break; // row is beyond the reporting FY
    }
  }

  const disposed = a.disposed && parseDate(a.disposalDate) && parseDate(a.disposalDate) <= horizon;
  return {
    sched, accumulated, nbv: disposed ? 0 : nbv,
    chargeThisFY, openingThisFY, disposalRemoval, disposedInView, disposed,
  };
}

function sameFY(a, b) { return fyEndFor(a).getTime() === fyEndFor(b).getTime(); }

/* =============================================================
   DISPOSAL OUTCOMES
   ============================================================= */
function disposalOutcome(a) {
  if (!a.disposed) return null;
  const proceeds = num(a.disposalProceeds);
  const d = parseDate(a.disposalDate);
  // Measure book/written-down value AT the disposal date, independent of the
  // reporting date, so gains/losses on prior-year disposals stay correct.
  const acctRow = buildSchedule(a, 'acct', d).rows.find(r => r.disposed);
  const taxRow = buildSchedule(a, 'tax', d).rows.find(r => r.disposed);
  const acctNBV = acctRow ? acctRow.disposalRemoval : 0;
  const taxWDV = taxRow ? taxRow.disposalRemoval : 0;
  return {
    proceeds,
    acctNBV,
    acctGain: proceeds - acctNBV,               // profit(+)/loss(-) on disposal
    taxWDV,
    balancing: proceeds - taxWDV,               // balancing charge(+)/allowance(-)
  };
}

/* =============================================================
   RENDERING
   ============================================================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let activeTab = 'dashboard';
let editingId = null;
const filterState = { category: '', status: '', q: '' };

function categories() {
  return Array.from(new Set(assets.map(a => a.category).filter(Boolean))).sort();
}

function activeAssets(atDate) {
  const h = atDate || reportingDate();
  return assets.filter(a => {
    const acq = parseDate(a.acquisitionDate);
    if (acq && acq > h) return false; // not yet acquired
    return true;
  });
}
function isDisposed(a, atDate) {
  const h = atDate || reportingDate();
  const d = a.disposed && parseDate(a.disposalDate);
  return d && d <= h;
}

/* ----- Dashboard ----- */
function renderDashboard() {
  const live = activeAssets().filter(a => !isDisposed(a));
  let totalCost = 0, totalAcctDep = 0, totalNBV = 0, totalTaxWDV = 0, fyCharge = 0, fyTaxCharge = 0;
  const byCat = {};

  live.forEach(a => {
    const acct = positionAt(a, 'acct');
    const tax = positionAt(a, 'tax');
    totalCost += acctCost(a);
    totalAcctDep += acct.accumulated;
    totalNBV += acct.nbv;
    totalTaxWDV += tax.nbv;
    fyCharge += acct.chargeThisFY;
    fyTaxCharge += tax.chargeThisFY;
    const c = categoryAsAt(a);
    if (!byCat[c]) byCat[c] = { cost: 0, nbv: 0, count: 0 };
    byCat[c].cost += acctCost(a);
    byCat[c].nbv += acct.nbv;
    byCat[c].count += 1;
  });

  const disposedThisView = assets.filter(a => isDisposed(a));

  $('#kpi-row').innerHTML = `
    <div class="kpi"><div class="label">Active Assets</div><div class="value">${live.length}</div><div class="hint">${disposedThisView.length} disposed</div></div>
    <div class="kpi"><div class="label">Gross Cost</div><div class="value sm">${fmt(totalCost)}</div><div class="hint">capitalised value</div></div>
    <div class="kpi"><div class="label">Accum. Depreciation</div><div class="value sm">${fmt(totalAcctDep)}</div><div class="hint">to reporting date</div></div>
    <div class="kpi"><div class="label">Net Book Value</div><div class="value sm">${fmt(totalNBV)}</div><div class="hint">accounting carrying amount</div></div>
    <div class="kpi"><div class="label">Tax Written-Down Value</div><div class="value sm">${fmt(totalTaxWDV)}</div><div class="hint">closing TWDV</div></div>
    <div class="kpi"><div class="label">Temporary Difference</div><div class="value sm ${totalNBV - totalTaxWDV >= 0 ? '' : 'neg'}">${fmtSigned(totalNBV - totalTaxWDV)}</div><div class="hint">NBV − TWDV</div></div>
    <div class="kpi"><div class="label">Deferred Tax ${totalNBV - totalTaxWDV >= 0 ? 'Liability' : 'Asset'}</div><div class="value sm ${totalNBV - totalTaxWDV >= 0 ? '' : 'neg'}">${fmt(Math.abs((totalNBV - totalTaxWDV) * num(settings.dtRate) / 100))}</div><div class="hint">@ ${pct(settings.dtRate)}</div></div>
  `;

  const cats = Object.entries(byCat).sort((a, b) => b[1].cost - a[1].cost);
  const maxCost = Math.max(1, ...cats.map(c => c[1].cost));
  $('#cat-breakdown').innerHTML = cats.length ? cats.map(([name, v]) => `
    <div class="bar-row">
      <div>${esc(name)} <span class="hint">(${v.count})</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v.cost / maxCost * 100).toFixed(1)}%"></div></div>
      <div class="num">${fmt(v.cost)}</div>
    </div>`).join('') : '<p class="hint-text">No assets yet.</p>';

  $('#fy-summary').innerHTML = `
    <table>
      <tbody>
        <tr><td>Reporting date</td><td class="num">${toISO(reportingDate())}</td></tr>
        <tr><td>Financial year</td><td class="num">${fyLabel(fyEndFor(reportingDate()))}</td></tr>
        <tr><td>Accounting depreciation charge (FY)</td><td class="num">${fmt(fyCharge)}</td></tr>
        <tr><td>Tax depreciation / allowances (FY)</td><td class="num">${fmt(fyTaxCharge)}</td></tr>
        <tr><td>Book-vs-tax charge difference (FY)</td><td class="num ${fyCharge - fyTaxCharge >= 0 ? '' : 'neg'}">${fmtSigned(fyCharge - fyTaxCharge)}</td></tr>
        <tr><td>Deferred tax ${totalNBV - totalTaxWDV >= 0 ? 'liability' : 'asset'} (NBV − TWDV × ${pct(settings.dtRate)})</td><td class="num ${totalNBV - totalTaxWDV >= 0 ? '' : 'neg'}">${fmt(Math.abs((totalNBV - totalTaxWDV) * num(settings.dtRate) / 100))}</td></tr>
      </tbody>
    </table>`;
}

/* ----- Assets list (grouped by category, collapsible) ----- */
function filteredAssets() {
  const q = filterState.q.toLowerCase();
  return assets.filter(a => {
    if (filterState.status === 'active' && isDisposed(a)) return false;
    if (filterState.status === 'disposed' && !isDisposed(a)) return false;
    if (q) {
      const hay = [a.tag, a.description, a.category, a.location, a.department, a.custodian, a.supplier]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderAssets() {
  if (!$('#assets-wrap')) return; // stale/cached HTML guard
  const searching = !!filterState.q;
  const list = filteredAssets();
  const groups = {};
  list.forEach(a => { const c = categoryAsAt(a); (groups[c] = groups[c] || []).push(a); });
  const cats = Object.keys(groups).sort();

  let tCost = 0, tAcc = 0, tNbv = 0, bodies = '';
  cats.forEach(cat => {
    const items = groups[cat].slice().sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
    let cCost = 0, cAcc = 0, cNbv = 0, disposed = 0, hidden = 0;
    const detailRows = [];
    items.forEach(a => {
      const acct = positionAt(a, 'acct');
      const disp = isDisposed(a);
      if (disp) disposed++;
      cCost += acctCost(a); cAcc += acct.accumulated; cNbv += acct.nbv;
      // Fully depreciated & still held (nil NBV, not disposed) — hide unless toggled on.
      const nil = Math.abs(acct.nbv) < 0.005 && !disp;
      if (nil && !showFullyDepreciated) { hidden++; return; }
      detailRows.push(`<tr class="asset-row">
        <td class="asset-name">
          <strong>${esc(a.tag || a.id)}</strong> ${esc(a.description || '')}
          <div class="hint-text">${esc(a.location || '')}${a.department ? ' · ' + esc(a.department) : ''}</div>
        </td>
        <td class="num">${esc(a.acquisitionDate || '')}</td>
        <td class="num">${fmt(acctCost(a))}</td>
        <td class="num">${fmt(acct.accumulated)}</td>
        <td class="num">${fmt(acct.nbv)}</td>
        <td>${disp ? '<span class="pill red">Disposed</span>' : '<span class="pill green">Active</span>'}</td>
        <td>
          <button class="sm" onclick="openAsset('${a.id}')">Edit</button>
          <button class="sm danger" onclick="deleteAsset('${a.id}')">Del</button>
        </td>
      </tr>`);
    });
    if (hidden) detailRows.push(`<tr class="asset-row hint"><td colspan="7" class="hint-text" style="padding-left:28px">${hidden} fully-depreciated asset${hidden > 1 ? 's' : ''} hidden &middot; tick &ldquo;Show fully-depreciated&rdquo; to view.</td></tr>`);
    const detail = detailRows.join('');

    tCost += cCost; tAcc += cAcc; tNbv += cNbv;
    const key = 'assets::' + cat;
    const open = expandedCats.has(key) || searching;   // auto-expand while searching
    bodies += `<tbody class="cat-group">
      <tr class="cat-row${open ? ' open' : ''}" data-key="${esc(key)}">
        <td class="cat-name"><span class="chev">▸</span> ${esc(cat)} <span class="count">${items.length}</span>${disposed ? ' <span class="pill red" style="font-size:.65rem">' + disposed + ' disp.</span>' : ''}</td>
        <td></td>
        <td class="num">${fmt(cCost)}</td>
        <td class="num">${fmt(cAcc)}</td>
        <td class="num">${fmt(cNbv)}</td>
        <td></td><td></td>
      </tr>
      ${open ? detail : ''}
    </tbody>`;
  });

  const empty = `<tbody><tr class="empty-row"><td colspan="7">No assets match. Click “Add Asset” to create one, or load a dataset from the Data tab.</td></tr></tbody>`;
  $('#assets-wrap').innerHTML = `<table class="reg-table">
    <thead><tr>
      <th>Category / Asset</th><th class="num">Acquired</th><th class="num">Cost</th>
      <th class="num">Accum. Dep</th><th class="num">NBV</th><th>Status</th><th>Actions</th>
    </tr></thead>
    ${cats.length ? bodies : empty}
    <tfoot><tr>
      <td>Totals</td><td></td><td class="num">${fmt(tCost)}</td>
      <td class="num">${fmt(tAcc)}</td><td class="num">${fmt(tNbv)}</td><td></td><td></td>
    </tr></tfoot>
  </table>`;
  $('#assets-count').textContent = `${list.length} of ${assets.length} assets · ${cats.length} categories`;
  updateAssetsExpandButton();
  const chk = $('#assets-showall');
  if (chk) chk.checked = showFullyDepreciated;
}

function toggleAssetsCat(key) {
  if (expandedCats.has(key)) expandedCats.delete(key); else expandedCats.add(key);
  renderAssets();
}
function toggleAllAssetsCats() {
  const cats = Array.from(new Set(filteredAssets().map(a => categoryAsAt(a))));
  const keys = cats.map(c => 'assets::' + c);
  const allOpen = keys.length && keys.every(k => expandedCats.has(k));
  keys.forEach(k => { if (allOpen) expandedCats.delete(k); else expandedCats.add(k); });
  renderAssets();
}
function updateAssetsExpandButton() {
  const btn = $('#assets-expand');
  if (!btn) return;
  const cats = Array.from(new Set(filteredAssets().map(a => categoryAsAt(a))));
  const allOpen = cats.length && cats.every(c => expandedCats.has('assets::' + c));
  btn.textContent = allOpen ? 'Collapse all' : 'Expand all';
}

/* ----- Registers (grouped by category, collapsible) ----- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) { return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; }
const expandedCats = new Set();       // keys: "acct::<category>" / "tax::<category>"
let showFullyDepreciated = false;     // when false, hide nil / fully-depreciated dormant assets

/* Movement of one asset within the reporting financial year */
function assetMovement(a, kind) {
  const p = positionAt(a, kind);
  const cost = kind === 'acct' ? acctCost(a) : taxCost(a);
  const addition = sameFYAcquisition(a) ? cost : 0;
  return {
    opening: p.openingThisFY - addition,
    addition,
    charge: p.chargeThisFY,
    disposal: p.disposalRemoval,
    closing: p.disposedInView ? 0 : p.nbv,
    accumulated: p.accumulated,
    sched: p.sched,
  };
}

function methodLabelFor(a, kind) {
  if (kind === 'acct') {
    return a.acctMethod === 'reducing-balance'
      ? `Reducing balance ${pct(a.acctRate)}` : `Straight-line ${num(a.usefulLife)}y`;
  }
  if (num(a.taxInitialAllowance) >= 100) return '100% write-off (1-year)';
  const base = a.taxMethod === 'diminishing-value'
    ? `Diminishing value ${pct(a.taxRate)}`
    : (a.taxRate ? `Prime cost ${pct(a.taxRate)}` : `Prime cost ${num(a.taxLife)}y allowance`);
  return base + (num(a.taxInitialAllowance) ? ` + IA ${pct(a.taxInitialAllowance)}` : '');
}

function movCell(v) { return v ? '(' + fmt(v) + ')' : '–'; }
/* Signed transfer cell: transfer-in positive, transfer-out in parentheses. */
function xferCell(v) {
  if (!v || Math.abs(v) < 0.005) return '–';
  return v > 0 ? fmt(v) : '(' + fmt(-v) + ')';
}

/* Register contribution(s) for one asset in the reporting FY. Normally one line
   grouped under the asset's as-at category. In the financial year a WIP asset is
   placed in service it produces TWO lines: a transfer-out of the holding
   category and a transfer-in to the operating category, netting to nil on cost
   so category subtotals reconcile. */
function registerLines(a, kind) {
  const m = assetMovement(a, kind);
  const H = reportingDate();
  const fyEnd = fyEndFor(H), fyStart = fyStartFor(fyEnd);
  const acq = parseDate(a.acquisitionDate);
  const svc = parseDate(a.inServiceDate);
  const cost = kind === 'acct' ? acctCost(a) : taxCost(a);
  // Show the transfer only once the reporting date has actually reached the
  // in-service date within its financial year (H >= svc); before that the asset
  // is still WIP and falls through to the single-line branch below.
  const transferThisFY = hasWIP(a) && svc && svc >= fyStart && svc <= fyEnd && H >= svc && acq && !sameFY(acq, svc);
  if (transferThisFY) {
    return [
      { cat: a.wipCategory, opening: cost, addition: 0, transfer: -cost, charge: 0, disposal: 0, closing: 0, sched: null, transferRow: -1 },
      { cat: a.category || 'Uncategorised', opening: 0, addition: 0, transfer: cost, charge: m.charge, disposal: m.disposal, closing: m.closing, sched: m.sched, transferRow: 1 },
    ];
  }
  return [{ cat: categoryAsAt(a, H), opening: m.opening, addition: m.addition, transfer: 0, charge: m.charge, disposal: m.disposal, closing: m.closing, sched: m.sched, transferRow: 0 }];
}

/* Distinct display categories a register groups into (mirrors renderRegister). */
function registerGroupCats(kind) {
  const set = new Set();
  activeAssets().forEach(a => registerLines(a, kind).forEach(ln => set.add(ln.cat || 'Uncategorised')));
  return Array.from(set);
}

function renderRegister(kind) {
  const wrap = $('#' + kind + '-wrap');
  if (!wrap) return; // stale/cached HTML guard
  const fyEnd = fyEndFor(reportingDate());
  const fyStart = fyStartFor(fyEnd);
  const closeLbl = kind === 'tax' ? 'TWDV' : 'NBV';
  const isTax = kind === 'tax';
  const rate = num(settings.dtRate) / 100;      // deferred-tax rate
  const chargeLbl = isTax ? 'Capital allowance' : 'Depreciation';

  // Build category → contribution lines. A WIP asset placed in service in the
  // viewed FY splits across its holding and operating categories (see registerLines).
  const groups = {};
  activeAssets().forEach(a => {
    registerLines(a, kind).forEach(ln => {
      const c = ln.cat || 'Uncategorised';
      (groups[c] = groups[c] || []).push({ a, ln });
    });
  });
  const cats = Object.keys(groups).sort();

  let tO = 0, tA = 0, tX = 0, tC = 0, tD = 0, tCl = 0, tDt = 0;
  let bodies = '';

  cats.forEach(cat => {
    const entries = groups[cat].slice().sort((p, q) => (p.a.tag || '').localeCompare(q.a.tag || ''));
    let cO = 0, cA = 0, cX = 0, cC = 0, cD = 0, cCl = 0, cDt = 0, hidden = 0;
    const detailRows = [];
    entries.forEach(({ a, ln }) => {
      cO += ln.opening; cA += ln.addition; cX += ln.transfer; cC += ln.charge; cD += ln.disposal; cCl += ln.closing;
      // Deferred tax on this line = (accounting NBV − tax WDV) × rate. Only on
      // the operating line (not the WIP transfer-out), so it isn't double counted.
      const dt = isTax && ln.transferRow !== -1 ? (positionAt(a, 'acct').nbv - ln.closing) * rate : 0;
      cDt += dt;
      // Dormant & nil: no opening, no movement, no closing — hide unless toggled on.
      const dormantNil = Math.abs(ln.opening) < 0.005 && Math.abs(ln.addition) < 0.005 && Math.abs(ln.transfer) < 0.005 &&
        Math.abs(ln.charge) < 0.005 && Math.abs(ln.disposal) < 0.005 && Math.abs(ln.closing) < 0.005;
      if (dormantNil && !showFullyDepreciated) { hidden++; return; }
      const tag = ln.transferRow === -1 ? ' <span class="pill amber">transfer out &rarr;</span>'
        : ln.transferRow === 1 ? ' <span class="pill amber">&rarr; transfer in</span>' : '';
      const schedCell = ln.sched ? `<details class="sched"><summary>Schedule</summary>${scheduleTable(ln.sched, kind)}</details>` : '';
      detailRows.push(`<tr class="asset-row">
        <td class="asset-name">
          <strong>${esc(a.tag || a.id)}</strong> ${esc(a.description || '')}${tag}
          <div class="hint-text">${methodLabelFor(a, kind)}${a.department ? ' · ' + esc(a.department) : ''}</div>
          ${schedCell}
        </td>
        <td class="num">${fmt(ln.opening)}</td>
        <td class="num">${ln.addition ? fmt(ln.addition) : '–'}</td>
        <td class="num">${xferCell(ln.transfer)}</td>
        <td class="num">${movCell(ln.charge)}</td>
        <td class="num">${movCell(ln.disposal)}</td>
        <td class="num">${fmt(ln.closing)}</td>
        ${isTax ? `<td class="num">${fmtSigned(dt)}</td>` : ''}
      </tr>`);
    });
    if (hidden) detailRows.push(`<tr class="asset-row hint"><td colspan="${isTax ? 8 : 7}" class="hint-text" style="padding-left:28px">${hidden} fully-depreciated asset${hidden > 1 ? 's' : ''} hidden &middot; tick &ldquo;Show fully-depreciated&rdquo; to view.</td></tr>`);
    const detail = detailRows.join('');

    tO += cO; tA += cA; tX += cX; tC += cC; tD += cD; tCl += cCl; tDt += cDt;
    const key = kind + '::' + cat;
    const open = expandedCats.has(key);
    bodies += `<tbody class="cat-group">
      <tr class="cat-row${open ? ' open' : ''}" data-key="${esc(key)}">
        <td class="cat-name"><span class="chev">▸</span> ${esc(cat)} <span class="count">${entries.length}</span></td>
        <td class="num">${fmt(cO)}</td>
        <td class="num">${cA ? fmt(cA) : '–'}</td>
        <td class="num">${xferCell(cX)}</td>
        <td class="num">${movCell(cC)}</td>
        <td class="num">${movCell(cD)}</td>
        <td class="num">${fmt(cCl)}</td>
        ${isTax ? `<td class="num">${fmtSigned(cDt)}</td>` : ''}
      </tr>
      ${open ? detail : ''}
    </tbody>`;
  });

  const empty = `<tbody><tr class="empty-row"><td colspan="${isTax ? 8 : 7}">No assets to report.</td></tr></tbody>`;
  wrap.innerHTML = `<table class="reg-table">
    <thead><tr>
      <th>Category / Asset</th>
      <th class="num">Opening ${closeLbl}<div class="hint-th">${fmtDate(fyStart)}</div></th>
      <th class="num">Additions</th>
      <th class="num">Transfers</th>
      <th class="num">${chargeLbl}</th>
      <th class="num">Disposals</th>
      <th class="num">Closing ${closeLbl}<div class="hint-th">${fmtDate(fyEnd)}</div></th>
      ${isTax ? `<th class="num">Deferred tax<div class="hint-th">liab. @ ${pct(settings.dtRate)}</div></th>` : ''}
    </tr></thead>
    ${cats.length ? bodies : empty}
    <tfoot><tr>
      <td>Totals — ${fyLabel(fyEnd)}</td>
      <td class="num">${fmt(tO)}</td>
      <td class="num">${tA ? fmt(tA) : '–'}</td>
      <td class="num">${xferCell(tX)}</td>
      <td class="num">${movCell(tC)}</td>
      <td class="num">${movCell(tD)}</td>
      <td class="num">${fmt(tCl)}</td>
      ${isTax ? `<td class="num">${fmtSigned(tDt)}</td>` : ''}
    </tr></tfoot>
  </table>`;

  $('#' + kind + '-fy-label').textContent =
    fyLabel(fyEnd) + ' · ' + fmtDate(fyStart) + ' – ' + fmtDate(fyEnd);
  populateFYSelect(kind);
  updateExpandButton(kind);
  const chk = $('#' + kind + '-showall');
  if (chk) chk.checked = showFullyDepreciated;
}

function renderAcctRegister() { renderRegister('acct'); }
function renderTaxRegister() { renderRegister('tax'); }

/* Show/hide fully-depreciated (nil) assets across all grouped views */
function setShowAll(v) {
  showFullyDepreciated = v;
  ['acct-showall', 'tax-showall', 'assets-showall'].forEach(id => {
    const el = $('#' + id); if (el) el.checked = v;
  });
  renderAll();
}

/* Financial years spanned by the register (for the FY switcher) */
function availableFYs() {
  const acqs = assets.map(a => parseDate(a.acquisitionDate)).filter(Boolean);
  let minY, maxY;
  if (acqs.length) {
    minY = fyEndFor(new Date(Math.min.apply(null, acqs))).getFullYear();
    maxY = fyEndFor(new Date(Math.max.apply(null, acqs))).getFullYear();
  } else {
    minY = maxY = fyEndFor(new Date()).getFullYear();
  }
  maxY = Math.max(maxY, fyEndFor(reportingDate()).getFullYear()) + 1; // +1 to view run-off
  const out = [];
  for (let y = minY; y <= maxY; y++) out.push(new Date(y, settings.fyEndMonth - 1, settings.fyEndDay));
  return out;
}

function populateFYSelect(kind) {
  const sel = $('#' + kind + '-fy-select');
  if (!sel) return;
  const current = toISO(fyEndFor(reportingDate()));
  sel.innerHTML = availableFYs().map(d => {
    const iso = toISO(d);
    const start = fyStartFor(d);
    return `<option value="${iso}"${iso === current ? ' selected' : ''}>${fyLabel(d)} (${fmtDate(start)} – ${fmtDate(d)})</option>`;
  }).join('');
}

function onFYChange(iso) {
  settings.reportingDate = iso;   // reporting date = selected financial-year end
  saveSettings();
  applySettingsHeader();
  applySettingsToUI();
  renderAll();
}

function toggleCat(key) {
  if (expandedCats.has(key)) expandedCats.delete(key); else expandedCats.add(key);
  renderRegister(key.split('::')[0]);
}

function toggleAllCats(kind) {
  const keys = registerGroupCats(kind).map(c => kind + '::' + c);
  const allOpen = keys.length && keys.every(k => expandedCats.has(k));
  keys.forEach(k => { if (allOpen) expandedCats.delete(k); else expandedCats.add(k); });
  renderRegister(kind);
}

function updateExpandButton(kind) {
  const btn = $('#' + kind + '-expand');
  if (!btn) return;
  const cats = registerGroupCats(kind);
  const allOpen = cats.length && cats.every(c => expandedCats.has(kind + '::' + c));
  btn.textContent = allOpen ? 'Collapse all' : 'Expand all';
}

function sameFYAcquisition(a) {
  const acq = parseDate(a.acquisitionDate);
  if (!acq) return false;
  return sameFY(acq, reportingDate());
}

function scheduleTable(sched, kind) {
  if (!sched.rows || !sched.rows.length) return '<p class="hint-text">No schedule.</p>';
  const closingLabel = kind === 'tax' ? 'Closing TWDV' : 'Closing NBV';
  const body = sched.rows.map(r => `<tr${r.current ? ' style="background:#eef6ff"' : ''}>
      <td>${r.label}</td>
      <td class="num">${fmt(r.opening)}</td>
      <td class="num">${fmt(r.charge)}</td>
      <td class="num">${fmt(r.accumulated)}</td>
      <td class="num">${r.disposed ? 'Disposed' : fmt(r.closing)}</td>
    </tr>`).join('');
  return `<div class="table-wrap" style="margin-top:8px;max-width:520px"><table>
    <thead><tr><th>Year</th><th class="num">Opening</th><th class="num">Charge</th><th class="num">Accum.</th><th class="num">${closingLabel}</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

/* ----- Disposals ----- */
function renderDisposals() {
  const disposed = assets.filter(a => a.disposed && parseDate(a.disposalDate));
  disposed.sort((a, b) => (b.disposalDate || '').localeCompare(a.disposalDate || ''));
  let tProceeds = 0, tGain = 0, tBal = 0;

  const rows = disposed.map(a => {
    const o = disposalOutcome(a);
    tProceeds += o.proceeds; tGain += o.acctGain; tBal += o.balancing;
    return `<tr>
      <td><strong>${esc(a.tag || a.id)}</strong><div class="hint-text">${esc(a.description || '')}</div></td>
      <td class="num">${esc(a.disposalDate)}</td>
      <td class="num">${fmt(o.proceeds)}</td>
      <td class="num">${fmt(o.acctNBV)}</td>
      <td class="num ${o.acctGain >= 0 ? 'pos' : 'neg'}">${fmtSigned(o.acctGain)}<div class="hint-text">${o.acctGain >= 0 ? 'profit' : 'loss'}</div></td>
      <td class="num">${fmt(o.taxWDV)}</td>
      <td class="num ${o.balancing >= 0 ? 'neg' : 'pos'}">${fmtSigned(o.balancing)}<div class="hint-text">${o.balancing >= 0 ? 'balancing charge' : 'balancing allowance'}</div></td>
      <td><button class="sm" onclick="openAsset('${a.id}')">Edit</button></td>
    </tr>`;
  }).join('');

  $('#disposals-body').innerHTML = disposed.length ? rows :
    '<tr class="empty-row"><td colspan="8">No disposals recorded. Mark an asset as disposed from its edit form.</td></tr>';
  $('#disposals-foot').innerHTML = `<tr>
    <td colspan="2">Totals</td>
    <td class="num">${fmt(tProceeds)}</td><td></td>
    <td class="num ${tGain >= 0 ? 'pos' : 'neg'}">${fmtSigned(tGain)}</td><td></td>
    <td class="num ${tBal >= 0 ? 'neg' : 'pos'}">${fmtSigned(tBal)}</td><td></td></tr>`;
}

/* =============================================================
   LEASES (IFRS 16 right-of-use assets & lease liabilities)
   A disclosure schedule from the period movements. Right-of-use assets
   are depreciated over the lease term (P&L expense, no tax capital
   allowance — the tax deduction is the actual lease payment); the lease
   liability unwinds with interest and is reduced by payments.
   ============================================================= */
function renderLeases() {
  const wrap = $('#leases-wrap');
  if (!wrap) return; // stale/cached HTML guard
  if (!leases.length) {
    wrap.innerHTML = '<p class="hint-text">No leases recorded. The bundled AUS155 dataset carries the aggregate IFRS 16 position; a per-lease schedule needs each lease’s term and payments.</p>';
    return;
  }
  let rouOpen = 0, rouAdd = 0, rouDep = 0, rouClose = 0;
  let liaOpen = 0, liaAdd = 0, liaPay = 0, liaClose = 0;
  const rows = leases.map(l => {
    const roOpen = num(l.rouCostOpening) - num(l.rouAccDepOpening);
    const roClose = num(l.rouCostClosing) - num(l.rouAccDepClosing);
    rouOpen += roOpen; rouAdd += num(l.rouAdditions); rouDep += num(l.rouDepCharge); rouClose += roClose;
    liaOpen += num(l.liabOpening); liaAdd += num(l.liabAdditions); liaPay += num(l.liabPayments); liaClose += num(l.liabClosing);
    const net = roClose - num(l.liabClosing);
    return `<tr class="asset-row">
      <td class="asset-name"><strong>${esc(l.name || l.id)}</strong>${l.notes ? `<div class="hint-text">${esc(l.notes)}</div>` : ''}</td>
      <td class="num">${fmt(roOpen)}</td>
      <td class="num">${num(l.rouAdditions) ? fmt(l.rouAdditions) : '–'}</td>
      <td class="num">${movCell(num(l.rouDepCharge))}</td>
      <td class="num">${fmt(roClose)}</td>
      <td class="num">${fmt(l.liabClosing)}</td>
      <td class="num ${net >= 0 ? '' : 'neg'}">${fmtSigned(net)}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="card" style="padding:14px 18px;margin-bottom:14px"><p class="legend" style="margin:0">Right-of-use (ROU) assets and lease liabilities under IFRS 16, from the period movements. ROU assets are depreciated over the lease term; the liability unwinds with interest and reduces as lease payments are made. For <strong>tax</strong>, ROU depreciation and interest are added back and the actual lease payments are deducted instead — there is no capital allowance on an ROU asset.</p></div>
    <div class="table-wrap"><table class="reg-table">
      <thead><tr>
        <th>Lease</th>
        <th class="num">Opening ROU NBV</th>
        <th class="num">Additions</th>
        <th class="num">Depreciation</th>
        <th class="num">Closing ROU NBV</th>
        <th class="num">Lease liability</th>
        <th class="num">Net position</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td>Totals</td>
        <td class="num">${fmt(rouOpen)}</td>
        <td class="num">${rouAdd ? fmt(rouAdd) : '–'}</td>
        <td class="num">${movCell(rouDep)}</td>
        <td class="num">${fmt(rouClose)}</td>
        <td class="num">${fmt(liaClose)}</td>
        <td class="num ${rouClose - liaClose >= 0 ? '' : 'neg'}">${fmtSigned(rouClose - liaClose)}</td>
      </tr></tfoot>
    </table></div>
    <div class="two-col" style="margin-top:16px">
      <div class="card">
        <h3 style="margin-top:0">Right-of-use asset movement (FY)</h3>
        <table><tbody>
          <tr><td>Opening cost</td><td class="num">${fmt(rouCostTotal('rouCostOpening'))}</td></tr>
          <tr><td>Additions / remeasurement</td><td class="num">${fmt(rouCostTotal('rouAdditions'))}</td></tr>
          <tr><td>Closing cost</td><td class="num">${fmt(rouCostTotal('rouCostClosing'))}</td></tr>
          <tr><td>Accumulated depreciation</td><td class="num">${movCell(rouCostTotal('rouAccDepClosing'))}</td></tr>
          <tr><td><strong>Closing ROU net book value</strong></td><td class="num"><strong>${fmt(rouClose)}</strong></td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Lease liability movement (FY)</h3>
        <table><tbody>
          <tr><td>Opening liability</td><td class="num">${fmt(liaOpen)}</td></tr>
          <tr><td>New leases & interest accretion</td><td class="num">${fmt(liaAdd)}</td></tr>
          <tr><td>Lease payments</td><td class="num">${movCell(liaPay)}</td></tr>
          <tr><td><strong>Closing lease liability</strong></td><td class="num"><strong>${fmt(liaClose)}</strong></td></tr>
        </tbody></table>
      </div>
    </div>`;
}
function rouCostTotal(field) { return leases.reduce((s, l) => s + num(l[field]), 0); }

/* =============================================================
   ASSET FORM (modal)
   ============================================================= */
function blankAsset() {
  return {
    id: uid(), tag: '', description: '', category: '', location: '', department: '', custodian: '',
    wipCategory: '', inServiceDate: '',
    supplier: '', invoice: '', acquisitionDate: toISO(new Date()),
    purchaseCost: '', installationCost: '', otherCost: '',
    acctMethod: 'straight-line', usefulLife: 5, residualValue: '', acctRate: '',
    openingDate: '', openingCost: '', openingAccDep: '', acctDepAdjustment: '', acctDepAdjDate: '',
    taxCostOverride: '', taxMethod: 'diminishing-value', taxLife: '', taxRate: 30, taxInitialAllowance: '',
    disposed: false, disposalDate: '', disposalProceeds: '', notes: '',
  };
}

function openAsset(id) {
  const a = id ? assets.find(x => x.id === id) : blankAsset();
  if (!a) return;
  editingId = id || null;
  const g = f => a[f] != null ? a[f] : '';
  $('#modal-title').textContent = id ? 'Edit Asset' : 'Add Asset';
  $('#asset-form').innerHTML = `
    <div class="form-grid">
      <div class="form-section-title">Asset master</div>
      <div class="field"><label>Asset tag / ID</label><input id="f-tag" value="${esc(g('tag'))}" placeholder="e.g. IT-0001"></div>
      <div class="field"><label>Category</label><input id="f-category" list="cat-list" value="${esc(g('category'))}" placeholder="e.g. IT Equipment"></div>
      <div class="field full"><label>Description</label><input id="f-description" value="${esc(g('description'))}" placeholder="e.g. Dell Latitude laptop"></div>
      <div class="field"><label>Location</label><input id="f-location" value="${esc(g('location'))}"></div>
      <div class="field"><label>Department</label><input id="f-department" value="${esc(g('department'))}"></div>
      <div class="field"><label>Custodian</label><input id="f-custodian" value="${esc(g('custodian'))}"></div>
      <div class="field"><label>Acquisition date</label><input id="f-acquisitionDate" type="date" value="${esc(g('acquisitionDate'))}"></div>

      <div class="form-section-title">Acquisition &amp; cost</div>
      <div class="field"><label>Supplier</label><input id="f-supplier" value="${esc(g('supplier'))}"></div>
      <div class="field"><label>Invoice ref</label><input id="f-invoice" value="${esc(g('invoice'))}"></div>
      <div class="field"><label>Purchase cost</label><input id="f-purchaseCost" type="number" step="0.01" value="${esc(g('purchaseCost'))}"></div>
      <div class="field"><label>Installation / freight</label><input id="f-installationCost" type="number" step="0.01" value="${esc(g('installationCost'))}"></div>
      <div class="field"><label>Other capitalised cost</label><input id="f-otherCost" type="number" step="0.01" value="${esc(g('otherCost'))}"></div>
      <div class="field"><label>Total capitalised</label><input id="f-totalCost" disabled value="${fmt(acctCost(a))}"></div>

      <div class="form-section-title">Work in progress / commissioning</div>
      <div class="field"><label>WIP holding category <span class="hint-text">(while under construction)</span></label><input id="f-wipCategory" list="cat-list" value="${esc(g('wipCategory'))}" placeholder="e.g. 150120-Asset WIP"></div>
      <div class="field"><label>Placed-in-service date <span class="hint-text">(depreciation starts; blank = at acquisition)</span></label><input id="f-inServiceDate" type="date" value="${esc(g('inServiceDate'))}"></div>
      <div class="field full"><p class="hint-text" style="margin:0">The category above is the asset's <strong>operating</strong> category. If a WIP holding category and an in-service date are set, the asset is carried at cost with no depreciation under the holding category until that date, then transfers to its operating category and begins depreciating — so prior financial years stay unchanged.</p></div>

      <div class="form-section-title">Accounting depreciation</div>
      <div class="field"><label>Method</label>
        <select id="f-acctMethod">
          <option value="straight-line" ${a.acctMethod === 'straight-line' ? 'selected' : ''}>Straight-line</option>
          <option value="reducing-balance" ${a.acctMethod === 'reducing-balance' ? 'selected' : ''}>Reducing balance</option>
        </select></div>
      <div class="field"><label>Useful life (years)</label><input id="f-usefulLife" type="number" step="0.5" value="${esc(g('usefulLife'))}"></div>
      <div class="field"><label>Residual value</label><input id="f-residualValue" type="number" step="0.01" value="${esc(g('residualValue'))}"></div>
      <div class="field"><label>Reducing-balance rate %</label><input id="f-acctRate" type="number" step="0.01" value="${esc(g('acctRate'))}" placeholder="used if reducing balance"></div>

      <div class="form-section-title">Opening balance (brought forward)</div>
      <div class="field"><label>Opening date <span class="hint-text">(b/f as at; blank = full history)</span></label><input id="f-openingDate" type="date" value="${esc(g('openingDate'))}"></div>
      <div class="field"><label>Opening cost (gross)</label><input id="f-openingCost" type="number" step="0.01" value="${esc(g('openingCost'))}"></div>
      <div class="field"><label>Opening accumulated depreciation</label><input id="f-openingAccDep" type="number" step="0.01" value="${esc(g('openingAccDep'))}"></div>
      <div class="field full"><p class="hint-text" style="margin:0">Set an opening date to bring the asset forward at its net book value (opening cost − opening accumulated depreciation) as at that date, depreciating only from then over the remaining useful life above. Use to tie a register to an opening trial balance without re-deriving the full history.</p></div>
      <div class="field"><label>Depreciation adjustment <span class="hint-text">(one-off FX / catch-up / impairment)</span></label><input id="f-acctDepAdjustment" type="number" step="0.01" value="${esc(g('acctDepAdjustment'))}"></div>
      <div class="field"><label>Adjustment date <span class="hint-text">(FY the adjustment applies to)</span></label><input id="f-acctDepAdjDate" type="date" value="${esc(g('acctDepAdjDate'))}"></div>
      <div class="field full"><p class="hint-text" style="margin:0">A one-off amount added to the reporting-year depreciation charge, independent of cost — for reconciling lines such as an FX revaluation of foreign-currency assets, a catch-up, or an impairment.</p></div>

      <div class="form-section-title">Tax depreciation / capital allowances</div>
      <div class="field"><label>Tax cost base <span class="hint-text">(blank = accounting cost)</span></label><input id="f-taxCostOverride" type="number" step="0.01" value="${esc(g('taxCostOverride'))}"></div>
      <div class="field"><label>Method</label>
        <select id="f-taxMethod">
          <option value="diminishing-value" ${a.taxMethod === 'diminishing-value' ? 'selected' : ''}>Diminishing value</option>
          <option value="prime-cost" ${a.taxMethod === 'prime-cost' ? 'selected' : ''}>Prime cost</option>
        </select></div>
      <div class="field"><label>Tax rate %</label><input id="f-taxRate" type="number" step="0.01" value="${esc(g('taxRate'))}" placeholder="e.g. 30"></div>
      <div class="field"><label>Prime-cost life (years) <span class="hint-text">(if no rate)</span></label><input id="f-taxLife" type="number" step="0.5" value="${esc(g('taxLife'))}"></div>
      <div class="field"><label>Initial allowance %</label><input id="f-taxInitialAllowance" type="number" step="0.01" value="${esc(g('taxInitialAllowance'))}" placeholder="optional first-year %"></div>

      <div class="form-section-title">Disposal</div>
      <div class="field"><label><input type="checkbox" id="f-disposed" ${a.disposed ? 'checked' : ''}> Asset disposed</label></div>
      <div class="field"><label>Disposal date</label><input id="f-disposalDate" type="date" value="${esc(g('disposalDate'))}"></div>
      <div class="field"><label>Disposal proceeds</label><input id="f-disposalProceeds" type="number" step="0.01" value="${esc(g('disposalProceeds'))}"></div>
      <div class="field full"><label>Notes</label><textarea id="f-notes" rows="2">${esc(g('notes'))}</textarea></div>
    </div>
    <datalist id="cat-list">${categories().map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  `;
  // live total update
  ['f-purchaseCost', 'f-installationCost', 'f-otherCost'].forEach(id => {
    $('#' + id).addEventListener('input', () => {
      const t = num($('#f-purchaseCost').value) + num($('#f-installationCost').value) + num($('#f-otherCost').value);
      $('#f-totalCost').value = fmt(t);
    });
  });
  $('#modal').classList.add('open');
}

function closeModal() { $('#modal').classList.remove('open'); editingId = null; }

function saveAsset() {
  if (settings.locked) { toast('Year is locked — unlock to edit.'); return; }
  const val = id => { const el = $('#' + id); return el ? el.value : ''; };
  const rec = {
    id: editingId || uid(),
    tag: val('f-tag').trim(),
    category: val('f-category').trim(),
    description: val('f-description').trim(),
    location: val('f-location').trim(),
    department: val('f-department').trim(),
    custodian: val('f-custodian').trim(),
    wipCategory: val('f-wipCategory').trim(),
    inServiceDate: val('f-inServiceDate'),
    acquisitionDate: val('f-acquisitionDate'),
    supplier: val('f-supplier').trim(),
    invoice: val('f-invoice').trim(),
    purchaseCost: val('f-purchaseCost'),
    installationCost: val('f-installationCost'),
    otherCost: val('f-otherCost'),
    acctMethod: val('f-acctMethod'),
    usefulLife: val('f-usefulLife'),
    residualValue: val('f-residualValue'),
    acctRate: val('f-acctRate'),
    openingDate: val('f-openingDate'),
    openingCost: val('f-openingCost'),
    openingAccDep: val('f-openingAccDep'),
    acctDepAdjustment: val('f-acctDepAdjustment'),
    acctDepAdjDate: val('f-acctDepAdjDate'),
    taxCostOverride: val('f-taxCostOverride'),
    taxMethod: val('f-taxMethod'),
    taxRate: val('f-taxRate'),
    taxLife: val('f-taxLife'),
    taxInitialAllowance: val('f-taxInitialAllowance'),
    disposed: $('#f-disposed').checked,
    disposalDate: val('f-disposalDate'),
    disposalProceeds: val('f-disposalProceeds'),
    notes: val('f-notes').trim(),
  };
  if (!rec.tag && !rec.description) { toast('Enter at least a tag or description.'); return; }
  if (!rec.acquisitionDate) { toast('Acquisition date is required.'); return; }
  if (rec.disposed && !rec.disposalDate) { toast('Enter a disposal date or untick “disposed”.'); return; }

  if (editingId) {
    const i = assets.findIndex(a => a.id === editingId);
    assets[i] = rec;
  } else {
    assets.push(rec);
  }
  saveAssets();
  closeModal();
  renderAll();
  toast('Asset saved.');
}

function deleteAsset(id) {
  if (settings.locked) { toast('Year is locked — unlock to delete.'); return; }
  const a = assets.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`Delete asset “${a.tag || a.description || id}”? This cannot be undone.`)) return;
  assets = assets.filter(x => x.id !== id);
  saveAssets();
  renderAll();
  toast('Asset deleted.');
}

/* =============================================================
   DATA: import / export / sample / settings
   ============================================================= */
function exportJSON() {
  download('fixed-asset-register.json', JSON.stringify({ settings, assets }, null, 2), 'application/json');
}

function exportCSV(kind) {
  let headers, rows;
  if (kind === 'assets') {
    headers = ['Tag', 'Description', 'Category', 'WIP Category', 'In-Service Date', 'Location', 'Department', 'Custodian', 'Acquisition Date',
      'Supplier', 'Invoice', 'Purchase Cost', 'Installation', 'Other', 'Total Cost',
      'Acct Method', 'Useful Life', 'Residual', 'Acct Rate %',
      'Tax Cost', 'Tax Method', 'Tax Rate %', 'Tax Life', 'Initial Allowance %',
      'Disposed', 'Disposal Date', 'Proceeds', 'Accum Dep', 'NBV', 'Tax WDV'];
    rows = assets.map(a => {
      const acct = positionAt(a, 'acct'), tax = positionAt(a, 'tax');
      return [a.tag, a.description, a.category, a.wipCategory || '', a.inServiceDate || '', a.location, a.department, a.custodian, a.acquisitionDate,
        a.supplier, a.invoice, num(a.purchaseCost), num(a.installationCost), num(a.otherCost), acctCost(a),
        a.acctMethod, a.usefulLife, num(a.residualValue), num(a.acctRate),
        taxCost(a), a.taxMethod, num(a.taxRate), a.taxLife, num(a.taxInitialAllowance),
        a.disposed ? 'Yes' : 'No', a.disposalDate, num(a.disposalProceeds),
        acct.accumulated.toFixed(2), acct.nbv.toFixed(2), tax.nbv.toFixed(2)];
    });
  } else if (kind === 'acct') {
    headers = ['Tag', 'Description', 'Method', 'Opening NBV', 'Additions', 'Depreciation', 'Disposals', 'Closing NBV', 'Accum Dep'];
    rows = activeAssets().map(a => {
      const p = positionAt(a, 'acct');
      const addition = sameFYAcquisition(a) ? acctCost(a) : 0;
      return [a.tag, a.description, a.acctMethod, (p.openingThisFY - addition).toFixed(2), addition.toFixed(2),
        p.chargeThisFY.toFixed(2), p.disposalRemoval.toFixed(2), (p.disposedInView ? 0 : p.nbv).toFixed(2), p.accumulated.toFixed(2)];
    });
  } else {
    headers = ['Tag', 'Description', 'Method', 'Tax Cost', 'Opening TWDV', 'Additions', 'Tax Depreciation', 'Disposals', 'Closing TWDV'];
    rows = activeAssets().map(a => {
      const p = positionAt(a, 'tax');
      const addition = sameFYAcquisition(a) ? taxCost(a) : 0;
      return [a.tag, a.description, a.taxMethod, taxCost(a), (p.openingThisFY - addition).toFixed(2), addition.toFixed(2),
        p.chargeThisFY.toFixed(2), p.disposalRemoval.toFixed(2), (p.disposedInView ? 0 : p.nbv).toFixed(2)];
    });
  }
  const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  download(`far-${kind}-${toISO(reportingDate())}.csv`, csv, 'text/csv');
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importJSON(file) {
  if (settings.locked) { toast('Year is locked — unlock to import.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)) { assets = data; }
      else {
        if (Array.isArray(data.assets)) assets = data.assets;
        if (data.settings) { settings = Object.assign({}, defaultSettings, data.settings); saveSettings(); }
      }
      // ensure ids
      assets.forEach(a => { if (!a.id) a.id = uid(); });
      saveAssets();
      applySettingsToUI();
      renderAll();
      toast('Data imported.');
    } catch (e) { toast('Import failed: ' + e.message); }
  };
  reader.readAsText(file);
}

function loadSample() {
  if (settings.locked) { toast('Year is locked — unlock first.'); return; }
  if (assets.length && !confirm('Replace current data with the sample register?')) return;
  assets = sampleData();
  saveAssets();
  renderAll();
  activateTab('assets');
  toast('Sample register loaded.');
}

function clearAll() {
  if (settings.locked) { toast('Year is locked — unlock first.'); return; }
  if (!confirm('Delete ALL assets? This cannot be undone.')) return;
  assets = [];
  saveAssets();
  renderAll();
  toast('All assets cleared.');
}

// Copy a bundled dataset into the active working copy and stamp its version.
function applyBundledDataset(data) {
  data = data || window.AUS155;
  if (!data || !Array.isArray(data.assets)) return false;
  assets = JSON.parse(JSON.stringify(data.assets));
  settings = Object.assign({}, defaultSettings, data.settings || {});
  leases = Array.isArray(data.leases) ? JSON.parse(JSON.stringify(data.leases)) : [];
  saveAssets();
  saveSettings();
  saveLeases();
  if (data.version) localStorage.setItem(DATA_VERSION_KEY, data.version);
  localStorage.setItem(ACTIVE_ENTITY_KEY, entityCodeOf(data));
  return true;
}

/* ---------- Multi-entity registers ----------
   The active working copy (STORE_KEY/SETTINGS_KEY/LEASES_KEY) is one entity's
   register. Every entity worked on is archived under ENTITIES_KEY, keyed by a
   short code taken from the dataset version (e.g. "AUS155-2026-…" → AUS155), so
   the header dropdown can switch between them. The active entity is snapshotted
   into the archive only when leaving it. */
function bundledDatasets() { return [window.AUS155, window.AUS501].filter(d => d && Array.isArray(d.assets)); }
function entityCodeOf(dataOrVer) {
  const v = typeof dataOrVer === 'string' ? dataOrVer : (dataOrVer && dataOrVer.version) || '';
  return v.split('-')[0] || '';
}
function bundledFor(code) { return bundledDatasets().find(d => entityCodeOf(d) === code); }
function activeEntityCode() {
  return localStorage.getItem(ACTIVE_ENTITY_KEY) || entityCodeOf(localStorage.getItem(DATA_VERSION_KEY) || '') || 'AUS155';
}
function loadEntityStore() { try { return JSON.parse(localStorage.getItem(ENTITIES_KEY)) || {}; } catch (e) { return {}; } }
function saveEntityStore(s) { localStorage.setItem(ENTITIES_KEY, JSON.stringify(s)); }
function snapshotActiveEntity() {
  const s = loadEntityStore();
  s[activeEntityCode()] = {
    version: localStorage.getItem(DATA_VERSION_KEY) || '',
    settings: JSON.parse(JSON.stringify(settings)),
    assets: JSON.parse(JSON.stringify(assets)),
    leases: JSON.parse(JSON.stringify(leases)),
  };
  saveEntityStore(s);
}
function availableEntities() {
  const set = new Set(Object.keys(loadEntityStore()));
  bundledDatasets().forEach(d => set.add(entityCodeOf(d)));
  set.add(activeEntityCode());
  return [...set].filter(Boolean).sort();
}
function switchEntity(code) {
  if (!code || code === activeEntityCode()) return;
  snapshotActiveEntity();
  const store = loadEntityStore();
  const bundled = bundledFor(code);
  // Prefer a newer bundled dataset over a stale archived working copy.
  if (bundled && (!store[code] || (bundled.version && bundled.version !== store[code].version))) {
    applyBundledDataset(bundled);
  } else if (store[code]) {
    const e = store[code];
    assets = JSON.parse(JSON.stringify(e.assets || []));
    settings = Object.assign({}, defaultSettings, e.settings || {});
    leases = JSON.parse(JSON.stringify(e.leases || []));
    if (e.version) localStorage.setItem(DATA_VERSION_KEY, e.version); else localStorage.removeItem(DATA_VERSION_KEY);
    saveAssets(); saveSettings(); saveLeases();
    localStorage.setItem(ACTIVE_ENTITY_KEY, code);
  } else if (bundledFor(code)) {
    applyBundledDataset(bundledFor(code));
  } else { toast('No register stored for ' + code); return; }
  applySettingsToUI(); renderAll(); activateTab('dashboard');
  toast('Switched to ' + code);
}
function renderEntitySelector() {
  const sel = document.getElementById('entity-select'); if (!sel) return;
  const cur = activeEntityCode();
  sel.innerHTML = availableEntities().map(c => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');
}

function loadAUS155() {
  if (settings.locked) { toast('Year is locked — unlock first.'); return; }
  const data = window.AUS155;
  if (!data || !Array.isArray(data.assets)) { toast('AUS155 dataset not found.'); return; }
  if (assets.length && !confirm('Load the Axi AUS155 (Singapore) register into the AUS155 entity?')) return;
  snapshotActiveEntity();
  applyBundledDataset(data);
  applySettingsToUI();
  renderAll();
  activateTab('acct');
  toast('AUS155 register loaded (' + assets.length + ' assets).');
}

function loadAUS501() {
  if (settings.locked) { toast('Year is locked — unlock first.'); return; }
  const data = window.AUS501;
  if (!data || !Array.isArray(data.assets)) { toast('AUS501 dataset not found.'); return; }
  if (assets.length && !confirm('Load the CB Financial Services (UK) AUS501 register into the AUS501 entity?')) return;
  snapshotActiveEntity();
  applyBundledDataset(data);
  applySettingsToUI();
  renderAll();
  activateTab('acct');
  toast('AUS501 (UK) register loaded (' + assets.length + ' assets).');
}

function sampleData() {
  return [
    { id: uid(), tag: 'IT-0001', category: 'IT Equipment', description: 'Dell Latitude laptop fleet (x10)', location: 'Sydney HQ', department: 'Technology', custodian: 'IT Asset Team', supplier: 'Dell', invoice: 'INV-88421', acquisitionDate: '2023-08-15', purchaseCost: '24000', installationCost: '600', otherCost: '', acctMethod: 'straight-line', usefulLife: 3, residualValue: '0', acctRate: '', taxCostOverride: '', taxMethod: 'diminishing-value', taxRate: 40, taxLife: '', taxInitialAllowance: '', disposed: false, disposalDate: '', disposalProceeds: '', notes: '' },
    { id: uid(), tag: 'FF-0007', category: 'Furniture & Fittings', description: 'Open-plan office fit-out', location: 'Sydney HQ', department: 'Facilities', custodian: 'Office Manager', supplier: 'Schiavello', invoice: 'INV-10233', acquisitionDate: '2022-02-01', purchaseCost: '85000', installationCost: '9000', otherCost: '2500', acctMethod: 'straight-line', usefulLife: 10, residualValue: '5000', acctRate: '', taxCostOverride: '', taxMethod: 'prime-cost', taxRate: 10, taxLife: '', taxInitialAllowance: '', disposed: false, disposalDate: '', disposalProceeds: '', notes: '' },
    { id: uid(), tag: 'MV-0002', category: 'Motor Vehicles', description: 'Toyota HiLux utility', location: 'Melbourne', department: 'Operations', custodian: 'Fleet Manager', supplier: 'Toyota', invoice: 'INV-55110', acquisitionDate: '2021-07-10', purchaseCost: '48000', installationCost: '', otherCost: '1200', acctMethod: 'reducing-balance', usefulLife: 8, residualValue: '8000', acctRate: 25, taxCostOverride: '', taxMethod: 'diminishing-value', taxRate: 25, taxLife: '', taxInitialAllowance: '', disposed: false, disposalDate: '', disposalProceeds: '', notes: '' },
    { id: uid(), tag: 'PL-0015', category: 'Plant & Machinery', description: 'CNC milling machine', location: 'Brisbane Plant', department: 'Manufacturing', custodian: 'Plant Supervisor', supplier: 'Haas', invoice: 'INV-77300', acquisitionDate: '2020-11-20', purchaseCost: '160000', installationCost: '14000', otherCost: '', acctMethod: 'straight-line', usefulLife: 12, residualValue: '10000', acctRate: '', taxCostOverride: '', taxMethod: 'diminishing-value', taxRate: 20, taxLife: '', taxInitialAllowance: '', disposed: false, disposalDate: '', disposalProceeds: '', notes: '' },
    { id: uid(), tag: 'IT-0003', category: 'IT Equipment', description: 'Server rack (decommissioned)', location: 'Data Centre', department: 'Technology', custodian: 'Infrastructure', supplier: 'HPE', invoice: 'INV-40021', acquisitionDate: '2019-05-05', purchaseCost: '52000', installationCost: '3000', otherCost: '', acctMethod: 'straight-line', usefulLife: 5, residualValue: '0', acctRate: '', taxCostOverride: '', taxMethod: 'diminishing-value', taxRate: 40, taxLife: '', taxInitialAllowance: '', disposed: true, disposalDate: '2024-09-30', disposalProceeds: '4000', notes: 'Sold to recycler.' },
  ];
}

/* ----- Settings ----- */
function applySettingsToUI() {
  $('#company-name').textContent = settings.companyName;
  $('#header-fy').textContent = 'FY end ' + settings.fyEndDay + '/' + settings.fyEndMonth +
    ' · reporting ' + toISO(reportingDate());
  renderEntitySelector();
  $('#s-companyName').value = settings.companyName;
  $('#s-currency').value = settings.currency;
  $('#s-fyEndMonth').value = settings.fyEndMonth;
  $('#s-fyEndDay').value = settings.fyEndDay;
  $('#s-reportingDate').value = settings.reportingDate || toISO(new Date());
  if ($('#s-dtRate')) $('#s-dtRate').value = settings.dtRate;

  // Lock (finalised) state — per entity/year.
  document.body.classList.toggle('locked', !!settings.locked);
  const lb = $('#btn-lock');
  if (lb) { lb.textContent = settings.locked ? 'Unlock year' : 'Lock year'; lb.classList.toggle('danger', !settings.locked); lb.classList.toggle('primary', !!settings.locked); }
  const banner = $('#lock-banner');
  if (banner) banner.innerHTML = settings.locked
    ? `<div class="banner warn" style="margin:0 0 16px">🔒 <strong>${esc(activeEntityCode())} — year to ${esc(toISO(reportingDate()))} is locked</strong> (finalised). Editing, imports and settings changes are blocked. Unlock in Data &amp; Settings.</div>`
    : '';
}

function saveSettingsFromUI() {
  if (settings.locked) { toast('Year is locked — unlock to change settings.'); return; }
  settings.companyName = $('#s-companyName').value.trim() || 'Company';
  settings.currency = $('#s-currency').value || '$';
  settings.fyEndMonth = parseInt($('#s-fyEndMonth').value, 10) || 6;
  settings.fyEndDay = parseInt($('#s-fyEndDay').value, 10) || 30;
  settings.reportingDate = $('#s-reportingDate').value || null;
  if ($('#s-dtRate')) settings.dtRate = num($('#s-dtRate').value);
  saveSettings();
  applySettingsToUI();
  renderAll();
  toast('Settings saved.');
}

/* =============================================================
   NAV + wiring
   ============================================================= */
function activateTab(tab) {
  activeTab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
  renderAll();
}

function renderAll() {
  applySettingsHeader();
  if (activeTab === 'dashboard') renderDashboard();
  else if (activeTab === 'assets') renderAssets();
  else if (activeTab === 'acct') renderAcctRegister();
  else if (activeTab === 'tax') renderTaxRegister();
  else if (activeTab === 'leases') renderLeases();
  else if (activeTab === 'disposals') renderDisposals();
}
function applySettingsHeader() {
  $('#company-name').textContent = settings.companyName;
  $('#header-fy').textContent = 'FY end ' + settings.fyEndDay + '/' + settings.fyEndMonth +
    ' · reporting ' + toISO(reportingDate());
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function wire() {
  $$('.tab').forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
  $('#btn-add').addEventListener('click', () => openAsset(null));
  $('#btn-add-2').addEventListener('click', () => openAsset(null));
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-save').addEventListener('click', saveAsset);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  $('#search').addEventListener('input', e => { filterState.q = e.target.value; renderAssets(); });
  $('#filter-status').addEventListener('change', e => { filterState.status = e.target.value; renderAssets(); });
  $('#assets-expand').addEventListener('click', toggleAllAssetsCats);
  $('#assets-wrap').addEventListener('click', e => {
    const row = e.target.closest('tr.cat-row');
    if (row && row.dataset.key) toggleAssetsCat(row.dataset.key);
  });

  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-assets').addEventListener('click', () => exportCSV('assets'));
  $('#exp-acct').addEventListener('click', () => exportCSV('acct'));
  $('#exp-tax').addEventListener('click', () => exportCSV('tax'));

  // Register FY switchers, expand/collapse, and collapsible category rows
  $('#acct-fy-select').addEventListener('change', e => onFYChange(e.target.value));
  $('#tax-fy-select').addEventListener('change', e => onFYChange(e.target.value));
  $('#acct-expand').addEventListener('click', () => toggleAllCats('acct'));
  $('#tax-expand').addEventListener('click', () => toggleAllCats('tax'));
  ['acct-showall', 'tax-showall', 'assets-showall'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('change', e => setShowAll(e.target.checked));
  });
  ['acct', 'tax'].forEach(kind => {
    $('#' + kind + '-wrap').addEventListener('click', e => {
      const row = e.target.closest('tr.cat-row');
      if (row && row.dataset.key) toggleCat(row.dataset.key);
    });
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
  $('#btn-sample').addEventListener('click', loadSample);
  $('#btn-aus155').addEventListener('click', loadAUS155);
  const b501 = $('#btn-aus501'); if (b501) b501.addEventListener('click', loadAUS501);
  const esel = $('#entity-select'); if (esel) esel.addEventListener('change', e => switchEntity(e.target.value));
  $('#btn-clear').addEventListener('click', clearAll);
  $('#btn-save-settings').addEventListener('click', saveSettingsFromUI);
  const lk = $('#btn-lock'); if (lk) lk.addEventListener('click', () => {
    settings.locked = !settings.locked;
    saveSettings(); snapshotActiveEntity(); applySettingsToUI(); renderAll();
    toast(settings.locked ? 'Year locked (finalised)' : 'Year unlocked');
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

document.addEventListener('DOMContentLoaded', () => {
  wire();
  // Auto-load the bundled dataset on first visit, and again automatically
  // whenever it has been updated to a newer version — so a refresh always
  // shows the latest published data without needing to click "Load".
  // Auto-apply the ACTIVE entity's bundled dataset (default AUS155) on first
  // visit or when a newer version is published — without clobbering whichever
  // entity is currently active.
  const data = bundledFor(activeEntityCode()) || window.AUS155;
  const bundledVer = data && data.version;
  const storedVer = localStorage.getItem(DATA_VERSION_KEY);
  // Don't auto-overwrite a locked (finalised) entity with a bundled update.
  if (!settings.locked && data && Array.isArray(data.assets) &&
      (!assets.length || (bundledVer && bundledVer !== storedVer))) {
    applyBundledDataset(data);
  }
  // Backfill leases from the bundled data if missing (e.g. added after the
  // assets were already stored).
  if (!leases.length && data && Array.isArray(data.leases)) {
    leases = JSON.parse(JSON.stringify(data.leases));
    saveLeases();
  }
  applySettingsToUI();
  activateTab('dashboard');
});

// expose handlers used inline
window.openAsset = openAsset;
window.deleteAsset = deleteAsset;
