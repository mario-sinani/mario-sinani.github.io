/* Reveal: fades `.reveal` elements in the first time they scroll into view.
   Everything is shown immediately when IntersectionObserver is missing or
   the visitor prefers reduced motion. */

export function initReveal() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window) || reducedMotion) {
    targets.forEach((el) => el.classList.add('in'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  targets.forEach((el) => observer.observe(el));
}
