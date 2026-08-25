import { FileCheck2, ShieldCheck, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: Sparkles,
    title: "Cobia drafts the policy",
    description: "Your goal becomes explicit assets, amounts, routes, deadlines, and protection limits.",
  },
  {
    icon: FileCheck2,
    title: "You review every bound",
    description: "Nothing is hidden behind the prompt. You can edit the compiled policy before continuing.",
  },
  {
    icon: ShieldCheck,
    title: "Your wallet approves it",
    description: "Cobia cannot move funds from this page. Execution authority stays with your signed policy.",
  },
] as const;

export function IntentFlowGuide() {
  return <aside className="intent-flow-guide" aria-labelledby="intent-flow-guide-heading">
    <h2 id="intent-flow-guide-heading">What happens next</h2>
    <ol>
      {STEPS.map(({ icon: Icon, title, description }) => <li key={title}>
        <span aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
        <div><strong>{title}</strong><p>{description}</p></div>
      </li>)}
    </ol>
  </aside>;
}
