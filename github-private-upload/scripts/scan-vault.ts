import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type Heading = {
  level: number;
  text: string;
  lineNumber: number;
};

type NoteIndexRecord = {
  id: string;
  filePath: string;
  title: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  headings: Heading[];
  wikilinks: string[];
  body: string;
  modifiedAt: string;
  contentHash: string;
};

const IGNORED_DIRECTORIES = new Set([".obsidian", ".trash", "node_modules", ".git"]);
const PROJECT_ROOT = process.cwd();
const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH ?? "./obsidian-vault-copy";
const VAULT_NAME = process.env.OBSIDIAN_VAULT_NAME ?? "MyVault";

function parseScalar(rawValue: string): unknown {
  const value = rawValue.trim();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const items = value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseScalar(item));
    return items;
  }

  return value;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: content };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join("\n");
  const frontmatter: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const rawLine of frontmatterLines) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (currentKey && listMatch) {
      const existing = Array.isArray(frontmatter[currentKey])
        ? (frontmatter[currentKey] as unknown[])
        : [];
      frontmatter[currentKey] = [...existing, parseScalar(listMatch[1])];
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    if (!rawValue) {
      frontmatter[key] = [];
      currentKey = key;
      continue;
    }

    frontmatter[key] = parseScalar(rawValue);
    currentKey = null;
  }

  return { frontmatter, body };
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^#/, ""));
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^#/, ""));
  }

  return [];
}

function extractHeadings(body: string): Heading[] {
  return body.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!match) {
      return [];
    }

    return [
      {
        level: match[1].length,
        text: match[2].trim(),
        lineNumber: index + 1,
      },
    ];
  });
}

function extractBodyTags(body: string): string[] {
  const matches = [...body.matchAll(/(^|[\s(])#([\p{L}\p{N}_/-]+)/gu)];
  return matches.map((match) => match[2]);
}

function extractWikilinks(body: string): string[] {
  const matches = [...body.matchAll(/\[\[([^\]]+)\]\]/g)];
  return [...new Set(matches.map((match) => match[1].trim()).filter(Boolean))];
}

async function walkMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await walkMarkdownFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const resolvedVaultPath = path.resolve(PROJECT_ROOT, VAULT_PATH);
  const outputDirectory = path.resolve(PROJECT_ROOT, "data");
  await mkdir(outputDirectory, { recursive: true });

  let markdownFiles: string[] = [];

  try {
    markdownFiles = await walkMarkdownFiles(resolvedVaultPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[scan-vault] Vault path not found: ${resolvedVaultPath}. Writing an empty notes index.`);
    } else {
      throw error;
    }
  }

  const notes: NoteIndexRecord[] = [];

  for (const absolutePath of markdownFiles.sort((left, right) => left.localeCompare(right))) {
    const rawContent = await readFile(absolutePath, "utf8");
    const fileStats = await stat(absolutePath);
    const { frontmatter, body } = parseFrontmatter(rawContent);
    const headings = extractHeadings(body);
    const firstH1 = headings.find((heading) => heading.level === 1)?.text;
    const filePath = path.relative(resolvedVaultPath, absolutePath).split(path.sep).join("/");
    const fileName = path.basename(absolutePath, path.extname(absolutePath));
    const frontmatterTitle = typeof frontmatter.title === "string" ? frontmatter.title : undefined;
    const title = frontmatterTitle ?? firstH1 ?? fileName;
    const tags = [
      ...normalizeTags(frontmatter.tags),
      ...normalizeTags(frontmatter.tag),
      ...extractBodyTags(body),
    ];

    notes.push({
      id: createHash("sha256").update(filePath).digest("hex"),
      filePath,
      title,
      frontmatter,
      tags: [...new Set(tags)].sort((left, right) => left.localeCompare(right)),
      headings,
      wikilinks: extractWikilinks(body),
      body,
      modifiedAt: fileStats.mtime.toISOString(),
      contentHash: createHash("sha256").update(rawContent).digest("hex"),
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    vaultPath: VAULT_PATH,
    vaultName: VAULT_NAME,
    noteCount: notes.length,
    notes,
  };

  const outputPath = path.join(outputDirectory, "notes.index.json");
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[scan-vault] Indexed ${notes.length} markdown files -> ${outputPath}`);
}

void main().catch((error) => {
  console.error("[scan-vault] Failed:", error);
  process.exitCode = 1;
});
