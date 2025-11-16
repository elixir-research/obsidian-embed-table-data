import type { ParsedTable } from "./tableParser";

export function resolveVariables(
  body: string,
  rows: ParsedTable["rows"],
  column: string
): { resolvedBody: string; missingRowNames: string[] } {
  const missing = new Set<string>();

  const resolvedBody = body.replace(/\{([^}]+)\}/g, (match, rowNameRaw: string) => {
    const rowName = rowNameRaw.trim();
    if (!rowName) return match;

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


