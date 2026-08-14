/* Email: builds the mailto links at run time. The address is never a
   complete user@domain string in the HTML, so a scraper cannot read it.
   Each link holds the address in the data-u and data-d attributes.
   Without JavaScript the [at] and [dot] text stays. */

export function initEmail() {
  document.querySelectorAll('a[data-u][data-d]').forEach((link) => {
    const address = `${link.dataset.u}@${link.dataset.d}`;
    link.href = `mailto:${address}`;
    if (link.dataset.reveal === 'text') link.textContent = address;
  });
}
