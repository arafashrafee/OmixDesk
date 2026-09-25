import { BrandMark } from "@/components/brand/brand-mark";

export type InvoiceDocumentData = {
  organizationName: string;
  organizationEmail: string | null;
  organizationPhone: string | null;
  organizationAddress: string | null;
  organizationWebsite: string | null;
  invoiceNumber: string;
  title: string;
  statusLabel: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  recipientName: string;
  recipientCompany: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  payments: Array<{
    amount: number;
    paymentDate: string;
    method: string;
    reference: string | null;
  }>;
};

export function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const money = (value: number) =>
    `${invoice.currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const collectible = invoice.statusLabel !== "Void" && invoice.statusLabel !== "Draft";

  return (
    <article className="invoice-sheet bg-white text-zinc-900">
      <header className="flex items-start justify-between gap-6 border-b border-zinc-300 pb-6">
        <div>
          <BrandMark variant="wordmark" />
          <p className="mt-3 text-xs tracking-[0.16em] text-zinc-500 uppercase">Invoice</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{invoice.organizationName}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {[invoice.organizationAddress, invoice.organizationEmail, invoice.organizationPhone, invoice.organizationWebsite]
              .filter(Boolean)
              .join(" · ") || "OmixDesk"}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{invoice.invoiceNumber}</p>
          <p className="text-zinc-700">{invoice.statusLabel}</p>
        </div>
      </header>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Bill to</p>
          <p className="mt-1 text-sm font-medium">{invoice.recipientName}</p>
          <p className="text-sm text-zinc-600">
            {[invoice.recipientCompany, invoice.recipientEmail, invoice.recipientPhone, invoice.recipientAddress]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-sm sm:text-right">
          <p>{invoice.title}</p>
          <p className="text-zinc-600">Issued {invoice.issueDate}</p>
          <p className="text-zinc-600">Due {invoice.dueDate}</p>
        </div>
      </div>
      <table className="mt-8 w-full text-left text-sm">
        <thead className="border-b border-zinc-300 text-xs tracking-wide text-zinc-500 uppercase">
          <tr>
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={index} className="border-b border-zinc-100">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
              <td className="py-2 text-right tabular-nums">{money(item.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
        <Row label="Subtotal" value={money(invoice.subtotal)} />
        <Row label="Discount" value={money(invoice.discountAmount)} />
        <Row label="Tax" value={money(invoice.taxAmount)} />
        <Row label="Total" value={money(invoice.total)} />
        <Row label="Amount paid" value={money(invoice.amountPaid)} />
        <Row label={collectible ? "Balance due" : "Balance"} value={collectible ? money(invoice.balanceDue) : money(0)} />
      </dl>
      {invoice.payments.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs tracking-wide text-zinc-500 uppercase">Payments</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {invoice.payments.map((payment, index) => (
              <li key={index}>
                {payment.paymentDate} · {payment.method.replaceAll("_", " ")} · {money(payment.amount)}
                {payment.reference ? ` · ${payment.reference}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {invoice.notes ? <section className="mt-8 whitespace-pre-wrap text-sm leading-6">{invoice.notes}</section> : null}
      {invoice.terms ? (
        <section className="mt-6">
          <h2 className="text-xs tracking-wide text-zinc-500 uppercase">Terms</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{invoice.terms}</p>
        </section>
      ) : null}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
