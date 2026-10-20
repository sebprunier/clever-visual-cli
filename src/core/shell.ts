/**
 * Quotes a value for a POSIX shell, only when it needs it, so the commands
 * the app shows stay readable: `env:prod` and percent-encoded URLs go as they
 * are, anything else between single quotes.
 */
export function shellQuote(value: string): string {
  if (value === '') {
    return "''";
  }
  if (/^[A-Za-z0-9_./:@=+,%-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
