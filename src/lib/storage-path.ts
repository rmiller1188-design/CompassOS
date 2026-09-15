export type FileVisibility = "private" | "shared";

export function cleanFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "file").slice(-140);
}

export function createStoragePath(input: {
  workspaceId: string;
  userId: string;
  visibility: FileVisibility;
  fileName: string;
  prefix?: string;
}): string {
  const prefix = input.prefix ? `${input.prefix.replace(/[^a-zA-Z0-9_-]+/g, "-")}-` : "";
  return `${input.workspaceId}/${input.visibility}/${input.userId}/${prefix}${crypto.randomUUID()}-${cleanFileName(input.fileName)}`;
}

export function isOwnedStoragePath(input: {
  path: string;
  workspaceId: string;
  userId: string;
  visibility: FileVisibility;
}): boolean {
  const expectedPrefix = `${input.workspaceId}/${input.visibility}/${input.userId}/`;
  return input.path.startsWith(expectedPrefix) && !input.path.includes("..") && !input.path.includes("\\");
}
