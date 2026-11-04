/* Birdhouse Dog Co. — shared page behaviour: intro reveal, mobile nav, hero word swap, contact form. */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Logo loading screen ----------
     Every page loads under a blue overlay with the logo, which irises open once the page is ready.
     Clicking an internal link closes the iris over the current page first, so moving between pages
     feels like one continuous transition (the next page then opens it again). */
  var root = document.documentElement;
  var EASE = 'cubic-bezier(.7,0,.25,1)';
  var intro = document.getElementById('bh-intro');
  if (root.classList.contains('bh-intro-pending') && intro) {
    var logo = intro.querySelector('img');
    var t0 = Date.now();
    var revealed = false;
    var reveal = function () {
      if (revealed) return;
      revealed = true;
      var delay = Math.max(0, 350 - (Date.now() - t0));
      setTimeout(function () {
        if (reduce) {
          intro.style.transition = 'opacity .25s';
          intro.style.opacity = '0';
        } else {
          if (logo) {
            logo.style.transition = 'transform .5s ' + EASE + ', opacity .35s ease .15s';
            logo.style.transform = 'scale(0)';
            logo.style.opacity = '0';
          }
          intro.style.transition = 'clip-path .6s ' + EASE;
          intro.style.clipPath = 'circle(0% at 50% 50%)';
        }
        setTimeout(function () { intro.remove(); root.classList.remove('bh-intro-pending'); }, reduce ? 260 : 620);
      }, delay);
    };
    if (document.readyState === 'complete') reveal();
    else window.addEventListener('load', reveal);
    setTimeout(reveal, 2500);
  } else {
    root.classList.remove('bh-intro-pending');
  }

  // Cover the page before leaving it for another page on this site.
  var leaving = false;
  document.addEventListener('click', function (e) {
    if (leaving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page (anchors)
    if (!/^https?:$/.test(url.protocol)) return;
    e.preventDefault();
    leaving = true;
    var cover = document.createElement('div');
    cover.id = 'bh-intro';
    cover.setAttribute('aria-hidden', 'true');
    cover.style.display = 'flex';
    cover.style.pointerEvents = 'auto';
    var img = document.createElement('img');
    img.src = '/img/logo-brand.jpg'; img.alt = ''; img.width = 440; img.height = 287;
    cover.appendChild(img);
    if (reduce) {
      cover.style.opacity = '0';
      cover.style.transition = 'opacity .2s';
    } else {
      cover.style.clipPath = 'circle(0% at 50% 50%)';
      cover.style.transition = 'clip-path .45s ' + EASE;
      img.style.transform = 'scale(0)';
      img.style.opacity = '0';
      img.style.transition = 'transform .45s ' + EASE + ' .08s, opacity .25s ease .08s';
    }
    document.body.appendChild(cover);
    setTimeout(function () {
      if (reduce) { cover.style.opacity = '1'; }
      else { cover.style.clipPath = 'circle(150% at 50% 50%)'; img.style.transform = 'scale(1)'; img.style.opacity = '1'; }
    }, 20);
    setTimeout(function () { location.href = url.href; }, reduce ? 230 : 480);
  });
  // Coming back via the browser's back/forward cache: make sure no cover is left over.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      leaving = false;
      var c = document.getElementById('bh-intro'); if (c) c.remove();
      root.classList.remove('bh-intro-pending');
    }
  });

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector('.nav__toggle');
  var menu = document.querySelector('.nav__menu');
  if (toggle && menu) {
    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('is-open', open);
    }
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('is-open')) return;
      if (menu.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 820) setOpen(false);
    });
  }

  /* ---------- Hero word swap ---------- */
  var swap = document.querySelector('.swap-word');
  if (swap && !reduce) {
    var words = [
      { word: 'shine', color: '#ABA53F' },
      { word: 'grow', color: '#005F8F' },
      { word: 'thrive', color: '#FFCF70' }
    ];
    var i = 0;
    setInterval(function () {
      i = (i + 1) % words.length;
      swap.textContent = words[i].word;
      swap.style.color = words[i].color;
    }, 2600);
  }
})();

/* Shared lead sender used by the booking wizard. */
window.BH = window.BH || {};
window.BH.sendLead = function (payload) {
  payload = Object.assign({ page: location.pathname, submittedAt: new Date().toISOString() }, payload);
  return fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (res) {
    if (!res.ok) throw new Error('Lead request failed: ' + res.status);
    return res.json().catch(function () { return {}; });
  });
};
