'use strict';

var obsidian = require('obsidian');

function parseFirstMarkdownTable(content) {
    const lines = content.split("\n");
    let start = -1;
    let end = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (isTableLine(line)) {
            if (start === -1) {
                start = i;
            }
            end = i;
        }
        else if (start !== -1) {
            break;
        }
    }
    if (start === -1 || end === -1) {
        return null;
    }
    const tableLines = lines.slice(start, end + 1).map((l) => l.trim());
    if (tableLines.length < 2) {
        return null;
    }
    const headerLine = tableLines[0];
    const separatorLine = tableLines[1];
    if (!isSeparatorLine(separatorLine)) {
        return null;
    }
    const headers = parseRow(headerLine);
    if (headers.length < 2) {
        return null;
    }
    const dataRows = tableLines.slice(2);
    const rows = {};
    for (const rowLine of dataRows) {
        const cells = parseRow(rowLine);
        if (cells.length === 0)
            continue;
        const rowName = cells[0];
        if (!rowName)
            continue;
        const rowData = {};
        for (let i = 1; i < headers.length && i < cells.length; i++) {
            const header = headers[i];
            rowData[header] = cells[i];
        }
        rows[rowName] = rowData;
    }
    return { headers, rows };
}
function isTableLine(line) {
    return line.startsWith("|") && line.includes("|");
}
function isSeparatorLine(line) {
    if (!isTableLine(line))
        return false;
    const cells = parseRow(line);
    if (cells.length < 2)
        return false;
    return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}
function parseRow(line) {
    // Remove leading/trailing pipe and split
    const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
    return trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
}

function resolveVariables(body, rows, column) {
    const missing = new Set();
    const resolvedBody = body.replace(/\{([^}]+)\}/g, (match, rowNameRaw) => {
        const rowName = rowNameRaw.trim();
        if (!rowName)
            return match;
        const row = rows[rowName];
        const value = row?.[column];
        if (value === undefined || value === null || value === "") {
            missing.add(rowName);
            return match;
        }
        return value;
    });
    return {
        resolvedBody,
        missingRowNames: Array.from(missing)
    };
}

class TableVariableResolverPlugin extends obsidian.Plugin {
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
    async generateResolvedNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new obsidian.Notice("No active file to resolve.");
            return;
        }
        const { metadataCache, vault } = this.app;
        const fileCache = metadataCache.getFileCache(activeFile);
        const frontmatter = fileCache?.frontmatter;
        if (!frontmatter) {
            new obsidian.Notice("Frontmatter not found. Please add YAML frontmatter with sourceTableNote and column.");
            return;
        }
        const sourceTableNote = frontmatter.sourceTableNote;
        const column = frontmatter.column;
        if (!sourceTableNote || !column) {
            new obsidian.Notice("Missing required YAML keys: sourceTableNote and column.");
            return;
        }
        const outputTemplate = frontmatter.outputNoteTitle ?? "{{title}} (resolved)";
        const activeContent = await vault.read(activeFile);
        const { frontmatterBlock, body } = splitFrontmatter(activeContent);
        const tableFile = this.resolveSourceTableFile(activeFile, sourceTableNote);
        if (!tableFile) {
            new obsidian.Notice(`Could not find source table note: ${sourceTableNote}`);
            return;
        }
        const tableContent = await vault.read(tableFile);
        const table = parseFirstMarkdownTable(tableContent);
        if (!table) {
            new obsidian.Notice("No valid markdown table found in the source table note.");
            return;
        }
        const { headers, rows } = table;
        if (!headers.includes(column)) {
            new obsidian.Notice(`Column "${column}" not found in table headers.`);
            return;
        }
        const { resolvedBody, missingRowNames } = resolveVariables(body, rows, column);
        if (missingRowNames.length > 0) {
            const preview = missingRowNames.slice(0, 5).join(", ");
            const more = missingRowNames.length > 5 ? " (and more)" : "";
            new obsidian.Notice(`Some row names were not found in the table: ${preview}${more}`);
        }
        const outputTitle = computeOutputTitle(outputTemplate, activeFile, this.app);
        const newFilePath = await getUniqueFilePath(this.app, activeFile, outputTitle);
        const newContent = frontmatterBlock
            ? `${frontmatterBlock}\n${resolvedBody}`
            : resolvedBody;
        const newFile = await vault.create(newFilePath, newContent);
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.openFile(newFile);
        new obsidian.Notice(`Resolved note created: ${outputTitle}`);
    }
    resolveSourceTableFile(currentFile, linkText) {
        const { metadataCache, vault } = this.app;
        // Try to resolve using Obsidian's linkpath resolution
        const resolved = metadataCache.getFirstLinkpathDest(linkText, currentFile.path);
        if (resolved instanceof obsidian.TFile) {
            return resolved;
        }
        // Fallback: direct path lookup
        const abs = vault.getAbstractFileByPath(linkText);
        if (abs instanceof obsidian.TFile) {
            return abs;
        }
        return null;
    }
}
function splitFrontmatter(content) {
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
function computeOutputTitle(template, file, app) {
    const title = file.basename;
    let result = template.replace(/{{\s*title\s*}}/g, title);
    result = result.trim();
    if (!result) {
        result = `${title} (resolved)`;
    }
    return result;
}
async function getUniqueFilePath(app, baseFile, desiredTitle) {
    const folder = baseFile.parent;
    const vault = app.vault;
    const sanitizedTitle = sanitizeFileName(desiredTitle);
    const basePath = `${folder ? folder.path + "/" : ""}${sanitizedTitle}.md`;
    if (!(vault.getAbstractFileByPath(basePath) instanceof obsidian.TAbstractFile)) {
        return basePath;
    }
    let counter = 1;
    while (true) {
        const candidate = `${folder ? folder.path + "/" : ""}${sanitizedTitle} ${counter}.md`;
        if (!(vault.getAbstractFileByPath(candidate) instanceof obsidian.TAbstractFile)) {
            return candidate;
        }
        counter += 1;
    }
}
function sanitizeFileName(name) {
    // Replace characters that are problematic in filenames
    return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

module.exports = TableVariableResolverPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOltdLCJzb3VyY2VzQ29udGVudCI6W10sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7In0=
