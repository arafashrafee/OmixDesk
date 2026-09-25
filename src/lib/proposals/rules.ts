export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

/**
 * draft → sent
 * sent → accepted | rejected | expired
 * rejected | expired → draft
 * accepted is terminal
 * sent does not return directly to draft
 */
export function canTransitionProposal(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  if (from === to) {
    return false;
  }
  if (from === "accepted") {
    return false;
  }
  if (from === "draft") {
    return to === "sent";
  }
  if (from === "sent") {
    return to === "accepted" || to === "rejected" || to === "expired";
  }
  if (from === "rejected" || from === "expired") {
    return to === "draft";
  }
  return false;
}

export function proposalIsCommerciallyEditable(status: ProposalStatus): boolean {
  return status === "draft";
}

export function proposalCanBeDeleted(status: ProposalStatus): boolean {
  return status === "draft";
}

export type ProposalSource = { leadId: string | null; clientId: string | null };

export function proposalSourceIsExclusive(source: ProposalSource): boolean {
  const hasLead = source.leadId !== null;
  const hasClient = source.clientId !== null;
  return hasLead !== hasClient;
}

export type PrintableProposal = {
  proposalNumber: string;
  title: string;
  recipientName: string;
  clientNotes: string | null;
  total: number;
  currency: string;
};

/** Customer document model. Internal notes are intentionally absent. */
export function toPrintableProposal(input: {
  proposalNumber: string;
  title: string;
  recipientName: string;
  clientNotes: string | null;
  internalNotes: string | null;
  total: number;
  currency: string;
}): PrintableProposal {
  return {
    proposalNumber: input.proposalNumber,
    title: input.title,
    recipientName: input.recipientName,
    clientNotes: input.clientNotes,
    total: input.total,
    currency: input.currency,
  };
}
