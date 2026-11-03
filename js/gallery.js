/* Continuous grooming gallery, with automatic scrolling and reduced-motion support. */
(function () {
  'use strict';

  document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
    var track = gallery.querySelector('.grooming-gallery__track');
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var originals = Array.from(track.children);
    var lastTime = 0, position = 0, loopWidth = 0;

    // A second copy allows the last photo to flow naturally into the first.
    // Copies are decorative; assistive technology still reads nine photos.
    originals.forEach(function (slide) {
      var copy = slide.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      copy.querySelector('img').alt = '';
      copy.querySelector('img').removeAttribute('fetchpriority');
      track.appendChild(copy);
    });

    function measure() {
      loopWidth = track.children[originals.length].offsetLeft - originals[0].offsetLeft;
      position = track.scrollLeft;
    }

    function preferences() {
      track.classList.toggle('is-autoscrolling', !motion.matches);
      position = track.scrollLeft;
      lastTime = 0;
    }

    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);
    else window.addEventListener('resize', measure);
    motion.addEventListener('change', preferences);
    measure();
    preferences();

    function animate(time) {
      var elapsed = lastTime ? Math.min(time - lastTime, 50) : 0;
      lastTime = time;
      if (!motion.matches && loopWidth > 0) {
        position = (position + elapsed * 0.060) % loopWidth;
        track.scrollLeft = position;
      } else {
        position = track.scrollLeft;
      }
      window.requestAnimationFrame(animate);
    }
    window.requestAnimationFrame(animate);
  });
})();
