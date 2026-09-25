export type DiscountType = "fixed" | "percentage" | null;

export type ProposalLineInput = {
  quantity: number;
  unitPrice: number;
};

export type ProposalTotals = {
  lineTotals: number[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export type ProposalMoneyInput = {
  lines: readonly ProposalLineInput[];
  discountType: DiscountType;
  discountValue: number | null;
  taxPercent: number | null;
};

/** Half away from zero, matching PostgreSQL round(numeric, 2) for non-negative amounts. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  return Math.round(value * 100 + Number.EPSILON) / 100;
}

export function calculateProposalMoney(
  input: ProposalMoneyInput,
): { ok: true; totals: ProposalTotals } | { ok: false; message: string } {
  if (input.lines.length < 1) {
    return { ok: false, message: "Add at least one line item." };
  }

  const lineTotals: number[] = [];
  for (const line of input.lines) {
    if (!(line.quantity > 0) || line.unitPrice < 0) {
      return { ok: false, message: "Quantity and price are invalid." };
    }
    lineTotals.push(roundMoney(line.quantity * line.unitPrice));
  }

  const subtotal = roundMoney(lineTotals.reduce((sum, line) => sum + line, 0));
  let discountAmount = 0;

  if (input.discountType && input.discountValue !== null) {
    if (input.discountValue < 0) {
      return { ok: false, message: "Discount cannot be negative." };
    }
    if (input.discountType === "percentage") {
      if (input.discountValue > 100) {
        return { ok: false, message: "Percentage discount cannot exceed 100." };
      }
      discountAmount = roundMoney((subtotal * input.discountValue) / 100);
    } else {
      discountAmount = roundMoney(input.discountValue);
    }
  }

  if (discountAmount > subtotal) {
    return { ok: false, message: "Discount cannot exceed the subtotal." };
  }

  if (input.taxPercent !== null && (input.taxPercent < 0 || input.taxPercent > 100)) {
    return { ok: false, message: "Tax must be between 0 and 100." };
  }

  const taxable = roundMoney(subtotal - discountAmount);
  const taxAmount =
    input.taxPercent === null ? 0 : roundMoney((taxable * input.taxPercent) / 100);
  const total = roundMoney(taxable + taxAmount);

  if (total < 0) {
    return { ok: false, message: "Total cannot be negative." };
  }

  return {
    ok: true,
    totals: { lineTotals, subtotal, discountAmount, taxAmount, total },
  };
}

export function formatProposalNumber(year: number, sequence: number): string {
  return `OMX-${year}-${String(sequence).padStart(4, "0")}`;
}
