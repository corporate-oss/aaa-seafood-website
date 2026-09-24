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

// Hero still image: zooms in as you scroll down past the hero, and back
// out as you scroll up. Progress runs 0 → 1 over the hero's own height.
document.addEventListener('DOMContentLoaded', function () {
  var hero = document.querySelector('.hero');
  var bg = hero && hero.querySelector('.hero-bg');
  if (!bg) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var MAX_EXTRA_ZOOM = 0.25; // scale goes from 1.00 up to 1.25
  var ticking = false;

  function update() {
    ticking = false;
    var height = hero.offsetHeight || 1;
    var progress = Math.min(Math.max(window.scrollY / height, 0), 1);
    bg.style.transform = 'scale(' + (1 + progress * MAX_EXTRA_ZOOM).toFixed(4) + ')';
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  update();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
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

// Contact form — submits to our own /api/contact function, which relays
// the message to our Google Form's backend server-side (see
// functions/api/contact.js for why: Google requires a few hidden tokens
// that only its own live page can generate, so the hand-off happens on
// the server instead of via a client-side iframe post). The page keeps
// its own look throughout; responses still land in the same Google Form
// / spreadsheet as before. Because this is a real fetch with a real
// response, a failed submission is reported honestly instead of assumed
// to have succeeded.
document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('contact-form');
  var note = document.getElementById('cf-note');
  if (!form || !note) return;

  var submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    note.textContent = 'Sending…';
    note.classList.remove('success', 'error');
    if (submitBtn) submitBtn.disabled = true;

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
    })
      .then(function (response) {
        return response.json().catch(function () { return { ok: false }; }).then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        if (result.data && result.data.ok) {
          note.textContent = "Thanks — your message is on its way. We'll be in touch shortly.";
          note.classList.add('success');
          form.reset();
        } else {
          var message = (result.data && result.data.error) ||
            "Something went wrong sending your message. Please try again or call us at 323-582-8003.";
          note.textContent = message;
          note.classList.add('error');
        }
      })
      .catch(function () {
        note.textContent = "Something went wrong sending your message. Please try again or call us at 323-582-8003.";
        note.classList.add('error');
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
});
