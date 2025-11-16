import {
  App,
  Notice,
  Plugin,
  TFile,
  TAbstractFile
} from "obsidian";
import { parseFirstMarkdownTable } from "./tableParser";
import { resolveVariables } from "./variableResolver";

interface FrontmatterConfig {
  sourceTableNote: string;
  column: string;
  outputNoteTitle?: string;
}

export default class TableVariableResolverPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "generate-resolved-note-from-table",
      name: "Generate resolved note from table",
      callback: () => this.generateResolvedNote()
    });
  }

  onunload() {
    // No special cleanup needed
  }

  private async generateResolvedNote() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file to resolve.");
      return;
    }

    const { metadataCache, vault } = this.app;

    const fileCache = metadataCache.getFileCache(activeFile);
    const frontmatter = fileCache?.frontmatter as FrontmatterConfig | undefined;

    if (!frontmatter) {
      new Notice("Frontmatter not found. Please add YAML frontmatter with sourceTableNote and column.");
      return;
    }

    const sourceTableNote = frontmatter.sourceTableNote;
    const column = frontmatter.column;

    if (!sourceTableNote || !column) {
      new Notice("Missing required YAML keys: sourceTableNote and column.");
      return;
    }

    const outputTemplate = frontmatter.outputNoteTitle ?? "{{title}} (resolved)";

    const activeContent = await vault.read(activeFile);
    const { frontmatterBlock, body } = splitFrontmatter(activeContent);

    const tableFile = this.resolveSourceTableFile(activeFile, sourceTableNote);
    if (!tableFile) {
      new Notice(`Could not find source table note: ${sourceTableNote}`);
      return;
    }

    const tableContent = await vault.read(tableFile);
    const table = parseFirstMarkdownTable(tableContent);

    if (!table) {
      new Notice("No valid markdown table found in the source table note.");
      return;
    }

    const { headers, rows } = table;

    if (!headers.includes(column)) {
      new Notice(`Column "${column}" not found in table headers.`);
      return;
    }

    const { resolvedBody, missingRowNames } = resolveVariables(body, rows, column);

    if (missingRowNames.length > 0) {
      const preview = missingRowNames.slice(0, 5).join(", ");
      const more = missingRowNames.length > 5 ? " (and more)" : "";
      new Notice(`Some row names were not found in the table: ${preview}${more}`);
    }

    const outputTitle = computeOutputTitle(outputTemplate, activeFile, this.app);
    const newFilePath = await getUniqueFilePath(
      this.app,
      activeFile,
      outputTitle
    );

    const newContent = frontmatterBlock
      ? `${frontmatterBlock}\n${resolvedBody}`
      : resolvedBody;

    const newFile = await vault.create(newFilePath, newContent);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(newFile);

    new Notice(`Resolved note created: ${outputTitle}`);
  }

  private resolveSourceTableFile(currentFile: TFile, linkText: string): TFile | null {
    const { metadataCache, vault } = this.app;

    // Try to resolve using Obsidian's linkpath resolution
    const resolved = metadataCache.getFirstLinkpathDest(linkText, currentFile.path);
    if (resolved instanceof TFile) {
      return resolved;
    }

    // Fallback: direct path lookup
    const abs = vault.getAbstractFileByPath(linkText);
    if (abs instanceof TFile) {
      return abs;
    }

    return null;
  }
}

function splitFrontmatter(content: string): { frontmatterBlock: string | null; body: string } {
  if (!content.startsWith("---")) {
    return { frontmatterBlock: null, body: content };
  }

  const lines = content.split("\n");
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatterBlock: null, body: content };
  }

  const frontmatterBlock = lines.slice(0, endIndex + 1).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").replace(/^\n+/, "");

  return { frontmatterBlock, body };
}

function computeOutputTitle(template: string, file: TFile, app: App): string {
  const title = file.basename;
  let result = template.replace(/{{\s*title\s*}}/g, title);
  result = result.trim();
  if (!result) {
    result = `${title} (resolved)`;
  }
  return result;
}

async function getUniqueFilePath(app: App, baseFile: TFile, desiredTitle: string): Promise<string> {
  const folder = baseFile.parent;
  const vault = app.vault;

  const sanitizedTitle = sanitizeFileName(desiredTitle);
  const basePath = `${folder ? folder.path + "/" : ""}${sanitizedTitle}.md`;

  if (!(vault.getAbstractFileByPath(basePath) instanceof TAbstractFile)) {
    return basePath;
  }

  let counter = 1;
  while (true) {
    const candidate = `${folder ? folder.path + "/" : ""}${sanitizedTitle} ${counter}.md`;
    if (!(vault.getAbstractFileByPath(candidate) instanceof TAbstractFile)) {
      return candidate;
    }
    counter += 1;
  }
}

function sanitizeFileName(name: string): string {
  // Replace characters that are problematic in filenames
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}


