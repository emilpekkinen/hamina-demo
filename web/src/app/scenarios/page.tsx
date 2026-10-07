import type { Metadata } from "next";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { eur } from "@/lib/format";

export const metadata: Metadata = { title: "Scenarios · Hamina RevOps (demo)" };

export default function ScenariosPage() {
  const { scenarios } = data;
  return (
    <>
      <PageHeader
        eyebrow="Scenarios"
        title="What if we"
        accent="change the inputs?"
        lead={
          <>
            Move a lever and see FY2027 revenue and December 2027 ARR react instantly. Base case: {eur(scenarios.base.fy2027Revenue)}{" "}
            revenue and {eur(scenarios.base.arrDec2027)} ARR. Impacts are linearised from the Monte Carlo model,
            so they are best read as first-order sensitivities, not full re-simulations.
          </>
        }
      />
      <ScenarioPanel scenarios={scenarios} />
    </>
  );
}
