"use client";

import { useActionState, useEffect } from "react";
import { confirmSubmit } from "@/components/ui/confirm-submit";
import { useRouter } from "next/navigation";
import {
  deleteInvoiceAction,
  issueInvoiceAction,
  recordPaymentAction,
  voidInvoiceAction,
} from "@/actions/invoices";
import { PAYMENT_METHODS } from "@/lib/billing/rules";
import { fieldClass, quietButtonClass } from "@/components/operations/styles";
import { deliveryNotice } from "@/lib/email/status";
import type { DeliveryOutcome } from "@/lib/email/dispatch";
import type { ActionResult } from "@/lib/errors";

const initial: ActionResult<{ id: string; email?: DeliveryOutcome }> | null = null;

export function InvoiceControls({
  invoiceId,
  status,
  amountPaid,
  balanceDue,
}: {
  invoiceId: string;
  status: "draft" | "issued" | "partially_paid" | "paid" | "void";
  amountPaid: number;
  balanceDue: number;
}) {
  return (
    <div className="space-y-4 border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <>
            <LifecycleButton invoiceId={invoiceId} action={issueInvoiceAction} label="Issue invoice" />
            <LifecycleButton invoiceId={invoiceId} action={deleteInvoiceAction} label="Delete draft" redirectToList />
          </>
        ) : null}
        {status === "issued" && amountPaid === 0 ? (
          <LifecycleButton invoiceId={invoiceId} action={voidInvoiceAction} label="Void invoice" />
        ) : null}
      </div>
      {status === "issued" || status === "partially_paid" ? (
        <PaymentForm invoiceId={invoiceId} balanceDue={balanceDue} />
      ) : null}
      <p className="text-xs text-zinc-500">Recorded payments stay in the history. They cannot be edited or deleted here.</p>
    </div>
  );
}

function LifecycleButton({
  invoiceId,
  action,
  label,
  redirectToList,
}: {
  invoiceId: string;
  action: (
    prev: ActionResult<{ id: string; email?: DeliveryOutcome }> | null,
    formData: FormData,
  ) => Promise<ActionResult<{ id: string; email?: DeliveryOutcome }>>;
  label: string;
  redirectToList?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initial);
  useEffect(() => {
    if (!state?.ok) return;
    if (redirectToList) {
      router.push("/dashboard/invoices");
    }
    router.refresh();
  }, [redirectToList, router, state]);

  return (
    <form
      action={formAction}
      onSubmit={
        label.startsWith("Delete")
          ? confirmSubmit("Delete this draft invoice? This cannot be undone.")
          : undefined
      }
    >
      <input type="hidden" name="id" value={invoiceId} />
      <button disabled={pending} className={quietButtonClass} type="submit">{label}</button>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      {state?.ok && state.data.email && state.data.email !== "skipped" ? (
        <p className="text-sm text-zinc-700">{deliveryNotice(state.data.email)}</p>
      ) : null}
    </form>
  );
}

function PaymentForm({ invoiceId, balanceDue }: { invoiceId: string; balanceDue: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(recordPaymentAction, initial);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={invoiceId} />
      <label className="space-y-1 text-sm">
        <span className="font-medium text-zinc-800">Amount (balance {balanceDue.toFixed(2)})</span>
        <input name="amount" required className={fieldClass} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-zinc-800">Payment date</span>
        <input type="date" name="paymentDate" required className={fieldClass} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-zinc-800">Method</span>
        <select name="method" className={fieldClass} defaultValue="bank_transfer">
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>{method.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-zinc-800">Reference</span>
        <input name="reference" className={fieldClass} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium text-zinc-800">Staff note</span>
        <input name="notes" className={fieldClass} />
      </label>
      <div>
        <button disabled={pending} className={quietButtonClass} type="submit">Record payment</button>
        {state && !state.ok ? <p className="mt-2 text-sm text-red-700">{state.error.message}</p> : null}
        {state?.ok && state.data.email && state.data.email !== "skipped" ? (
          <p className="mt-2 text-sm text-zinc-700">{deliveryNotice(state.data.email)}</p>
        ) : null}
      </div>
    </form>
  );
}
