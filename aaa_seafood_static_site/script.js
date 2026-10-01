// AAA International Seafood — subtle scroll-reveal for section entrances
document.addEventListener('DOMContentLoaded', function () {
  var targets = document.querySelectorAll('main section, body > section');

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // A link straight to an item (e.g. /bluefin-tuna#bluefin-loin) lands on a
  // section that must already be in place: sliding it in would leave the
  // item under the sticky header.
  var landing = null;
  try { landing = window.location.hash ? document.querySelector(window.location.hash) : null; } catch (e) {}
  targets = Array.prototype.filter.call(targets, function (el) { return !(landing && el.contains(landing)); });

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

// Mobile menu button. Lives here rather than in an inline onclick so the
// site's Content-Security-Policy can forbid inline scripts entirely.
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});

// Products page: each category shows its first few products, with a
// "Show more" button that opens the rest in place. Without JavaScript the
// buttons stay hidden and every product simply shows.
document.addEventListener('DOMContentLoaded', function () {
  var VISIBLE = 4;
  var blocks = document.querySelectorAll('.category-block');
  Array.prototype.forEach.call(blocks, function (block) {
    var grid = block.querySelector('.product-grid');
    var wrap = block.querySelector('.show-all-wrap');
    var btn = wrap && wrap.querySelector('.show-all');
    if (!grid || !btn) return;
    var total = grid.querySelectorAll('.product-card').length;
    if (total <= VISIBLE) return;
    var noun = btn.getAttribute('data-noun') || 'products';

    function setOpen(open) {
      block.classList.toggle('is-collapsed', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Show fewer' : 'Show more';
      // Screen readers hear which list the button opens (the visible words
      // stay first so voice control still matches "Show more").
      btn.setAttribute('aria-label', (open ? 'Show fewer ' : 'Show more ') + noun);
    }

    // Remember an opened list for this visit, so coming back from a product
    // page shows the list the way the visitor left it.
    var key = 'aaa-open-' + (block.id || '');
    var remembered = false;
    try { remembered = sessionStorage.getItem(key) === '1'; } catch (e) {}
    setOpen(remembered);
    wrap.hidden = false;

    btn.addEventListener('click', function () {
      var opening = block.classList.contains('is-collapsed');
      setOpen(opening);
      try { if (opening) sessionStorage.setItem(key, '1'); else sessionStorage.removeItem(key); } catch (e) {}
      // After closing a long list, bring the category back into view if
      // the collapse left it above the top of the screen.
      if (!opening && block.getBoundingClientRect().top < 0) {
        block.scrollIntoView({ block: 'start' });
      }
    });
  });
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

  // If the image ever fails to load, hide it so no broken-image icon shows;
  // the hero's dark background keeps the headline readable.
  var hideBg = function () { bg.style.visibility = 'hidden'; };
  if (bg.complete && bg.naturalWidth === 0) hideBg();
  else bg.addEventListener('error', hideBg);

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
          note.textContent = "Thanks — your message is on its way. We'll reach out within 24 business hours.";
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

// Product pages: "Back to Products" buttons. When the visitor came from the
// Products page (or Home), going back returns them to the same spot they
// left; otherwise the button simply opens the Products page.
document.addEventListener('DOMContentLoaded', function () {
  var backs = document.querySelectorAll('[data-back]');
  if (!backs.length) return;
  var ref = null;
  try {
    if (document.referrer) {
      var u = new URL(document.referrer);
      if (u.origin === location.origin && (u.pathname === '/products' || u.pathname === '/products.html' || u.pathname === '/' || u.pathname === '/index.html')) ref = u;
    }
  } catch (e) { ref = null; }
  var fromHome = ref && (ref.pathname === '/' || ref.pathname === '/index.html');
  Array.prototype.forEach.call(backs, function (a) {
    if (fromHome) {
      a.setAttribute('href', '/');
      var label = a.querySelector('.back-label');
      if (label) label.textContent = 'Back to Home';
    }
    a.addEventListener('click', function (event) {
      if (ref && window.history.length > 1) { event.preventDefault(); window.history.back(); }
    });
  });

  var floatBtn = document.querySelector('.back-float');
  var topBtn = document.querySelector('.back-btn');
  var cta = document.querySelector('.cta-strip');
  if (!floatBtn || !topBtn || !('IntersectionObserver' in window)) return;
  var topVisible = true, ctaVisible = false;
  function update() { floatBtn.classList.toggle('show', !topVisible && !ctaVisible); }
  new IntersectionObserver(function (entries) { topVisible = entries[0].isIntersecting; update(); },
    { rootMargin: '-90px 0px 0px 0px' }).observe(topBtn);
  if (cta) new IntersectionObserver(function (entries) { ctaVisible = entries[0].isIntersecting; update(); }).observe(cta);
});

// Contact page: a product card with no page of its own (e.g. Frozen
// Hamachi) links here as /contact?product=<slug>; start the message for the
// visitor so the click lands somewhere useful. Only known products are used.
document.addEventListener('DOMContentLoaded', function () {
  var msg = document.getElementById('cf-message');
  if (!msg || msg.value) return;
  var names = { 'frozen-hamachi': 'Frozen Hamachi (Yellowtail)', 'tuna-cube': 'Tuna Cube', 'escolar-saku': 'Escolar Saku' };
  var slug = null;
  try { slug = new URLSearchParams(window.location.search).get('product'); } catch (e) {}
  var name = slug && Object.prototype.hasOwnProperty.call(names, slug) ? names[slug] : null;
  if (!name) return;
  msg.value = 'I’d like pricing on ' + name + '.';
  var interest = document.getElementById('cf-interest');
  if (interest && !interest.value) interest.value = 'Frozen products';
});

// Links straight to an item (/bluefin-tuna#bluefin-loin, /fresh-fish#kinmedai):
// the browser's own jump to the item can be cut short while the web fonts
// swap in, so once the page has settled make sure the item is on screen.
// Skipped as soon as the visitor scrolls or presses a key themselves.
(function () {
  var hash = window.location.hash;
  if (!hash || hash.length < 2) return;
  var moved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function () { moved = true; }, { passive: true, once: true });
  });
  function settle() {
    if (moved) return;
    var el = null;
    try { el = document.querySelector(hash); } catch (e) { return; }
    if (!el) return;
    var header = document.querySelector('header.site-header');
    var min = header ? header.getBoundingClientRect().bottom : 0;
    var top = el.getBoundingClientRect().top;
    if (top < min - 1 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  window.addEventListener('load', function () {
    settle();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(settle, 50); });
    setTimeout(settle, 800);
  });
})();
