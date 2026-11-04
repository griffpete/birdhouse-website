/* Training photos: the small photo grows into the large slot, the next photo slides in behind it,
   and the text card switches to the copy and color that go with the new large photo. */
(function () {
  'use strict';

  var FIRST = 3000;     // wait before the first change
  var HOLD = 5000;      // time each arrangement stays on screen
  var FLY = 1100;       // small photo growing into the large slot

  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function lerp(a, b, p) { return a + (b - a) * p; }

  // Runs fn(progress) once per frame and resolves when it reaches 1.
  function tween(duration, fn) {
    return new Promise(function (resolve) {
      var start = 0;
      function frame(now) {
        if (!start) start = now;
        var p = Math.min((now - start) / duration, 1);
        fn(ease(p));
        if (p < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  document.querySelectorAll('[data-rotator]').forEach(function (rotator) {
    var main = rotator.querySelector('[data-rotator-main]');
    var side = rotator.querySelector('[data-rotator-side]');
    var extra = rotator.querySelector('template[data-rotator-extra]');
    var card = rotator.querySelector('[data-rotator-card]');
    var copies = card ? Array.from(card.querySelectorAll('.rotator__copy')) : [];
    if (!main || !side || !extra) return;

    var photos = [main.querySelector('picture'), side.querySelector('picture')]
      .concat(Array.from(extra.content.querySelectorAll('picture')))
      .map(function (p) { return p.cloneNode(true); });
    if (photos.length < 3) return;

    var mainSizes = main.querySelector('img').getAttribute('sizes');
    var sideSizes = side.querySelector('img').getAttribute('sizes');
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var stacked = window.matchMedia('(max-width: 760px)');
    var sideIndex = 1, visible = false, busy = false, timer = 0, started = false;

    function picture(index, sizes) {
      var p = photos[index].cloneNode(true);
      p.querySelectorAll('source, img').forEach(function (el) { el.setAttribute('sizes', sizes); });
      var img = p.querySelector('img');
      img.removeAttribute('loading');
      img.removeAttribute('fetchpriority');
      return p;
    }

    function decoded(p) {
      var img = p.querySelector('img');
      var ready = img.decode ? img.decode() : Promise.resolve();
      return ready.catch(function () {}).then(function () { return p; });
    }

    // Adds a hidden layer on top of a slot and resolves once its image can paint.
    function layer(slot, index, sizes) {
      var p = picture(index, sizes);
      p.classList.add('rotator__layer');
      p.style.opacity = '0';
      slot.appendChild(p);
      return decoded(p);
    }

    // A copy of the large slot (shadow, ink border, photo) that is moved with a transform and
    // trimmed with clip-path, so the photo is painted once instead of resized every frame.
    function flyer(index) {
      var el = document.createElement('div');
      el.className = 'rotator__flyer';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="rotator__flyer-shadow"></div><div class="rotator__flyer-frame"></div><div class="rotator__flyer-photo"></div>';
      var p = picture(index, mainSizes);
      p.querySelector('img').alt = '';
      el.lastChild.appendChild(p);
      el.style.visibility = 'hidden';
      rotator.appendChild(el);
      return decoded(p).then(function () { return el; });
    }

    function settle(slot, p) {
      Array.from(slot.querySelectorAll('picture')).forEach(function (old) { if (old !== p) old.remove(); });
      p.classList.remove('rotator__layer');
      p.style.opacity = '';
    }

    function box(el) {
      var r = el.getBoundingClientRect(), o = rotator.getBoundingClientRect();
      return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
    }

    // Where an object-fit: cover image sits inside a w x h box.
    function cover(img, w, h) {
      var pos = getComputedStyle(img).objectPosition.split(' ').map(function (v) { return parseFloat(v) / 100; });
      var k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      return { x: (w - img.naturalWidth * k) * pos[0], y: (h - img.naturalHeight * k) * (pos[1] === undefined ? 0.5 : pos[1]), w: img.naturalWidth * k };
    }

    // Grows the flyer from the small slot to the large one. At the start it shows exactly
    // what the small slot shows; at the end it matches the large slot pixel for pixel.
    function fly(el) {
      var a = box(side), b = box(main);
      var css = getComputedStyle(main);
      var bw = parseFloat(css.borderTopWidth) || 0, radius = parseFloat(css.borderTopLeftRadius) || 0;
      var img = el.querySelector('img');
      var big = cover(img, b.w - 2 * bw, b.h - 2 * bw), small = cover(img, a.w - 2 * bw, a.h - 2 * bw);
      var s0 = small.w / big.w;
      var dx0 = a.x + bw + small.x - b.x - s0 * (bw + big.x);
      var dy0 = a.y + bw + small.y - b.y - s0 * (bw + big.y);
      var layers = Array.from(el.children);
      Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });

      function draw(p) {
        var s = lerp(s0, 1, p), dx = lerp(dx0, 0, p), dy = lerp(dy0, 0, p);
        var left = (lerp(a.x, b.x, p) - b.x - dx) / s, top = (lerp(a.y, b.y, p) - b.y - dy) / s;
        var right = b.w - left - lerp(a.w, b.w, p) / s, bottom = b.h - top - lerp(a.h, b.h, p) / s;
        var inset = 'inset(' + top + 'px ' + right + 'px ' + bottom + 'px ' + left + 'px round ';
        el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + s + ')';
        layers[0].style.clipPath = layers[1].style.clipPath = inset + radius / s + 'px)';
        layers[2].style.clipPath = inset + Math.max(0, radius / s - bw) + 'px)';
      }
      draw(0);
      el.style.visibility = '';
      return tween(FLY, draw);
    }

    // Copy i goes with photo i; data-color names the card--* class to use.
    function showCopy(index) {
      if (!copies[index]) return;
      copies.forEach(function (copy, i) {
        copy.classList.toggle('is-active', i === index);
        card.classList.toggle('card--' + copy.dataset.color, i === index);
      });
    }

    function finished(animation) {
      return animation.finished.catch(function () {});
    }

    function step() {
      busy = true;
      var mainIndex = sideIndex;
      var nextSide = (sideIndex + 1) % photos.length;
      var oldMain = main.querySelector('picture');
      var oldSide = side.querySelector('picture');
      var desktop = !stacked.matches;

      Promise.all([
        layer(main, mainIndex, mainSizes),
        layer(side, nextSide, sideSizes),
        desktop ? flyer(mainIndex) : null
      ]).then(function (ready) {
        var newMain = ready[0], newSide = ready[1], el = ready[2];
        var work = [];
        showCopy(mainIndex);

        // The next small photo slides and fades in. It starts a little zoomed so no gap shows.
        newSide.style.opacity = '';
        work.push(finished(newSide.animate([
          { opacity: 0, transform: 'translateY(14px) scale(1.08)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 900, delay: desktop ? 120 : 200, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'backwards' })));

        if (!desktop) {
          // On phones the two photos are far apart, so the large photo cross-fades in place.
          newMain.style.opacity = '';
          work.push(finished(newMain.animate([
            { opacity: 0, transform: 'scale(1.06)' },
            { opacity: 1, transform: 'none' }
          ], { duration: 1200, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'backwards' })));
        } else {
          // The small photo lifts out of its slot and grows into the large one.
          oldSide.remove();
          oldMain.animate([
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'scale(1.04)' }
          ], { duration: FLY * 0.9, easing: 'ease-in-out', fill: 'forwards' });
          work.push(fly(el).then(function () {
            // The flyer now matches the large slot exactly, so swapping them is invisible.
            newMain.style.opacity = '';
            return new Promise(requestAnimationFrame);
          }).then(function () { el.remove(); }));
        }

        return Promise.all(work).then(function () {
          settle(main, newMain);
          settle(side, newSide);
          sideIndex = nextSide;
        });
      }).then(done, done);
    }

    function done() {
      busy = false;
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (busy || !visible || document.hidden || motion.matches) return;
      timer = setTimeout(step, started ? HOLD : FIRST);
      started = true;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.2 }).observe(rotator);
    } else {
      visible = true;
      schedule();
    }
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', schedule);
  });
})();
