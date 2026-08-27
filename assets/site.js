/* Optimum Geomatics
   Scroll-scrubbed hero + the page motion system. Vanilla, no build step. */
(function () {
'use strict';

var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
var smoothstep = function (p, e0, e1) {
  var t = clamp((p - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function rng(seed) {
  var s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ------------------------------------------------------------------ *
 * the fixed background environment: graticule + whisper motes
 * ------------------------------------------------------------------ */
(function environment() {
  var g = document.querySelector('.grat-lines');
  if (g) {
    var d = '';
    for (var x = 0; x <= 1200; x += 75) d += 'M' + x + ' 0V800';
    for (var y = 0; y <= 800; y += 75) d += 'M0 ' + y + 'H1200';
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    g.appendChild(p);
  }
  var host = document.querySelector('.motes');
  if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var r = rng(20260819), frag = document.createDocumentFragment();
  for (var i = 0; i < 26; i++) {
    var m = document.createElement('span');
    m.className = 'mote';
    m.style.left = (r() * 100).toFixed(2) + '%';
    m.style.top = (r() * 100).toFixed(2) + '%';
    m.style.animationDuration = (13 + r() * 16).toFixed(1) + 's';
    m.style.animationDelay = '-' + (r() * 20).toFixed(1) + 's';
    frag.appendChild(m);
  }
  host.appendChild(frag);
})();

/* ------------------------------------------------------------------ *
 * split text, once at load, with a seeded generator so it never jitters
 * ------------------------------------------------------------------ */
function splitAll() {
  var nodes = document.querySelectorAll('.split');
  Array.prototype.forEach.call(nodes, function (el, ni) {
    var text = el.textContent.trim();
    var mode = el.closest('[data-entrance]');
    mode = mode ? mode.getAttribute('data-entrance') : 'rise';
    el.setAttribute("aria-label", text);

    if (mode === 'blur') {
      var vis = document.createElement('span');
      vis.className = 'vis';
      vis.setAttribute('aria-hidden', 'true');
      var soft = document.createElement('span');
      soft.className = 'soft';
      soft.textContent = text;
      var sharp = document.createElement('span');
      sharp.className = 'sharp';
      sharp.textContent = text;
      vis.appendChild(soft);
      vis.appendChild(sharp);
      el.textContent = '';
      el.appendChild(vis);
      return;
    }

    var r = rng(9001 + ni * 977);
    var words = text.split(' ');
    var wrap = document.createElement('span');
    wrap.setAttribute('aria-hidden', 'true');
    words.forEach(function (w, i) {
      var span = document.createElement('span');
      span.className = 'w';
      span.textContent = w + (i < words.length - 1 ? ' ' : '');
      var th = (i / Math.max(1, words.length)) * 0.5 + r() * 0.06;
      span.style.setProperty('--th', th.toFixed(3));
      if (mode === 'part') {
        var half = i < words.length / 2 ? -1 : 1;
        span.style.setProperty('--jx', (half * (28 + r() * 26)).toFixed(0) + 'px');
      }
      wrap.appendChild(span);
    });
    el.textContent = '';
    el.appendChild(wrap);
  });
}
splitAll();

/* ------------------------------------------------------------------ *
 * the scrub hero
 * ------------------------------------------------------------------ */
var VIDEO_URL = 'assets/hero-scrub.mp4';
var VIDEO_BYTES = 2365589;
var POSTER_URL = 'assets/hero-poster.jpg';

var hero = document.querySelector('.hero');
var stage = document.querySelector('.stage');
var video = document.getElementById('hero-video');
var ring = document.querySelector('.ring');
var posterLayer = document.querySelector('.poster');
var reticle = document.querySelector('.reticle');
var hud = document.querySelector('.hud');
var hudLat = document.querySelector('.hud-lat');
var hudLon = document.querySelector('.hud-lon');
var hudAlt = document.querySelector('.hud-alt');

var bands = Array.prototype.map.call(document.querySelectorAll('.band'), function (el) {
  return {
    el: el,
    a: parseFloat(el.getAttribute('data-a')),
    b: parseFloat(el.getAttribute('data-b')),
    ramp: parseFloat(el.getAttribute('data-ramp')) || 0,
    op: -1, k: -1
  };
});

var target = 0, shown = 0, rafId = null, lastTick = 0;
var heroOnScreen = true, scrubOn = false, videoOk = false;
var loadK = 0, loadStart = 0;

function heroProgress() {
  if (!hero) return 0;
  var range = hero.offsetHeight - window.innerHeight;
  if (range <= 0) return 0;
  return clamp((window.scrollY - hero.offsetTop) / range, 0, 1);
}

/* --- gated seeks, deadlock safe --- */
var seekBusy = false, pendingTime = null;
function requestSeek(t) {
  if (!video || !video.duration || !videoOk) return;
  if (seekBusy) { pendingTime = t; return; }
  seekBusy = true;
  try { video.currentTime = t; } catch (e) { seekBusy = false; }
}
if (video) {
  video.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingTime !== null) { var t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', function () { seekBusy = false; pendingTime = null; failVideo(); });
}

/* --- the lerp loop that rests --- */
function tick(now) {
  var dt = Math.min(100, now - (lastTick || now));
  lastTick = now;
  var k = 0.16;
  shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));

  if (loadStart && loadK < 1) {
    loadK = clamp((now - loadStart) / 900, 0, 1);
  }

  var settled = Math.abs(target - shown) < 0.0005 && loadK >= 1;
  if (settled) { shown = target; rafId = null; lastTick = 0; }
  else { rafId = requestAnimationFrame(tick); }

  requestSeek(shown * (video && video.duration ? video.duration : 6));
  updateHero(shown);
}
function kick() { if (rafId === null && heroOnScreen && scrubOn) { rafId = requestAnimationFrame(tick); } }
function onScroll() { target = heroProgress(); kick(); }

/* --- captions, reticle, HUD: delta-gated writes only --- */
var lastAlt = '', lastAltAt = 0;
function updateHero(p) {
  for (var i = 0; i < bands.length; i++) {
    var band = bands[i];
    var f = Math.min(0.02, (band.b - band.a) / 3);
    // the first band skips its ease-in and the last skips its ease-out,
    // so the journey starts and ends with the text already settled
    var easeIn = i === 0 ? 1 : smoothstep(p, band.a, band.a + f);
    var easeOut = i === bands.length - 1 ? 1 : 1 - smoothstep(p, band.b - f, band.b);
    var op = easeIn * easeOut;
    var ramp = band.ramp || Math.min(0.025, (band.b - band.a) * 0.35);
    var k = clamp((p - band.a) / ramp, 0, 1);
    if (i === 0) k = Math.max(k, loadK);

    if (Math.abs(op - band.op) > 0.004) { band.op = op; band.el.style.setProperty('--o', op.toFixed(3)); }
    if (Math.abs(k - band.k) > 0.008) {
      band.k = k;
      band.el.style.setProperty('--k', k.toFixed(3));
      if (i === bands.length - 1) {
        band.el.style.setProperty('--kk', clamp((k - 0.05) * 4, 0, 1).toFixed(3));
        band.el.style.setProperty('--ks', clamp((k - 0.5) * 3.2, 0, 1).toFixed(3));
        band.el.style.setProperty('--kb', clamp((k - 0.68) * 4, 0, 1).toFixed(3));
      }
    }
  }

  if (reticle) {
    // the reticle rides the descent, then locks onto the fire line
    // the reticle rides down, locks onto the fire, then clears out of the settle
    // headline's way: it was measuring 2.02:1 sitting behind the words
    var vis = Math.max(loadK * 0.9, smoothstep(p, 0.0, 0.06)) * (1 - smoothstep(p, 0.79, 0.93));
    var lock = smoothstep(p, 0.70, 0.84);
    reticle.style.setProperty('--ro', vis.toFixed(3));
    reticle.style.setProperty('--rx', (55 - 7 * smoothstep(p, 0, 1)).toFixed(2) + '%');
    reticle.style.setProperty('--ry', (88 - 14 * smoothstep(p, 0, 1)).toFixed(2) + '%');
    reticle.style.setProperty('--rs', (0.55 + 0.45 * smoothstep(p, 0.05, 0.86)).toFixed(3));
    reticle.style.setProperty('--rlock', lock.toFixed(3));
    if (hud) hud.style.setProperty('--ro', vis.toFixed(3));
  }

  var now = performance.now();
  if (hudAlt && now - lastAltAt > 100) {
    var alt = Math.round(520 * (1 - smoothstep(p, 0.02, 0.72)));
    var s = alt > 0 ? alt + ' km' : 'ON STATION';
    if (s !== lastAlt) {
      lastAlt = s; lastAltAt = now;
      hudAlt.textContent = s;
      hudLat.textContent = (24.9 + p * 0.62).toFixed(4) + '° S';
      hudLon.textContent = (31.4 + p * 0.38).toFixed(4) + '° E';
    }
  }
}

/* --- the streamed blob, with the poster winning the bandwidth race --- */
var started = false;
function startBlobFetch() {
  if (started) return;
  started = true;
  loadHeroBlob().catch(failVideo);
}
function initHeroOnce() {
  if (initHeroOnce.done) return;
  initHeroOnce.done = true;
  if (posterLayer) posterLayer.style.backgroundImage = "url('" + POSTER_URL + "')";
  var img = new Image();
  img.onload = startBlobFetch;
  img.onerror = startBlobFetch;
  img.src = POSTER_URL;
  setTimeout(startBlobFetch, 4000);
  loadStart = performance.now();
}
function loadHeroBlob() {
  var ctrl = new AbortController();
  var watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
  return fetch(VIDEO_URL, { signal: ctrl.signal }).then(function (res) {
    if (!res.ok || !res.body) throw new Error('video ' + res.status);
    var total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    var reader = res.body.getReader();
    var chunks = [], got = 0, lastRing = 0;
    return (function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        clearTimeout(watchdog);
        watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
        chunks.push(r.value);
        got += r.value.length;
        var frac = Math.min(1, got / total);
        var now = performance.now();
        if (ring && (now - lastRing > 100 || frac === 1)) {
          lastRing = now;
          ring.style.setProperty('--ld', Math.round(126 * (1 - frac)));
        }
        return pump();
      });
    })().then(function () {
      clearTimeout(watchdog);
      if (ring) ring.style.setProperty('--ld', 0);
      video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
      video.load();
      video.addEventListener('canplay', function () {
        videoOk = true;
        stage.classList.add('video-ready');
        target = heroProgress();
        requestSeek(target * video.duration);
        kick();
      }, { once: true });
    });
  });
}
function failVideo() {
  if (!stage || stage.classList.contains('video-failed')) return;
  stage.classList.add('video-failed');
  if (ring && ring.parentNode) {
    var cue = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cue.setAttribute('viewBox', '0 0 24 24');
    cue.setAttribute('aria-hidden', 'true');
    cue.setAttribute('class', 'cue');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 8l7 7 7-7');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    cue.appendChild(path);
    ring.parentNode.replaceChild(cue, ring);
    ring = null;
  }
}

/* --- the five static-hero gates, decided live --- */
var GATES = [
  '(max-width: 720px)',
  '(orientation: portrait) and (max-width: 1024px)',
  '(orientation: portrait) and (pointer: coarse)',
  '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
  '(prefers-reduced-motion: reduce)'
];
function enableScrub() {
  if (scrubOn || !hero) return;
  scrubOn = true;
  initHeroOnce();
  window.addEventListener('scroll', onScroll, { passive: true });
  bands.forEach(function (b) { b.op = -1; b.k = -1; });
  unpinFinalStates();
  target = heroProgress();
  updateHero(target);
  onScroll();
}
function disableScrub() {
  if (!scrubOn) return;
  scrubOn = false;
  window.removeEventListener('scroll', onScroll);
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}
function applyHeroMode() {
  var off = GATES.some(function (q) { return matchMedia(q).matches; });
  if (off) disableScrub(); else enableScrub();
}
var MQLS = GATES.map(function (q) { return matchMedia(q); });
MQLS.forEach(function (m) {
  if (m.addEventListener) m.addEventListener('change', applyHeroMode);
  else if (m.addListener) m.addListener(applyHeroMode);
});

if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver(function (es) {
    heroOnScreen = es[0].isIntersecting;
    if (heroOnScreen) kick();
  }, { rootMargin: '10% 0px' }).observe(hero);
}

/* ------------------------------------------------------------------ *
 * page entrances
 * ------------------------------------------------------------------ */
var revealObs = null;
if ('IntersectionObserver' in window) {
  revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      revealObs.unobserve(e.target);
      window.setTimeout(function () { e.target.style.transitionDelay = '0ms'; }, 1200);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el, i) {
    var sibs = el.parentNode ? el.parentNode.children : [el];
    var idx = Array.prototype.indexOf.call(sibs, el);
    el.style.transitionDelay = Math.min(idx, 5) * 90 + 'ms';
    revealObs.observe(el);
  });
} else {
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) { el.classList.add('in'); });
}

/* the self-drawing alert chain line */
var chain = document.querySelector('.chain');
var chainLine = document.querySelector('.chain-line');
var chainTip = document.querySelector('.chain-tip');
var chainSteps = Array.prototype.slice.call(document.querySelectorAll('.chain-list li'));
var chainReduce = matchMedia("(prefers-reduced-motion: reduce)");
function drawChain() {
  if (!chain || !chainLine) return;
  /* pinToFinalStates only runs on a live change of the setting, never at load, so a
     visitor who arrives with reduced motion already on would still watch the line
     draw itself down the page. Pin it here instead: finished, and never animated. */
  if (chainReduce.matches) {
    chainLine.style.setProperty("--draw", "1");
    if (chainTip) chainTip.style.opacity = "0";
    for (var k = 0; k < chainSteps.length; k++) chainSteps[k].classList.add("lit");
    return;
  }
  var r = chain.getBoundingClientRect();
  var p = clamp((window.innerHeight * 0.8 - r.top) / (r.height * 0.75), 0, 1);
  chainLine.style.setProperty('--draw', p.toFixed(3));

  /* the drawn end, in px down the section */
  var head = p * r.height;
  if (chainTip) {
    chainTip.style.top = head.toFixed(1) + 'px';
    /* fade in as it leaves the top, out again as it lands */
    chainTip.style.opacity = (p > 0.02 && p < 0.98) ? '0.9' : '0';
  }
  for (var i = 0; i < chainSteps.length; i++) {
    var li = chainSteps[i];
    var lit = head >= (li.getBoundingClientRect().top + 8 - r.top);
    if (lit !== li.classList.contains('lit')) li.classList.toggle('lit', lit);
  }
}

/* counters, written only on change */
var counters = Array.prototype.map.call(document.querySelectorAll('[data-count]'), function (el) {
  return { el: el, to: parseFloat(el.getAttribute('data-count')), suffix: el.getAttribute('data-suffix') || '', last: '', run: false };
});
function runCounter(c) {
  if (c.run) return;
  c.run = true;
  var t0 = performance.now(), dur = 1100;
  (function step(now) {
    var p = clamp((now - t0) / dur, 0, 1);
    var eased = 1 - Math.pow(1 - p, 3);
    var s = Math.round(c.to * eased) + c.suffix;
    if (s !== c.last) { c.last = s; c.el.textContent = s; }
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
if ('IntersectionObserver' in window) {
  var cObs = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var c = counters.filter(function (x) { return x.el === e.target; })[0];
      if (c) runCounter(c);
      cObs.unobserve(e.target);
    });
  }, { threshold: 0.6 });
  counters.forEach(function (c) { cObs.observe(c.el); });
}

/* ------------------------------------------------------------------ *
 * reduced motion, honoured live, in both directions
 * ------------------------------------------------------------------ */
function pinToFinalStates() {
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
    el.classList.add('in');
    el.style.transitionDelay = '0ms';
  });
  if (chainLine) chainLine.style.setProperty('--draw', '1');
  chainSteps.forEach(function (li) { li.classList.add('lit'); });
  counters.forEach(function (c) {
    c.run = true;
    var s = c.to + c.suffix;
    if (s !== c.last) { c.last = s; c.el.textContent = s; }
  });
  document.body.classList.add('pinned');
}
function unpinFinalStates() {
  document.body.classList.remove('pinned');
  if (chainLine) { chainLine.style.removeProperty('--draw'); drawChain(); }
}
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
function onReducedMotion(e) {
  if (e.matches) { pinToFinalStates(); disableScrub(); }
  else { applyHeroMode(); drawChain(); }
}
if (rmq.addEventListener) rmq.addEventListener('change', onReducedMotion);
else if (rmq.addListener) rmq.addListener(onReducedMotion);

/* ------------------------------------------------------------------ *
 * nav, page scroll effects, tab pausing
 * ------------------------------------------------------------------ */
var nav = document.querySelector('.nav');
var lastSolid = null;
function onPageScroll() {
  drawChain();
  var solid = window.scrollY > window.innerHeight * 0.6;
  if (solid !== lastSolid) { lastSolid = solid; if (nav) nav.classList.toggle('solid', solid); }
}
window.addEventListener('scroll', onPageScroll, { passive: true });
window.addEventListener('resize', function () { onPageScroll(); if (scrubOn) onScroll(); }, { passive: true });
document.addEventListener('visibilitychange', function () {
  document.body.classList.toggle('paused', document.hidden);
});

/* ------------------------------------------------------------------ *
 * the form. Static site, so say plainly where a message goes.
 * ------------------------------------------------------------------ */
(function form() {
  var f = document.getElementById('demo-form');
  if (!f) return;
  var note = f.querySelector('.form-note');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!f.checkValidity()) { f.reportValidity(); return; }
    var d = new FormData(f);
    var body = [
      'Name: ' + (d.get('name') || ''),
      'Organisation: ' + (d.get('org') || ''),
      'Email: ' + (d.get('email') || ''),
      'Phone or WhatsApp: ' + (d.get('phone') || ''),
      'Protecting: ' + (d.get('protecting') || ''),
      'Hectares: ' + (d.get('hectares') || '')
    ].join('\n');
    window.location.href = 'mailto:devon@optimumgeomatics.co.za'
      + '?subject=' + encodeURIComponent('Live demo request: ' + (d.get('org') || d.get('name') || ''))
      + '&body=' + encodeURIComponent(body);
    if (note) note.textContent = 'Your email app is opening with the message ready. Press send and Devon will reply within one working day.';
  });
})();

var yr = document.getElementById('yr');
if (yr) yr.textContent = new Date().getFullYear();

applyHeroMode();
onPageScroll();
})();

/* Swap a customer's type lockup for their official logo the moment the file exists.
   Nothing 404s in the meantime, and the row looks deliberate either way. */
/* SMIL keeps running regardless of the motion setting, so stop it by hand. Paused at
   the first frame the orbits still read as a constellation, just a still one. */
(function orbitScene(){
  var svg = document.querySelector(".orbit-scene");
  if (!svg || !svg.pauseAnimations) return;
  var rm = matchMedia("(prefers-reduced-motion: reduce)");
  function apply(){ rm.matches ? svg.pauseAnimations() : svg.unpauseAnimations(); }
  apply();
  if (rm.addEventListener) rm.addEventListener("change", apply);
  else if (rm.addListener) rm.addListener(apply);
})();

/* The coverage band plays only while it is on screen, and never for anyone who has asked
   for less motion. With preload="none" in the markup, a visitor who never scrolls that far
   never downloads it at all, and the poster frame covers every case where it does not run. */
(function bandVideo(){
  var v = document.querySelector(".bleed video");
  if (!v || !("IntersectionObserver" in window)) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  /* Phones keep the poster. Half a megabyte of decoration is not worth it on the mobile
     data our customers are actually using in the field. Delete this line to play it there. */
  if (matchMedia("(max-width: 760px)").matches) return;
  new IntersectionObserver(function (entries) {
    Array.prototype.forEach.call(entries, function (e) {
      if (!e.isIntersecting) { v.pause(); return; }
      v.preload = "auto";
      var p = v.play();
      if (p && p.catch) p.catch(function () {});   /* autoplay refused: poster stays, no error */
    });
  }, { rootMargin: "200px 0px" }).observe(v);
})();

(function trustLogos(){
  Array.prototype.forEach.call(document.querySelectorAll('.trust-item[data-logo]'), function (li) {
    var src = li.getAttribute('data-logo');
    var probe = new Image();
    probe.onload = function () {
      var name = li.querySelector('.trust-name');
      var img = document.createElement('img');
      img.src = src;
      img.alt = name ? name.textContent : '';
      img.loading = 'lazy';
      li.replaceChild(img, name);
    };
    probe.src = src;
  });
})();
