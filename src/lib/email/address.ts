const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

export function safeRecipientEmail(candidate: string | null | undefined): string | null {
  if (candidate == null) {
    return null;
  }
  if (/[\u0000-\u001F\u007F]/.test(candidate) || /\s/.test(candidate)) {
    return null;
  }
  const email = candidate.trim().toLowerCase();
  if (email.length < 3 || email.length > 200 || !EMAIL_PATTERN.test(email)) {
    return null;
  }
  return email;
}

export function safeFromAddress(candidate: string | null | undefined): string | null {
  if (candidate == null) {
    return null;
  }
  const from = candidate.trim();
  if (from.length < 3 || from.length > 200) {
    return null;
  }
  if (/[\u0000-\u001F\u007F]/.test(from)) {
    return null;
  }
  const wrapped = from.match(/^([^<>]+)<([^<>]+)>$/);
  const email = wrapped ? wrapped[2]?.trim() : from;
  if (!email || safeRecipientEmail(email) == null) {
    return null;
  }
  if (wrapped && /[<>]/.test(wrapped[1] ?? "")) {
    return null;
  }
  return from;
}
