/* Email: assembles mailto links at runtime so the address never appears
   as a scrapeable `user@domain` string in the static HTML. Links carry the
   address split across data-u / data-d attributes; without JavaScript the
   human-readable [at]/[dot] fallback text remains. */

export function initEmail() {
  document.querySelectorAll('a[data-u][data-d]').forEach((link) => {
    const address = `${link.dataset.u}@${link.dataset.d}`;
    link.href = `mailto:${address}`;
    if (link.dataset.reveal === 'text') link.textContent = address;
  });
}
