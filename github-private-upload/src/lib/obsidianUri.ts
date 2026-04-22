function normalizeSourcePath(sourcePath: string): string {
  return sourcePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.md$/i, "");
}

export function buildObsidianUri(vaultName: string, sourcePath: string): string {
  const normalizedPath = normalizeSourcePath(sourcePath);
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(
    normalizedPath,
  )}`;
}
