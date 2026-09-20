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
  'https://docs.google.com/forms/d/e/1FAIpQLSdT587_Sx7lxzIseKCUeKNhGo-wHPHGZteja1P-BeuOgnUMOQ/viewform';
const FORM_SUBMIT_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdT587_Sx7lxzIseKCUeKNhGo-wHPHGZteja1P-BeuOgnUMOQ/formResponse';

const FIELD_MAP = {
  name: 'entry.1552618580',
  business: 'entry.1901319334',
  email: 'entry.753801335',
  phone: 'entry.825330940',
  message: 'entry.1503377513',
};

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
  const email = (form.get('email') || '').toString().trim();
  const phone = (form.get('phone') || '').toString().trim();
  const message = (form.get('message') || '').toString().trim();

  if (!name || !business || !email || !phone) {
    return json({ ok: false, error: 'Please fill in name, business, email, and phone.' }, 400);
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
  params.set(FIELD_MAP.email, email);
  params.set(FIELD_MAP.phone, phone);
  params.set(FIELD_MAP.message, message);
  params.set('fvv', fvv);
  if (partialResponse) params.set('partialResponse', partialResponse);
  params.set('pageHistory', pageHistory);
  params.set('fbzx', fbzx);
  params.set('submissionTimestamp', Date.now().toString());

  let submitHtml;
  try {
    const submitResp = await fetch(FORM_SUBMIT_URL, {
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

  const recorded = submitHtml.includes('Your response has been recorded');
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
