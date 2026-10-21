/**
 * Saves text built in the browser as a file, through a Blob and a download
 * link: nothing leaves the page. The production CSP does not restrict it.
 */
export function downloadText(text: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by then; give it a moment before letting it go.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
