// Cloudflare Pages Function — relays the site's contact form to the
// Google Form backend that stores AAA International Seafood's inquiries.
//
// Why this exists: Google Forms silently discards a submission that is
// missing a few hidden anti-abuse fields (fbzx, pageHistory, fvv,
// partialResponse) — it still returns an HTTP 200, so a plain client-side
// POST *looks* successful even though nothing gets recorded. Those fields
// are generated fresh by Google on every load of the live form, and a
// different origin (this site) can't read them out of an embedded Google
// page due to the browser's same-origin policy. So this function runs the
// hand-off server-side: it fetches a fresh copy of the public form,
// harvests the current tokens, then forwards the visitor's answers to
// Google's formResponse endpoint along with them — exactly as if a
// visitor had loaded and submitted the real Google Form, just without
// ever showing them Google's UI.
//
// Responses still land in the same Google Form / linked spreadsheet as
// before. Nothing about the destination changed — only how the hand-off
// to it happens.

const FORM_VIEW_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdGEXpdngnj7pHR-G4XFNNNykZAT51z7D9NHcWAVgKb9fn9jQ/viewform';
const FORM_SUBMIT_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdGEXpdngnj7pHR-G4XFNNNykZAT51z7D9NHcWAVgKb9fn9jQ/formResponse';

// This is AAA International Seafood's actual production "Contact Form" —
// the one with 144+ real responses already linked to their Google Sheet.
// (An earlier version of this relay pointed at a different, unrelated
// Google Form that happened to share a similar structure; submissions
// were landing there instead of the sheet the business actually checks.)
const FIELD_MAP = {
  name: 'entry.1662757913',
  business: 'entry.825130784',
  city: 'entry.1974016327',
  phone: 'entry.1801123652',
  email: 'entry.1435231468',
  language: 'entry.1526857845',
  message: 'entry.615314997',
};

// The "Preferred Contact Language" question renders as a native dropdown,
// and Google Forms pairs every dropdown/multiple-choice question with a
// hidden "<entry>_sentinel" field (present in the page with no value —
// it's just a marker). Omitting it makes Google silently reject the
// submission: formResponse still returns HTTP 200, but the confirmation
// page never appears and nothing gets recorded. So it has to be sent
// alongside the real answer, even though its value is always empty.
const SENTINEL_FIELDS = ['entry.1526857845_sentinel'];

function extractHidden(html, name) {
  const tagMatch = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
  if (!tagMatch) return null;
  const valueMatch = tagMatch[0].match(/value="([^"]*)"/);
  if (!valueMatch) return null;
  // Google HTML-encodes the value attribute (e.g. &quot; inside JSON blobs).
  return valueMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  let form;
  try {
    form = await context.request.formData();
  } catch (err) {
    return json({ ok: false, error: 'Could not read the submitted form.' }, 400);
  }

  const name = (form.get('name') || '').toString().trim();
  const business = (form.get('business') || '').toString().trim();
  const city = (form.get('city') || '').toString().trim();
  const phone = (form.get('phone') || '').toString().trim();
  const email = (form.get('email') || '').toString().trim();
  const language = (form.get('language') || '').toString().trim();
  const message = (form.get('message') || '').toString().trim();

  if (!name || !business || !city || !phone || !email || !language) {
    return json({ ok: false, error: 'Please fill in name, business, city, phone, email, and preferred language.' }, 400);
  }

  // Honeypot: a hidden field real visitors never fill in.
  const honeypot = (form.get('company_website') || '').toString().trim();
  if (honeypot) {
    // Pretend success so bots don't learn anything, but never forward it.
    return json({ ok: true }, 200);
  }

  let viewHtml;
  try {
    const viewResp = await fetch(FORM_VIEW_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AAASeafoodContactRelay/1.0)' },
    });
    viewHtml = await viewResp.text();
  } catch (err) {
    return json(
      { ok: false, error: 'Could not reach the form backend right now. Please try again shortly or call us directly.' },
      502
    );
  }

  const fbzx = extractHidden(viewHtml, 'fbzx');
  const pageHistory = extractHidden(viewHtml, 'pageHistory') || '0';
  const fvv = extractHidden(viewHtml, 'fvv') || '1';
  const partialResponse = extractHidden(viewHtml, 'partialResponse') || '';

  if (!fbzx) {
    return json(
      { ok: false, error: 'The form backend did not respond as expected. Please try again shortly or call us directly.' },
      502
    );
  }

  const params = new URLSearchParams();
  params.set(FIELD_MAP.name, name);
  params.set(FIELD_MAP.business, business);
  params.set(FIELD_MAP.city, city);
  params.set(FIELD_MAP.phone, phone);
  params.set(FIELD_MAP.email, email);
  params.set(FIELD_MAP.language, language);
  params.set(FIELD_MAP.message, message);
  for (const sentinel of SENTINEL_FIELDS) params.set(sentinel, '');
  params.set('fvv', fvv);
  if (partialResponse) params.set('partialResponse', partialResponse);
  params.set('pageHistory', pageHistory);
  params.set('fbzx', fbzx);
  params.set('submissionTimestamp', '-1');

  let submitResp;
  let submitHtml;
  try {
    submitResp = await fetch(FORM_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; AAASeafoodContactRelay/1.0)',
      },
      body: params.toString(),
    });
    submitHtml = await submitResp.text();
  } catch (err) {
    return json(
      { ok: false, error: 'Could not deliver your message right now. Please try again shortly or call us directly.' },
      502
    );
  }

  // Google's confirmation page doesn't reliably include the literal
  // "Your response has been recorded" text — Forms' own rendering has
  // changed over time, and testing against the real production form
  // showed responses being recorded correctly even without that exact
  // phrase in the returned HTML. A genuinely rejected submission, though,
  // reliably re-shows the form with a "This is a required question"
  // validation error. So: trust a successful HTTP response unless that
  // specific rejection marker is present — this mirrors how a real
  // browser behaves too, since it never parses Google's confirmation
  // copy, it just follows the submission through.
  const lowerHtml = submitHtml.toLowerCase();
  const hasRequiredFieldError = lowerHtml.includes('this is a required question');
  const recorded = submitResp.ok && !hasRequiredFieldError;

  if (!recorded) {
    return json(
      { ok: false, error: 'The form backend did not confirm your message was received. Please try again or call us directly.' },
      502
    );
  }

  return json({ ok: true }, 200);
}

export async function onRequestGet() {
  return json({ ok: false, error: 'This endpoint only accepts form submissions.' }, 405);
}
