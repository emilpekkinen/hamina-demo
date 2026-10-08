import type { Metadata } from "next";
import { LagChart, SpendVsBookingsChart } from "@/components/charts/MarketingCharts";
import { CHANNEL_SERIES, LAG_SERIES as LAG_LEGEND } from "@/lib/marketingSeries";
import { Card, CardHeader, Empty, KpiCard, Legend, PageHeader, Pill, Stat, TableView, TableWrap, cx, td, tdNum, th } from "@/components/ui";
import { C } from "@/lib/chart";
import { data } from "@/lib/data";
import { dateLabel, eur, monthLabel, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Marketing · Hamina RevOps (demo)" };

// Public B2B SaaS benchmarks (design/marketing-research.md).
const BENCH = [
  { label: "Marketing spend, % of ARR", value: "8–15%", src: "SaaS Capital 2026, Benchmarkit 2025" },
  { label: "Paid media share of marketing budget", value: "≈31%", src: "Gartner CMO Spend Survey 2025" },
  { label: "LinkedIn share of B2B ad budgets", value: "≈39%", src: "Dreamdata 2025" },
  { label: "Average B2B buyer journey", value: "≈211 days", src: "Dreamdata 2025" },
];

export default function MarketingPage() {
  const m = data.marketing;
  if (!m) {
    return (
      <>
        <PageHeader eyebrow="Marketing" title="Paid marketing" />
        <Empty>No marketing data in this snapshot.</Empty>
      </>
    );
  }
  const latestFull = [...m.yearly].reverse().find((y) => !y.partialYear) ?? m.yearly[m.yearly.length - 1];
  const totalSpend = m.yearly.reduce((s, y) => s + y.spend, 0);
  const firstYear = m.yearly[0];
  const channels = [...m.channels].sort((a, b) => b.spend12m - a.spend12m);
  const spend12 = channels.reduce((s, c) => s + c.spend12m, 0) || 1;
  const e = m.enterprise;

  return (
    <>
      <PageHeader
        eyebrow="Marketing"
        title="What paid media"
        accent="actually returns"
        lead="Ad spend from Google, LinkedIn, Meta, YouTube, Capterra/G2 and Reddit, joined to Stripe bookings and HubSpot deals. Ads pay back with a delay: self-serve within weeks, enterprise only after the sales cycle, so every comparison is lagged."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Paid spend, last 12 months"
          value={eur(m.mmm.spend12m)}
          sub={`${pct(latestFull.pctOfRevenue, 1)} of ${latestFull.year} revenue · ${eur(totalSpend)} since ${firstYear.year}`}
        />
        <KpiCard
          label="Self-serve bookings from paid"
          highlight
          value={pct(m.mmm.paidShare12m)}
          sub={`${eur(m.mmm.paidBookings12m)} of first-invoice bookings · €${m.mmm.roas12m.toFixed(2)} per €1 before renewals`}
        />
        <KpiCard
          label="Enterprise deals per €10k"
          value={e.dealsPer10k.toFixed(1)}
          sub={`LinkedIn/search spend → deals ${e.lagMonths} months later · ≈${eur(e.expectedArrPer10k)} expected ARR`}
        />
        <KpiCard
          label="Ad → revenue lag"
          value={`0–1 / ~${e.revenueLagMonths} mo`}
          sub={`Self-serve / enterprise (deal created after ${e.lagMonths} mo + ${e.cycleDays}-day cycle)`}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Spend by channel vs self-serve new bookings"
          subtitle={`Bars: monthly paid spend (left axis). Line: new self-serve bookings from Stripe (right axis); dashed: marketing mix model fit (R² ${m.mmm.r2.toFixed(2)}).`}
        />
        <Legend
          className="mb-3"
          items={[
            ...CHANNEL_SERIES.map((c) => ({ label: c.label, color: c.color, kind: "rect" as const })),
            { label: "Self-serve new bookings", color: C.ink, kind: "line" as const },
            { label: "Model fit", color: C.axis, kind: "dash" as const },
          ]}
        />
        <SpendVsBookingsChart monthly={m.monthly} />
        <TableView
          columns={["Month", "Paid spend", "Self-serve bookings", "Deals created", "Enterprise ARR won"]}
          rows={m.monthly.map((r) => [monthLabel(r.month), eur(CHANNEL_SERIES.reduce((s, c) => s + r[c.key], 0)), eur(r.newSelfServe), r.dealsCreated, eur(r.newEnterpriseArr)])}
        />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="When does spend turn into revenue?"
            subtitle="Correlation between spend and each outcome N months later, after removing the shared growth trend. Taller bar = stronger link at that delay."
          />
          <Legend className="mb-3" items={LAG_LEGEND.map((s) => ({ label: m.lag.labels[s.key], color: s.color, kind: "rect" as const }))} />
          <LagChart lag={m.lag} />
          <p className="mt-3 text-[13px] leading-5 text-gray-500">
            Peaks: self-serve bookings at <b className="text-gray-900">+{m.lag.best.newSelfServe} mo</b>, enterprise deals created at{" "}
            <b className="text-gray-900">+{m.lag.best.dealsCreated} mo</b>, enterprise ARR at{" "}
            <b className="text-gray-900">+{m.lag.best.newEnterpriseArr} mo</b>. Only ~15 enterprise wins exist, so the last series is noisy;
            the deal model implies ~{e.revenueLagMonths} months from ad to signed contract.
          </p>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="How the effect is measured" />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Carry-over half-life" value={`${m.mmm.halfLifeMonths} mo`} sub="Adstock decay picked by time-series CV" />
            <Stat label="Model fit" value={`R² ${m.mmm.r2.toFixed(2)}`} sub={`CV error ${eur(m.mmm.cvMae)} / month`} />
            <Stat label="Expected ARR per €10k" value={eur(e.expectedArrPer10k)} sub={`Enterprise: deals × ${pct(e.winRate)} win rate × ${eur(e.avgDeal)}`} />
            <Stat label="First-invoice return" value={`€${m.mmm.roas12m.toFixed(2)}`} sub="Per €1 paid, self-serve, before renewals" />
          </div>
          <ul className="mt-5 space-y-2 text-[13px] leading-5 text-gray-600">
            <li>• Trend and seasonality are modelled first, so growth alone is not credited to ads.</li>
            <li>• Channel-level credit is <b className="text-gray-900">not</b> estimated: always-on search barely varies and LinkedIn bursts coincide with seasonal peaks. Next step: geo or holdout tests per channel.</li>
            <li>• Platform-reported conversions (below) are a different, usually inflated, measure.</li>
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" padded={false}>
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardHeader title="Channels" subtitle="Platform-reported delivery since launch; share uses the last 12 months." />
          </div>
          <TableWrap className="mx-5 mb-5 sm:mx-6 sm:mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Channel", "Since", "Spend 12m", "Share", "CPC", "CTR", "Cost / conv."].map((h, i) => (
                    <th key={h} className={cx(th, i > 1 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.platform} className="border-t border-gray-100">
                    <td className={td}>
                      <span className="flex items-center gap-2 font-medium text-gray-900">
                        <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: CHANNEL_SERIES.find((s) => s.key === c.platform)?.color }} />
                        {c.label}
                      </span>
                    </td>
                    <td className={td}>{monthLabel(c.firstSpend.slice(0, 7), true)}</td>
                    <td className={tdNum}>{eur(c.spend12m)}</td>
                    <td className={tdNum}>{pct(c.spend12m / spend12)}</td>
                    <td className={tdNum}>€{c.cpc.toFixed(2)}</td>
                    <td className={tdNum}>{pct(c.ctr, 2)}</td>
                    <td className={tdNum}>{eur(c.cpl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Hamina vs B2B SaaS benchmarks" subtitle="Paid media only; events and headcount excluded." />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Year</th>
                <th className={cx(th, "text-right")}>Paid spend</th>
                <th className={cx(th, "text-right")}>% revenue</th>
                <th className={cx(th, "text-right")}>Channels</th>
              </tr>
            </thead>
            <tbody>
              {m.yearly.map((y) => (
                <tr key={y.year} className="border-t border-gray-100">
                  <td className={td}>{y.year}{y.partialYear && <span className="text-gray-400"> YTD</span>}</td>
                  <td className={tdNum}>{eur(y.spend)}</td>
                  <td className={tdNum}>{pct(y.pctOfRevenue, 1)}</td>
                  <td className={tdNum}>{y.channels}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-2">
            {BENCH.map((b) => (
              <li key={b.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-gray-600">{b.label}<span className="block text-[11px] text-gray-400">{b.src}</span></span>
                <span className="tabular font-semibold text-gray-900">{b.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader title="Campaigns" subtitle={`${num(m.campaigns.length)} campaigns since ${firstYear.year}: always-on search and retargeting plus 4–8 week bursts around Cisco Live, WLPC and budget season.`} />
        </div>
        <TableWrap className="mx-5 mb-5 max-h-[420px] overflow-auto sm:mx-6 sm:mb-6">
          <table className="w-full border-collapse">
            <thead className="sticky top-0">
              <tr>
                {["Campaign", "Channel", "Type", "Target", "Flight", "Spend", "Clicks", "Conv.", "Cost / conv."].map((h, i) => (
                  <th key={h} className={cx(th, i > 4 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.campaigns.map((c, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className={cx(td, "font-medium text-gray-900")}>{c.name}</td>
                  <td className={td}>{c.platform}</td>
                  <td className={td}><Pill tone={c.kind === "burst" ? "violet" : "neutral"}>{c.kind === "burst" ? "Burst" : "Always-on"}</Pill></td>
                  <td className={td}><Pill tone={c.segment === "enterprise" ? "brand" : "neutral"}>{c.segment === "enterprise" ? "Enterprise" : "Self-serve"}</Pill></td>
                  <td className={cx(td, "whitespace-nowrap")}>{dateLabel(c.start, true)} – {dateLabel(c.end, true)}</td>
                  <td className={tdNum}>{eur(c.spend)}</td>
                  <td className={tdNum}>{num(c.clicks)}</td>
                  <td className={tdNum}>{num(c.conversions)}</td>
                  <td className={tdNum}>{eur(c.cpl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
