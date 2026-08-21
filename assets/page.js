/* Industry pages. The homepage's site.js drives a scroll-scrubbed video these
   pages do not have, so they get this instead: the entrance choreography and the
   tab-pause behaviour only. Small on purpose. */
(function () {
'use strict';

if ('IntersectionObserver' in window) {
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      obs.unobserve(e.target);
      // retire the stagger so later hovers are not delayed by it forever
      window.setTimeout(function () { e.target.style.transitionDelay = '0ms'; }, 1200);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
    var sibs = el.parentNode ? el.parentNode.children : [el];
    var idx = Array.prototype.indexOf.call(sibs, el);
    el.style.transitionDelay = Math.min(idx, 5) * 90 + 'ms';
    obs.observe(el);
  });
} else {
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
    el.classList.add('in');
  });
}

document.addEventListener('visibilitychange', function () {
  document.body.classList.toggle('paused', document.hidden);
});
})();
