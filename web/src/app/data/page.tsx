import type { Metadata } from "next";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { Card, CardHeader, Empty, KpiCard, PageHeader, Pill, TableWrap, cx, td, tdNum, th } from "@/components/ui";
import { SERIES } from "@/lib/chart";
import { data } from "@/lib/data";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Data & architecture · Hamina RevOps (demo)" };

const METHOD_LABEL: Record<string, string> = {
  domain: "Email / website domain",
  contact_email: "Contact email",
  fuzzy_name: "Fuzzy company name",
};
const methodLabel = (m: string) => METHOD_LABEL[m] ?? m.replace(/_/g, " ");

export default function DataPage() {
  const { identity: id } = data;
  const methods = Object.entries(id.byMethod).sort((a, b) => b[1] - a[1]);
  const methodTotal = methods.reduce((s, [, n]) => s + n, 0) || 1;
  const matchRate = id.stripeCustomers ? id.matched / id.stripeCustomers : 0;
  const crmCoverage = id.hubspotCompanies ? id.matched / id.hubspotCompanies : 0;

  return (
    <>
      <PageHeader
        eyebrow="Data & architecture"
        title="One customer,"
        accent="one record"
        lead="Stripe knows who pays; HubSpot knows who is being sold to. Joining them is what makes the forecast possible: it avoids double-counting and surfaces enterprise deals at accounts that already pay self-serve."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Stripe customers" value={num(id.stripeCustomers)} sub="Self-serve and invoiced" />
        <KpiCard label="HubSpot companies" value={num(id.hubspotCompanies)} sub="Companies in the CRM" />
        <KpiCard
          label="Matched"
          highlight
          value={num(id.matched)}
          sub={`${pct(matchRate)} of Stripe customers · ${pct(crmCoverage)} of HubSpot companies`}
        />
        <KpiCard
          label="Self-serve accounts in CRM"
          value={num(id.selfServeAccountsInCrm)}
          sub="HubSpot companies already paying via self-serve"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Matches by method" subtitle="How each Stripe customer was linked to a HubSpot company." />
          {methods.length === 0 ? (
            <Empty>No identity matches reported.</Empty>
          ) : (
            <ul className="space-y-4">
              {methods.map(([m, n], i) => (
                <li key={m}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="flex items-center gap-1.5 text-gray-700">
                      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
                      {methodLabel(m)}
                    </span>
                    <span className="tabular text-gray-500">
                      <strong className="text-gray-900">{num(n)}</strong> · {pct(n / methodTotal)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100">
                    <div
                      className="h-2.5 rounded-full"
                      style={{ width: `${(n / methodTotal) * 100}%`, background: SERIES[i % SERIES.length] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Example matches" subtitle="Sample of resolved pairs with match confidence." />
          {id.examples.length === 0 ? (
            <Empty>No examples.</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>Stripe customer</th>
                  <th className={th}>HubSpot company</th>
                  <th className={th}>Method</th>
                  <th className={cx(th, "text-right")}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {id.examples.map((e) => (
                  <tr key={`${e.stripeName}-${e.hubspotName}`} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className={cx(td, "font-medium text-gray-900")}>{e.stripeName}</td>
                    <td className={td}>{e.hubspotName}</td>
                    <td className={td}>
                      <Pill tone={e.method === "fuzzy_name" ? "warning" : e.method === "domain" ? "brand" : "neutral"}>
                        {methodLabel(e.method)}
                      </Pill>
                    </td>
                    <td className={tdNum}>{pct(e.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Architecture" subtitle="A scheduled batch job. Everything in this app is read from one JSON snapshot it produces." />
        <ArchitectureDiagram />
      </Card>
    </>
  );
}
