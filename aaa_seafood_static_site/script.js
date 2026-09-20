// AAA International Seafood — subtle scroll-reveal for section entrances
document.addEventListener('DOMContentLoaded', function () {
  var targets = document.querySelectorAll('main section, body > section');

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  targets.forEach(function (el) { el.classList.add('reveal'); });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -60px 0px' });

  targets.forEach(function (el) { observer.observe(el); });
});

// Header shadow once the page has scrolled
document.addEventListener('DOMContentLoaded', function () {
  var header = document.querySelector('header.site-header');
  if (!header) return;
  var onScroll = function () {
    header.classList.toggle('scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});

// Hero stat count-up
document.addEventListener('DOMContentLoaded', function () {
  var statEls = document.querySelectorAll('.stat-num');
  if (!statEls.length) return;

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) return;
    var duration = 1100;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }

  var statObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0 });

  statEls.forEach(function (el) { statObserver.observe(el); });
});

// Contact form — posts to our Google Form's backend via a hidden iframe so
// the page keeps its own look instead of showing Google's embedded styling.
// Responses still land in the same Google Form / spreadsheet as before.
document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('contact-form');
  var iframe = document.getElementById('hidden_iframe');
  var note = document.getElementById('cf-note');
  if (!form || !iframe || !note) return;

  var submitted = false;

  form.addEventListener('submit', function () {
    submitted = true;
    note.textContent = '';
    note.classList.remove('success');
  });

  iframe.addEventListener('load', function () {
    if (!submitted) return; // ignore the iframe's initial blank load on page load
    submitted = false;
    note.textContent = "Thanks — your message is on its way. We'll be in touch shortly.";
    note.classList.add('success');
    form.reset();
  });
});
