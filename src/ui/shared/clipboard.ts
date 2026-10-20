/**
 * Writes text to the clipboard, never reads it. The asynchronous API needs a
 * secure context (https or localhost) and a user gesture; where it is
 * missing or refused, a hidden text area and `execCommand('copy')` take over.
 * Resolves to false when neither worked.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText != null) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused or unavailable: try the older way.
  }
  return copyWithTextArea(text);
}

function copyWithTextArea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
