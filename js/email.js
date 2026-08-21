/* Email: makes each mailto link at run time, so the HTML never holds the
   full address. Each link keeps the parts in data-u and data-d. Without a
   script the [at] and [dot] text stays. */

export function initEmail() {
  document.querySelectorAll('a[data-u][data-d]').forEach((link) => {
    const address = `${link.dataset.u}@${link.dataset.d}`;
    link.href = `mailto:${address}`;
    if (link.dataset.reveal === 'text') link.textContent = address;
  });
}
