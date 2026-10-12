// NUSARA STUDIO — interaksi ringan (tanpa framework)
(function () {
  'use strict';

  // Hamburger menu (mobile)
  var burger = document.getElementById('hamburger');
  var menu = document.getElementById('navMenu');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      menu.classList.toggle('open');
    });
    // Tutup menu saat salah satu link diklik
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('open');
      });
    });
  }

  // Bayangan navbar saat scroll
  var navbar = document.getElementById('navbar');
  function onScroll() {
    if (window.scrollY > 8) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Reveal saat scroll (fade-up)
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          revealObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  // Count-up statistik saat terlihat
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-target'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      // easing keluar
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var statEls = document.querySelectorAll('.stat-num');
  if ('IntersectionObserver' in window && statEls.length) {
    var statObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          countUp(e.target);
          statObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    statEls.forEach(function (el) { statObs.observe(el); });
  } else {
    statEls.forEach(countUp);
  }
})();
