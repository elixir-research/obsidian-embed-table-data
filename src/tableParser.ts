export interface ParsedTable {
  headers: string[];
  rows: Record<string, Record<string, string>>;
}

export function parseFirstMarkdownTable(content: string): ParsedTable | null {
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
    } else if (start !== -1) {
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
  const rows: Record<string, Record<string, string>> = {};

  for (const rowLine of dataRows) {
    const cells = parseRow(rowLine);
    if (cells.length === 0) continue;

    const rowName = cells[0];
    if (!rowName) continue;

    const rowData: Record<string, string> = {};
    for (let i = 1; i < headers.length && i < cells.length; i++) {
      const header = headers[i];
      rowData[header] = cells[i];
    }

    rows[rowName] = rowData;
  }

  return { headers, rows };
}

function isTableLine(line: string): boolean {
  return line.startsWith("|") && line.includes("|");
}

function isSeparatorLine(line: string): boolean {
  if (!isTableLine(line)) return false;
  const cells = parseRow(line);
  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function parseRow(line: string): string[] {
  // Remove leading/trailing pipe and split
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
}


