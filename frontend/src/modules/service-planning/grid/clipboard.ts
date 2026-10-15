// Excel and Google Sheets put tab-separated text on the clipboard; cells with tabs, line breaks or quotes
// are wrapped in double quotes with inner quotes doubled.

export const parseClipboardTable = (raw: string): string[][] => {
  const text = raw.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === '\t') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Excel ends a copied range with a line break; drop trailing empty rows.
  while (rows.length && rows[rows.length - 1].every((value) => value === '')) rows.pop();
  return rows;
};

const quote = (value: string) => (/[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export const toClipboardTable = (rows: string[][]) => rows.map((row) => row.map(quote).join('\t')).join('\n');
