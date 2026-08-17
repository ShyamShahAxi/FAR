/* =============================================================
   AUS005 — AxiCorp Financial Services Pty Ltd (Australia), "AFSPL"
   Fixed asset register, FY25 (1 Jul 2024 – 30 Jun 2025).

   Scaffold: the entity, its settings and its tax treatment are wired
   up; the asset register itself is empty pending the source export.
   Populate `assets` from the AFSPL fixed-asset / GL export the same
   way AUS155 (Xero) and AUS501 (Sage GL) were built, or import a JSON
   backup from Data & Settings.

   Tax treatment: `taxRegime: 'mirror'` — the tax register follows the
   accounting register exactly (same cost base, method, life, residual
   and day-count proration). Tax WDV therefore equals accounting NBV,
   the temporary difference is nil and no deferred tax arises. Switch
   this to 'sg' (per-asset capital allowances) if AFSPL later needs a
   separate Div 40 basis.
   ============================================================= */
window.AUS005 = {
  version: 'AUS005-2025-06-30.1',
  settings: {
    companyName: 'AxiCorp Financial Services Pty Ltd (Australia) - AUS005',
    currency: '$',              // AUD
    fyEndMonth: 6,
    fyEndDay: 30,
    reportingDate: '2025-06-30', // FY25
    dtRate: 30,                  // Australian corporate tax rate
    taxRegime: 'mirror',         // tax depreciation = accounting depreciation
  },
  assets: [],
  leases: [],
};
