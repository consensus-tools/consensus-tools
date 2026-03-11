export interface ColumnDef {
  key: string;
  label?: string;
  align?: "left" | "right";
}

export function renderTable(rows: Array<Record<string, unknown>>, columns: ColumnDef[]): string {
  const headers = columns.map((col) => col.label || col.key);
  const data = rows.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      return val === undefined || val === null ? "" : String(val);
    }),
  );

  const widths = headers.map((header, idx) => {
    const maxCell = Math.max(header.length, ...data.map((row) => row[idx]?.length || 0));
    return Math.min(Math.max(maxCell, 4), 80);
  });

  const formatRow = (cells: string[]) =>
    cells
      .map((cell, idx) => {
        const width = widths[idx]!;
        const trimmed = cell.length > width ? `${cell.slice(0, width - 3)}...` : cell;
        return columns[idx]!.align === "right" ? trimmed.padStart(width, " ") : trimmed.padEnd(width, " ");
      })
      .join("  ");

  return [formatRow(headers), formatRow(headers.map((_h, i) => "-".repeat(widths[i]!))), ...data.map(formatRow)].join("\n");
}
