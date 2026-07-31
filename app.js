/* =============================================================
   Fixed Asset Register — accounting & tax registers
   Pure client-side app. Data persists in localStorage.
   ============================================================= */

'use strict';

const STORE_KEY = 'far.assets.v1';
const SETTINGS_KEY = 'far.settings.v1';

/* ---------- Settings ---------- */
const defaultSettings = {
  companyName: 'Your Company Pty Ltd',
  currency: '$',
  fyEndMonth: 6,   // 1-12 ; Australian default 30 June
  fyEndDay: 30,
  reportingDate: null, // ISO yyyy-mm-dd ; null => today
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
function toISO(d) { return d ? d.toISOString().slice(0, 10) : ''; }
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
  const start = fyStartFor(fyEnd);
  return 'FY' + start.getFullYear() + '/' + String(fyEnd.getFullYear()).slice(-2);
}

/* Total capitalised accounting cost */
function acctCost(a) { return num(a.purchaseCost) + num(a.installationCost) + num(a.otherCost); }
/* Tax cost base (defaults to accounting cost when not overridden) */
function taxCost(a) { return a.taxCostOverride !== '' && a.taxCostOverride != null ? num(a.taxCostOverride) : acctCost(a); }

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

  const disposal = a.disposed ? parseDate(a.disposalDate) : null;
  const horizon = asOf || reportingDate();

  let method, base, residual, lifeYears, rate, initialAllow;
  if (kind === 'acct') {
    method = a.acctMethod || 'straight-line';
    base = acctCost(a);
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
    ? endOfLife(a, acq, 'straight-line', lifeYears)
    : (method === 'prime-cost' && lifeYears && !rate ? endOfLife(a, acq, 'prime-cost', lifeYears) : null);

  const rows = [];
  let opening = 0;
  let accumulated = 0;
  let fyEnd = fyEndFor(acq);
  let carry = base;               // current book/written-down value
  let firstFY = true;
  let guard = 0;

  const depreciable = Math.max(0, base - residual);

  while (guard++ < 200) {
    const fyStart = fyStartFor(fyEnd);

    // Service window inside this FY
    const winStart = acq > fyStart ? acq : fyStart;
    let winEnd = fyEnd;
    if (disposal && disposal < winEnd) winEnd = disposal;
    // Only accrue depreciation up to the reporting date (partial final year)
    if (horizon < winEnd) winEnd = horizon;
    if (winEnd < winStart) break;

    const daysInFY = daysBetween(fyStart, fyEnd) + 1;
    const daysInService = daysBetween(winStart, winEnd) + 1;
    const frac = Math.min(1, daysInService / daysInFY);

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
      // First-year additional tax initial allowance
      if (firstFY && initialAllow) charge += base * (initialAllow / 100);
      // Never depreciate below residual (nil for tax)
      charge = Math.min(charge, opening - residual);
      if (charge < 0) charge = 0;
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
    const c = a.category || 'Uncategorised';
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
      </tbody>
    </table>`;
}

/* ----- Assets list ----- */
function filteredAssets() {
  const q = filterState.q.toLowerCase();
  return assets.filter(a => {
    if (filterState.category && a.category !== filterState.category) return false;
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
  // filters
  const catSel = $('#filter-category');
  const cur = filterState.category;
  catSel.innerHTML = '<option value="">All categories</option>' +
    categories().map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');

  const list = filteredAssets();
  const rows = list.map(a => {
    const acct = positionAt(a, 'acct');
    const disp = isDisposed(a);
    return `<tr>
      <td><strong>${esc(a.tag || a.id)}</strong></td>
      <td>${esc(a.description || '')}<div class="hint-text">${esc(a.category || '')}</div></td>
      <td>${esc(a.location || '')}${a.department ? '<div class="hint-text">' + esc(a.department) + '</div>' : ''}</td>
      <td class="num">${esc(a.acquisitionDate || '')}</td>
      <td class="num">${fmt(acctCost(a))}</td>
      <td class="num">${fmt(acct.accumulated)}</td>
      <td class="num">${fmt(acct.nbv)}</td>
      <td>${disp ? '<span class="pill red">Disposed</span>' : '<span class="pill green">Active</span>'}</td>
      <td>
        <button class="sm" onclick="openAsset('${a.id}')">Edit</button>
        <button class="sm danger" onclick="deleteAsset('${a.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');

  $('#assets-body').innerHTML = list.length ? rows :
    '<tr class="empty-row"><td colspan="9">No assets match. Click “Add Asset” to create one, or load sample data from the Data tab.</td></tr>';
  $('#assets-count').textContent = `${list.length} of ${assets.length} assets`;
}

/* ----- Accounting register ----- */
function renderAcctRegister() {
  const list = activeAssets().slice().sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
  let tO = 0, tA = 0, tC = 0, tD = 0, tCl = 0, tAcc = 0;

  const rows = list.map(a => {
    const p = positionAt(a, 'acct');
    const opening = p.openingThisFY;
    const addition = sameFYAcquisition(a) ? acctCost(a) : 0;
    const charge = p.chargeThisFY;
    const disposal = p.disposalRemoval;
    const closing = p.disposedInView ? 0 : p.nbv;
    tO += opening - addition; tA += addition; tC += charge; tD += disposal; tCl += closing; tAcc += p.accumulated;
    const methodLabel = a.acctMethod === 'reducing-balance'
      ? `Reducing ${pct(a.acctRate)}` : `Straight-line ${num(a.usefulLife)}y`;
    return `<tr>
      <td><strong>${esc(a.tag || a.id)}</strong><div class="hint-text">${esc(a.description || '')}</div></td>
      <td>${methodLabel}</td>
      <td class="num">${fmt(opening - addition)}</td>
      <td class="num">${addition ? fmt(addition) : '–'}</td>
      <td class="num">${fmt(charge)}</td>
      <td class="num">${disposal ? '(' + fmt(disposal) + ')' : '–'}</td>
      <td class="num">${fmt(closing)}</td>
      <td class="num">${fmt(p.accumulated)}</td>
      <td><details class="sched"><summary>Schedule</summary>${scheduleTable(p.sched, 'acct')}</details></td>
    </tr>`;
  }).join('');

  $('#acct-body').innerHTML = list.length ? rows :
    '<tr class="empty-row"><td colspan="9">No assets to report.</td></tr>';
  $('#acct-foot').innerHTML = `<tr>
      <td colspan="2">Totals — ${fyLabel(fyEndFor(reportingDate()))}</td>
      <td class="num">${fmt(tO)}</td><td class="num">${fmt(tA)}</td>
      <td class="num">${fmt(tC)}</td><td class="num">${tD ? '(' + fmt(tD) + ')' : '–'}</td>
      <td class="num">${fmt(tCl)}</td><td class="num">${fmt(tAcc)}</td><td></td></tr>`;
  $('#acct-fy-label').textContent = fyLabel(fyEndFor(reportingDate())) + ' · as at ' + toISO(reportingDate());
}

/* ----- Tax register ----- */
function renderTaxRegister() {
  const list = activeAssets().slice().sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
  let tO = 0, tA = 0, tC = 0, tD = 0, tCl = 0;

  const rows = list.map(a => {
    const p = positionAt(a, 'tax');
    const addition = sameFYAcquisition(a) ? taxCost(a) : 0;
    const opening = p.openingThisFY - addition;
    const charge = p.chargeThisFY;
    const disposal = p.disposalRemoval;
    const closing = p.disposedInView ? 0 : p.nbv;
    tO += opening; tA += addition; tC += charge; tD += disposal; tCl += closing;
    const methodLabel = a.taxMethod === 'diminishing-value'
      ? `Diminishing ${pct(a.taxRate)}` : (a.taxRate ? `Prime cost ${pct(a.taxRate)}` : `Prime cost ${num(a.taxLife)}y`);
    return `<tr>
      <td><strong>${esc(a.tag || a.id)}</strong><div class="hint-text">${esc(a.description || '')}</div></td>
      <td>${methodLabel}${num(a.taxInitialAllowance) ? ' + IA ' + pct(a.taxInitialAllowance) : ''}</td>
      <td class="num">${fmt(taxCost(a))}</td>
      <td class="num">${fmt(opening)}</td>
      <td class="num">${addition ? fmt(addition) : '–'}</td>
      <td class="num">${fmt(charge)}</td>
      <td class="num">${disposal ? '(' + fmt(disposal) + ')' : '–'}</td>
      <td class="num">${fmt(closing)}</td>
      <td><details class="sched"><summary>Schedule</summary>${scheduleTable(p.sched, 'tax')}</details></td>
    </tr>`;
  }).join('');

  $('#tax-body').innerHTML = list.length ? rows :
    '<tr class="empty-row"><td colspan="9">No assets to report.</td></tr>';
  $('#tax-foot').innerHTML = `<tr>
      <td colspan="3">Totals — ${fyLabel(fyEndFor(reportingDate()))}</td>
      <td class="num">${fmt(tO)}</td><td class="num">${fmt(tA)}</td>
      <td class="num">${fmt(tC)}</td><td class="num">${tD ? '(' + fmt(tD) + ')' : '–'}</td>
      <td class="num">${fmt(tCl)}</td><td></td></tr>`;
  $('#tax-fy-label').textContent = fyLabel(fyEndFor(reportingDate())) + ' · as at ' + toISO(reportingDate());
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
   ASSET FORM (modal)
   ============================================================= */
function blankAsset() {
  return {
    id: uid(), tag: '', description: '', category: '', location: '', department: '', custodian: '',
    supplier: '', invoice: '', acquisitionDate: toISO(new Date()),
    purchaseCost: '', installationCost: '', otherCost: '',
    acctMethod: 'straight-line', usefulLife: 5, residualValue: '', acctRate: '',
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

      <div class="form-section-title">Accounting depreciation</div>
      <div class="field"><label>Method</label>
        <select id="f-acctMethod">
          <option value="straight-line" ${a.acctMethod === 'straight-line' ? 'selected' : ''}>Straight-line</option>
          <option value="reducing-balance" ${a.acctMethod === 'reducing-balance' ? 'selected' : ''}>Reducing balance</option>
        </select></div>
      <div class="field"><label>Useful life (years)</label><input id="f-usefulLife" type="number" step="0.5" value="${esc(g('usefulLife'))}"></div>
      <div class="field"><label>Residual value</label><input id="f-residualValue" type="number" step="0.01" value="${esc(g('residualValue'))}"></div>
      <div class="field"><label>Reducing-balance rate %</label><input id="f-acctRate" type="number" step="0.01" value="${esc(g('acctRate'))}" placeholder="used if reducing balance"></div>

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
  const val = id => { const el = $('#' + id); return el ? el.value : ''; };
  const rec = {
    id: editingId || uid(),
    tag: val('f-tag').trim(),
    category: val('f-category').trim(),
    description: val('f-description').trim(),
    location: val('f-location').trim(),
    department: val('f-department').trim(),
    custodian: val('f-custodian').trim(),
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
    headers = ['Tag', 'Description', 'Category', 'Location', 'Department', 'Custodian', 'Acquisition Date',
      'Supplier', 'Invoice', 'Purchase Cost', 'Installation', 'Other', 'Total Cost',
      'Acct Method', 'Useful Life', 'Residual', 'Acct Rate %',
      'Tax Cost', 'Tax Method', 'Tax Rate %', 'Tax Life', 'Initial Allowance %',
      'Disposed', 'Disposal Date', 'Proceeds', 'Accum Dep', 'NBV', 'Tax WDV'];
    rows = assets.map(a => {
      const acct = positionAt(a, 'acct'), tax = positionAt(a, 'tax');
      return [a.tag, a.description, a.category, a.location, a.department, a.custodian, a.acquisitionDate,
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
  if (assets.length && !confirm('Replace current data with the sample register?')) return;
  assets = sampleData();
  saveAssets();
  renderAll();
  activateTab('assets');
  toast('Sample register loaded.');
}

function clearAll() {
  if (!confirm('Delete ALL assets? This cannot be undone.')) return;
  assets = [];
  saveAssets();
  renderAll();
  toast('All assets cleared.');
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
  $('#s-companyName').value = settings.companyName;
  $('#s-currency').value = settings.currency;
  $('#s-fyEndMonth').value = settings.fyEndMonth;
  $('#s-fyEndDay').value = settings.fyEndDay;
  $('#s-reportingDate').value = settings.reportingDate || toISO(new Date());
}

function saveSettingsFromUI() {
  settings.companyName = $('#s-companyName').value.trim() || 'Company';
  settings.currency = $('#s-currency').value || '$';
  settings.fyEndMonth = parseInt($('#s-fyEndMonth').value, 10) || 6;
  settings.fyEndDay = parseInt($('#s-fyEndDay').value, 10) || 30;
  settings.reportingDate = $('#s-reportingDate').value || null;
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
  $('#filter-category').addEventListener('change', e => { filterState.category = e.target.value; renderAssets(); });
  $('#filter-status').addEventListener('change', e => { filterState.status = e.target.value; renderAssets(); });

  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-assets').addEventListener('click', () => exportCSV('assets'));
  $('#exp-acct').addEventListener('click', () => exportCSV('acct'));
  $('#exp-tax').addEventListener('click', () => exportCSV('tax'));
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
  $('#btn-sample').addEventListener('click', loadSample);
  $('#btn-clear').addEventListener('click', clearAll);
  $('#btn-save-settings').addEventListener('click', saveSettingsFromUI);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

document.addEventListener('DOMContentLoaded', () => {
  wire();
  applySettingsToUI();
  activateTab('dashboard');
});

// expose handlers used inline
window.openAsset = openAsset;
window.deleteAsset = deleteAsset;
