// Data contract between the Python forecast pipeline (writes web/src/data/forecast.json)
// and the Next.js app. All money is EUR. Months are "YYYY-MM", dates "YYYY-MM-DD".

export type Band = { p10: number; p50: number; p90: number };

export type Driver = {
  feature: string;
  label: string;          // human readable, e.g. "Failed payment on current term"
  oddsRatio: number;      // >1 raises the modelled outcome odds (renewal / win), <1 lowers it
  direction: "risk" | "protective";
};

export interface ForecastData {
  meta: {
    asOf: string;          // snapshot date, "2026-09-30"
    generatedAt: string;   // ISO timestamp
    currency: "EUR";
    simulations: number;   // Monte Carlo runs
    horizonEnd: string;    // "2027-12"
  };

  kpis: {
    arr: number;                       // ARR at asOf
    arrYoY: number;                    // growth vs 12 months earlier, 0.61 = +61 %
    mrr: number;
    nrr12m: number;                    // net revenue retention, trailing 12 m (1.12 = 112 %)
    grr12m: number;                    // gross revenue retention, trailing 12 m
    activeCustomers: { selfServe: number; enterprise: number };
    revenueYtd: number;                // cash revenue Jan..asOf
    revenueYtdYoY: number;             // vs same period last year
    fy2026: Band & { plan: number; actualYtd: number };
    fy2027: Band;
    arrDec2026: Band;
    arrDec2027: Band;
    openPipeline: { count: number; amount: number; hubspotWeighted: number; modelExpected: number };
    cashNext90d: Band;
    overdueReceivables: number;
  };

  // Jan 2024 .. horizonEnd. Actual months have actual*; forecast months have bands.
  monthly: Array<{
    month: string;
    actualRevenue: number | null;
    revenue: Band | null;
    components: {                      // mean contribution to forecast revenue
      existingSelfServe: number;
      newSelfServe: number;
      existingEnterprise: number;
      pipelineEnterprise: number;      // open HubSpot deals
      futurePipeline: number;          // deals not created yet
    } | null;
    actualArr: number | null;
    arr: Band | null;
    actualArrBySegment: { selfServe: number; enterprise: number } | null;
  }>;

  // ARR walk from asOf to Dec 2027 (P50 / expected values).
  bridge: {
    period: string;                    // "Sep 2026 → Dec 2027"
    steps: Array<{ name: string; value: number; kind: "start" | "increase" | "decrease" | "end"; note: string }>;
  };

  // Historical MRR movements per month (Jan 2023 .. asOf).
  mrrMovements: Array<{ month: string; new: number; expansion: number; contraction: number; churn: number; reactivation: number }>;

  // Self-serve quarterly cohorts: share of starting MRR still active N quarters later (null = future).
  cohorts: Array<{ cohort: string; customers: number; startMrr: number; retention: Array<number | null> }>;

  renewalModel: {
    trainingRows: number;
    aucTest: number;
    testPeriod: string;                // e.g. "renewals Jan–Sep 2026 (out of time)"
    baseRate: number;                  // historical renewal rate
    drivers: Driver[];
    calibration: Array<{ bucket: string; predicted: number; actual: number; n: number }>;
    lift: { topDecileChurn: number; avgChurn: number };
  };

  // Upcoming renewals in the next 180 days, both segments.
  renewals: Array<{
    customerId: string;
    name: string;
    company: string | null;
    segment: "self_serve" | "enterprise";
    plan: string;                      // "12-month", "6-month", "Enterprise"
    seats: number;
    arr: number;
    renewalDate: string;
    pRenew: number;
    riskLevel: "high" | "medium" | "low";
    signals: string[];                 // e.g. ["Paid 31 days late", "Seat reduction at last renewal"]
    owner: string | null;
  }>;

  // Open HubSpot deals at asOf.
  deals: Array<{
    id: string;
    name: string;
    company: string;
    owner: string;
    stage: string;                     // label
    stageOrder: number;                // 0..4
    amount: number;
    currency: string;
    amountEur: number;
    createDate: string;
    closeDateRep: string;              // HubSpot closedate
    closeDateModel: string;            // P50 modelled close date
    hubspotProb: number;
    modelProb: number;
    forecastCategory: string;          // pipeline | best_case | commit
    leadSource: string;
    daysInStage: number;
    closeDatePushes: number;
    activity30d: number;
    lastActivity: string | null;
    flags: string[];                   // e.g. ["Close date pushed 3×", "No activity 21 days", "Paying self-serve account"]
    stripeLinked: boolean;
    selfServeSeats: number | null;
  }>;

  dealModel: {
    trainingSnapshots: number;
    deals: number;
    brierModel: number;
    brierHubspot: number;
    aucModel: number;
    stageCalibration: Array<{ stage: string; hubspotProb: number; empiricalProb: number; n: number }>;
    slipDaysMedian: number;            // median days won deals closed after the rep's close date
    drivers: Driver[];
  };

  cash: {
    weekly: Array<{
      weekStart: string;
      expected: Band;
      components: { openInvoices: number; renewals: number; newBusiness: number };
    }>;                                // next 13 weeks
    openInvoices: Array<{
      invoice: string;
      customer: string;
      segment: "self_serve" | "enterprise";
      amount: number;
      issued: string;
      due: string;
      daysOverdue: number;
      expectedPayDate: string;
      pPaid30d: number;
      payerProfile: string;            // "Pays on time" | "Typically 12 days late" | ...
    }>;
  };

  // Out-of-time backtests: forecast made at asOf with data up to then, vs what happened.
  backtest: Array<{
    asOf: string;
    horizonMonths: number;
    actual: number;                    // cash revenue over the horizon
    forecast: Band;
    naiveRunRate: number;              // last-3-month run rate extrapolated
    hubspotWeighted: number | null;    // enterprise new-logo revenue per HubSpot weighting (for reference)
    errorPct: number;                  // (p50 - actual) / actual
    naiveErrorPct: number;
    inBand: boolean;                   // actual within P10..P90
  }>;

  identity: {
    stripeCustomers: number;
    hubspotCompanies: number;
    matched: number;
    byMethod: Record<string, number>;  // domain | contact_email | fuzzy_name
    examples: Array<{ stripeName: string; hubspotName: string; method: "domain" | "contact_email" | "fuzzy_name"; confidence: number }>;
    selfServeAccountsInCrm: number;    // HubSpot companies that already pay via self-serve
  };

  // Linearised what-if levers for client-side sliders.
  scenarios: {
    base: { fy2027Revenue: number; arrDec2027: number };
    levers: Array<{
      id: string;                      // "selfServeChurn" | "winRate" | "pipelineCreation" | "newSelfServe" | "dealSize"
      label: string;
      unit: string;                    // "pp" | "%"
      min: number;
      max: number;
      step: number;
      default: number;                 // 0 = base case
      impact: { fy2027Revenue: number; arrDec2027: number };  // change per +1 unit
    }>;
  };
}
