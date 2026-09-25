import { BrandMark } from "@/components/brand/brand-mark";
import type { DiscountType } from "@/lib/proposals/money";

export type ProposalDocumentData = {
  organizationName: string;
  organizationEmail: string | null;
  organizationPhone: string | null;
  organizationAddress: string | null;
  organizationWebsite: string | null;
  proposalNumber: string;
  title: string;
  status: string;
  issueDate: string;
  validUntil: string | null;
  currency: string;
  recipientName: string;
  recipientCompany: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  introduction: string | null;
  scope: string | null;
  terms: string | null;
  clientNotes: string | null;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number | null;
  discountAmount: number;
  taxPercent: number | null;
  taxAmount: number;
  total: number;
  items: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  pastValidity: boolean;
};

export function ProposalDocument({ proposal }: { proposal: ProposalDocumentData }) {
  const money = (value: number) =>
    `${proposal.currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <article className="proposal-sheet bg-white text-zinc-900">
      <header className="flex items-start justify-between gap-6 border-b border-zinc-300 pb-6">
        <div>
          <BrandMark variant="wordmark" />
          <p className="mt-3 text-xs tracking-[0.16em] text-zinc-500 uppercase">Proposal</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{proposal.organizationName}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {[proposal.organizationAddress, proposal.organizationEmail, proposal.organizationPhone, proposal.organizationWebsite]
              .filter(Boolean)
              .join(" · ") || "OmixDesk"}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{proposal.proposalNumber}</p>
          <p className="text-zinc-500">{proposal.status}</p>
          {proposal.pastValidity ? <p className="text-zinc-700">Validity date has passed</p> : null}
        </div>
      </header>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Prepared for</p>
          <p className="mt-1 text-sm font-medium">{proposal.recipientName}</p>
          <p className="text-sm text-zinc-600">
            {[proposal.recipientCompany, proposal.recipientEmail, proposal.recipientPhone, proposal.recipientAddress]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-sm sm:text-right">
          <p>{proposal.title}</p>
          <p className="text-zinc-600">Issued {proposal.issueDate}</p>
          <p className="text-zinc-600">Valid until {proposal.validUntil ?? "—"}</p>
        </div>
      </div>

      {proposal.introduction ? <p className="mt-6 whitespace-pre-wrap text-sm leading-6">{proposal.introduction}</p> : null}
      {proposal.scope ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Scope of work</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{proposal.scope}</p>
        </section>
      ) : null}

      <div className="document-scroll" role="region" aria-label="Line items" tabIndex={0}><table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500 uppercase">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {proposal.items.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-b border-zinc-100">
              <td className="py-3 pr-4">
                <p className="font-medium">{item.name}</p>
                {item.description ? <p className="text-zinc-600">{item.description}</p> : null}
              </td>
              <td className="py-3 text-right tabular-nums">{item.quantity}</td>
              <td className="py-3 text-right tabular-nums">{money(item.unitPrice)}</td>
              <td className="py-3 text-right tabular-nums">{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(proposal.subtotal)}</dd></div>
        <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">{money(proposal.discountAmount)}</dd></div>
        <div className="flex justify-between"><dt>Tax</dt><dd className="tabular-nums">{money(proposal.taxAmount)}</dd></div>
        <div className="flex justify-between border-t border-zinc-300 pt-2 font-semibold">
          <dt>Total</dt><dd className="tabular-nums">{money(proposal.total)}</dd>
        </div>
      </dl>

      {proposal.terms ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Terms</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{proposal.terms}</p>
        </section>
      ) : null}
      {proposal.clientNotes ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{proposal.clientNotes}</p>
        </section>
      ) : null}
    </article>
  );
}
