/** A `NAME=value` line per variable, values quoted only when a `.env` reader needs it. */
export function toDotenv(variables: readonly { name: string; value: string }[]): string {
  return variables.map((variable) => `${variable.name}=${dotenvValue(variable.value)}`).join('\n');
}

export function dotenvValue(value: string): string {
  return /^[A-Za-z0-9_./:@=+-]*$/.test(value)
    ? value
    : `"${value.replace(/(["\\$`])/g, '\\$1').replace(/\n/g, '\\n')}"`;
}

/** Bullets in place of a hidden value, roughly as long as it, between 6 and 24. */
export function maskValue(value: string): string {
  return value.length === 0 ? '' : '•'.repeat(Math.min(Math.max(value.length, 6), 24));
}
