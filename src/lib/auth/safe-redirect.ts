/**
 * Validates post-auth redirect targets.
 * Only same-origin relative paths are accepted.
 */
export function safeInternalPath(
  candidate: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (candidate == null || typeof candidate !== "string") {
    return fallback;
  }

  const path = candidate.trim();
  if (path.length === 0 || path.length > 512) {
    return fallback;
  }

  if (!path.startsWith("/")) {
    return fallback;
  }

  // Protocol-relative and schemed URLs
  if (path.startsWith("//") || path.includes("://")) {
    return fallback;
  }

  // Backslash normalization tricks / encoded separators
  if (path.includes("\\") || path.includes("%5c") || path.includes("%5C")) {
    return fallback;
  }

  // Control characters and whitespace
  if (/[\u0000-\u001F\u007F\s]/.test(path)) {
    return fallback;
  }

  // Reject userinfo-style payloads
  if (path.includes("@")) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(path);
    if (
      decoded !== path &&
      (decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("://"))
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  try {
    const url = new URL(path, "http://omixdesk.local");
    if (url.username || url.password) {
      return fallback;
    }
    if (url.host !== "omixdesk.local") {
      return fallback;
    }
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    if (!normalized.startsWith("/") || normalized.startsWith("//")) {
      return fallback;
    }
    return normalized;
  } catch {
    return fallback;
  }
}
