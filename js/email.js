/* Email: makes the mailto links at run time. The HTML never has the
   full user@domain string, and a program that collects addresses cannot
   read it. Each link keeps the address in the data-u and data-d
   attributes. If no script runs, the [at] and [dot] text stays on the
   page. */

export function initEmail() {
  document.querySelectorAll('a[data-u][data-d]').forEach((link) => {
    const address = `${link.dataset.u}@${link.dataset.d}`;
    link.href = `mailto:${address}`;
    if (link.dataset.reveal === 'text') link.textContent = address;
  });
}
