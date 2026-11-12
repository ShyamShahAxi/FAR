/* =============================================================
   AUS135 — AXI Services (Cyprus) Limited
   Fixed asset register, FY26 (1 Jul 2025 – 30 Jun 2026), with FY25 history.
   Functional currency USD. Incorporated 3 June 2024; first period ended
   30 June 2025.

   Sources
     FY25 — BDO "Computation of wear and tear allowances" (signed FS p.25) and
            audit adjustment AJE 9 (laptops/computer equipment capitalised:
            cost 83,780.07, depreciation 1,149.08). BDO's per-line costs are
            whole dollars; the 1.07 rounding to AJE 9 sits on the large
            Lenovo Thinkpad line.
     FY26 — "AXI SERVICES TB FY 26 FOR AUDIT 10112026.xlsx": 140100 additions
            114,700.01 (incl. assets transferred from Solaris EMEA with
            accumulated depreciation 28,141.99, post-TB journal 1) and FY26
            depreciation 40,528.10 (Sage 5,944.72 + journal 1 34,583.38).
            No per-asset FY26 listing was available, so the additions are
            carried as ONE aggregate line at their net consideration
            (114,700.01 − 28,141.99 = 86,558.02) — its NBV and FY26
            depreciation tie to the GL. Replace it with the Sage FY26 asset
            export when available.

   Accounting — straight-line over 3 years, pro-rated by days (in-service
   dates fitted to BDO's FY25 charges; a cents-level adjustment ties FY25 to
   AJE 9 exactly).

   Tax — regime 'cy': Cyprus wear-and-tear allowances on cost, a FULL annual
   allowance in each year the asset is in use (no time-apportionment).
     * FY25 is AS FILED: BDO claimed the book depreciation (1,148, i.e.
       1,149.08 unrounded) as wear and tear. settings.taxMirrorUntil =
       30 Jun 2025 makes every FY up to then claim the accounting charge, so
       FY25 tax WDV = NBV and no temporary difference arises (none was booked).
     * From FY26 the statutory rates apply on cost, capped at the remaining
       WDV: computer hardware 20%; CCTV and TV/AV equipment 10% (plant &
       equipment / furniture & fittings).
   Deferred tax at 15% — the Cyprus corporate rate enacted from tax year 2026.
   Confirm rates and the transferred-asset tax cost before filing.
   ============================================================= */
window.AUS135 = {
  "version": "AUS135-2026-06-30.1",
  "settings": {
    "companyName": "AXI Services (Cyprus) Limited - AUS135",
    "currency": "$",
    "fyEndMonth": 6,
    "fyEndDay": 30,
    "reportingDate": "2026-06-30",
    "dtRate": 15,
    "taxRegime": "cy",
    "taxMirrorUntil": "2025-06-30"
  },
  "assets": [
    {
      "id": "AUS135-FY25-01", "tag": "CY-0001", "category": "140100-Computer Equipment",
      "description": "CCTV", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2025-04-01",
      "supplier": "", "invoice": "", "purchaseCost": "2989", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "", "acctDepAdjDate": "",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 10, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 2,989, allowance 249 (book depreciation, as filed). Statutory 10% from FY26."
    },
    {
      "id": "AUS135-FY25-02", "tag": "CY-0002", "category": "140100-Computer Equipment",
      "description": "TV and accessories", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2025-05-07",
      "supplier": "", "invoice": "", "purchaseCost": "2969", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "", "acctDepAdjDate": "",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 10, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 2,969, allowance 148 (book depreciation, as filed). Statutory 10% from FY26."
    },
    {
      "id": "AUS135-FY25-03", "tag": "CY-0003", "category": "140100-Computer Equipment",
      "description": "Lenovo Thinkpad, Monitors etc", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2025-04-01",
      "supplier": "", "invoice": "", "purchaseCost": "6686", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "3.91", "acctDepAdjDate": "2025-06-30",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 20, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 6,686, allowance 557 (book depreciation, as filed). FY25 depreciation adjustment ties the register to AJE 9 (1,149.08). Statutory 20% from FY26."
    },
    {
      "id": "AUS135-FY25-04", "tag": "CY-0004", "category": "140100-Computer Equipment",
      "description": "Accessories", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2025-05-24",
      "supplier": "", "invoice": "", "purchaseCost": "174", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "", "acctDepAdjDate": "",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 20, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 174, allowance 6 (book depreciation, as filed). Statutory 20% from FY26."
    },
    {
      "id": "AUS135-FY25-05", "tag": "CY-0005", "category": "140100-Computer Equipment",
      "description": "Lenovo Monitors", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2025-06-13",
      "supplier": "", "invoice": "", "purchaseCost": "2366", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "", "acctDepAdjDate": "",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 20, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 2,366, allowance 39 (book depreciation, as filed). Statutory 20% from FY26."
    },
    {
      "id": "AUS135-FY25-06", "tag": "CY-0006", "category": "140100-Computer Equipment",
      "description": "MacBook", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2025-06-13",
      "supplier": "", "invoice": "", "purchaseCost": "8947", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "", "acctDepAdjDate": "",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 20, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 8,947, allowance 149 (book depreciation, as filed). Statutory 20% from FY26."
    },
    {
      "id": "AUS135-FY25-07", "tag": "CY-0007", "category": "140100-Computer Equipment",
      "description": "Lenovo Thinkpad", "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "2025-07-01", "acquisitionDate": "2025-06-30",
      "supplier": "", "invoice": "", "purchaseCost": "59649.07", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "", "acctDepAdjDate": "",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 20, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "BDO W&T FY25: cost 59,648, nil allowance (bought at year end, in use from FY26). Cost carries the 1.07 rounding to AJE 9 (83,780.07). Statutory 20% from FY26."
    },
    {
      "id": "AUS135-FY26-AGG", "tag": "CY-FY26", "category": "140100-Computer Equipment",
      "description": "FY26 additions per GL 140100 — aggregate, net of transferred accumulated depreciation (replace with Sage asset export)",
      "location": "Cyprus-AUS135", "department": "", "custodian": "",
      "wipCategory": "", "inServiceDate": "", "acquisitionDate": "2026-01-23",
      "supplier": "", "invoice": "", "purchaseCost": "86558.02", "installationCost": "", "otherCost": "",
      "acctMethod": "straight-line", "usefulLife": 3, "residualValue": "0", "acctRate": "",
      "openingDate": "", "openingCost": "", "openingAccDep": "", "acctDepAdjustment": "32.71", "acctDepAdjDate": "2026-06-30",
      "taxCostOverride": "", "taxMethod": "prime-cost", "taxRate": 20, "taxLife": "", "taxInitialAllowance": "",
      "taxOpeningDate": "", "taxOpeningCost": "", "taxOpeningAccDep": "",
      "disposed": false, "disposalDate": "", "disposalProceeds": "",
      "notes": "GL 140100 FY26 additions 114,700.01 less accumulated depreciation on assets transferred from Solaris EMEA 28,141.99 (post-TB journal 1) = 86,558.02 net consideration. Acquisition date fitted so FY26 depreciation ties to the GL (FY26 total 40,528.10 less 27,926.69 on the FY25 assets = 12,601.41). Tax: 20% computer hardware on the net consideration — confirm the tax cost of the transferred assets."
    }
  ],
  "leases": [
    {
      "id": "AUS135-L1", "name": "Office space — Limassol (48-month lease from 1 Jan 2025, EUR)",
      "rouCostOpening": 450832.93, "rouAccDepOpening": 59932.37, "rouAdditions": 0, "rouDepCharge": 126698.43,
      "rouCostClosing": 450832.93, "rouAccDepClosing": 186630.80,
      "liabOpening": 461527.13, "liabAdditions": 0, "liabPayments": 120125.44, "liabClosing": 341401.69,
      "notes": "FY26 per audit TB. Opening liability includes the 65,489 unrealised FX loss booked by BDO (AJE 12); no FX revaluation of the EUR liability was booked in FY26. Tax: ROU depreciation added back, lease payments deducted; FX on the liability is exempt (permanent)."
    }
  ]
};
