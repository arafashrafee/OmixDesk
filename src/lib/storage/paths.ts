const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FILES_BUCKET = "omixdesk-files";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_FILE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedFileMimeType = (typeof ALLOWED_FILE_MIME_TYPES)[number];

const ALLOWED_MIME = new Set<string>(ALLOWED_FILE_MIME_TYPES);

export type FileOwner =
  | { kind: "projects"; projectId: string }
  | { kind: "clients"; clientId: string };

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "file";
}

export function buildStoragePath(input: {
  organizationId: string;
  owner: FileOwner;
  fileName: string;
  objectId: string;
}): string {
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.objectId) ||
    input.fileName.includes("\0")
  ) {
    throw new Error("Invalid storage path input");
  }

  const entityId =
    input.owner.kind === "projects" ? input.owner.projectId : input.owner.clientId;
  if (!isUuid(entityId)) {
    throw new Error("Invalid storage path input");
  }

  const safeName = sanitizeFileName(input.fileName);
  return `${input.organizationId}/${input.owner.kind}/${entityId}/${input.objectId}-${safeName}`;
}

export function fileOwnerIsExclusive(
  projectId: string | null,
  clientId: string | null,
): boolean {
  const hasProject = projectId !== null;
  const hasClient = clientId !== null;
  return hasProject !== hasClient;
}

export function assertActiveOrgMatch(
  resourceOrganizationId: string,
  activeOrganizationId: string,
): boolean {
  return (
    isUuid(resourceOrganizationId) &&
    resourceOrganizationId === activeOrganizationId
  );
}

export function isAllowedMimeType(mimeType: string): mimeType is AllowedFileMimeType {
  return ALLOWED_MIME.has(mimeType);
}
