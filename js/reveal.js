/* Reveal: fades in each .reveal element when it comes into view for
   the first time. If the browser has no IntersectionObserver, or if the
   visitor asks for reduced motion, the module shows all the elements
   together. */

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
