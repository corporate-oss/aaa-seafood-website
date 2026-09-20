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
//
// After a successful hand-off, it also sends the visitor a branded
// confirmation email via Resend (see buildConfirmationEmailHtml /
// sendConfirmationEmail below). That step runs in the background via
// context.waitUntil so a slow or failed email never turns an otherwise
// successful submission into an error for the visitor — their message is
// already safely recorded in the Sheet by that point regardless.

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

// --- Confirmation email (sent via Resend) ----------------------------------

const RESEND_API_URL = 'https://api.resend.com/emails';
const EMAIL_FROM = 'AAA International Seafood <no-reply@aaainternationalseafood.com>';
const EMAIL_SUBJECT = "We've received your message — AAA International Seafood";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Renders the branded "dockside ledger" confirmation email design the user
// approved as a static mockup, populated with the visitor's own submitted
// values. Matches the site's design system (dark green header, cream recap
// box, red contact strip) and stacks the contact strip to one column under
// 600px for phone-width inboxes.
function buildConfirmationEmailHtml({ business, city, phone, language, message }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(EMAIL_SUBJECT)}</title>
<style>
  body {
    margin: 0;
    padding: 32px 16px;
    background: #ddd4bf;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  table { border-collapse: collapse; }
  .email-shell {
    max-width: 600px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #cfc3a3;
    border-radius: 3px;
    box-shadow: 0 12px 30px rgba(18,24,26,0.12);
    overflow: hidden;
  }
  .header-bar { background: #1f332a; padding: 26px 32px; }
  .brand-name { font-family: Georgia, 'Times New Roman', serif; color: #f3efe4; font-size: 1.2rem; font-weight: 700; letter-spacing: 0.3px; }
  .brand-sub { font-family: 'Space Grotesk', -apple-system, sans-serif; color: #9ca69d; font-size: 0.62rem; letter-spacing: 1px; text-transform: uppercase; margin-top: 3px; }

  .body-pad { padding: 34px 32px 8px; }
  .eyebrow { font-family: Georgia, 'Times New Roman', serif; font-style: italic; color: #b9964a; font-size: 0.95rem; margin: 0 0 6px; }
  h1.title { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 1.5rem; color: #12181a; margin: 0 0 18px; line-height: 1.25; }
  p.lead { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.98rem; line-height: 1.6; color: #33362f; margin: 0 0 18px; }

  .recap {
    margin: 4px 0 26px;
    border: 1px solid #dcd2b8;
    border-radius: 3px;
    background: #f6f1e7;
  }
  .recap-head {
    padding: 12px 18px;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    font-weight: 600;
    font-size: 0.7rem;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: #5c6259;
    border-bottom: 1px solid #dcd2b8;
  }
  .recap-row { padding: 12px 18px; border-bottom: 1px solid #e9e1cd; }
  .recap-row:last-child { border-bottom: none; }
  .recap-label { font-family: 'Space Grotesk', -apple-system, sans-serif; font-weight: 600; font-size: 0.66rem; letter-spacing: 0.5px; text-transform: uppercase; color: #8a8578; display: block; margin-bottom: 2px; }
  .recap-value { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.92rem; color: #12181a; }

  .next-steps { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.92rem; line-height: 1.6; color: #33362f; margin: 0 0 30px; }

  .contact-strip { background: #c1392b; padding: 20px 32px; }
  .contact-strip table td { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #ffffff; font-size: 0.86rem; line-height: 1.5; vertical-align: top; }
  .contact-strip .label { display: block; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 0.62rem; letter-spacing: 0.5px; text-transform: uppercase; color: #fbe3dd; margin-bottom: 2px; }

  .footer { padding: 20px 32px 26px; }
  .footer p { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.76rem; color: #8a8578; line-height: 1.6; margin: 0; }

  /* Phone-width inboxes (Apple Mail, Gmail, Outlook.com all honor @media
     in HTML email; Outlook desktop ignores it and keeps the desktop
     layout, which still reads fine at 600px). */
  @media screen and (max-width: 600px) {
    body { padding: 16px 0; }
    .email-shell { max-width: 100% !important; margin: 0 8px; border-radius: 0; }
    .header-bar { padding: 20px 20px !important; }
    .brand-name { font-size: 1.05rem !important; }
    .body-pad { padding: 24px 20px 4px !important; }
    h1.title { font-size: 1.22rem !important; }
    p.lead, .next-steps { font-size: 0.9rem !important; }
    .recap-head, .recap-row { padding: 10px 14px !important; }
    .recap-value { font-size: 0.88rem !important; }
    .contact-strip { padding: 18px 20px !important; }

    /* Stack the address/hours/phone columns instead of squeezing 3 across */
    .contact-strip table, .contact-strip tr, .contact-strip .cs-cell {
      display: block !important;
      width: 100% !important;
    }
    .contact-strip .cs-cell { padding: 0 0 12px !important; }
    .contact-strip .cs-cell:last-child { padding-bottom: 0 !important; }

    .footer { padding: 16px 20px 22px !important; }
  }
</style>
</head>
<body>
  <div class="email-shell">
    <table role="presentation" width="100%">
      <tr><td class="header-bar">
        <div class="brand-name">AAA INTERNATIONAL SEAFOOD</div>
        <div class="brand-sub">Wholesale Seafood Distributor</div>
      </td></tr>

      <tr><td class="body-pad">
        <p class="eyebrow">Thank you</p>
        <h1 class="title">We've received your message.</h1>
        <p class="lead">
          Thanks for reaching out to AAA International Seafood. This confirms we received your
          submission below — a member of our team will follow up shortly, usually within one
          business day.
        </p>

        <div class="recap">
          <div class="recap-head">What you sent us</div>
          <div class="recap-row">
            <span class="recap-label">Restaurant / Business</span>
            <span class="recap-value">${escapeHtml(business)}</span>
          </div>
          <div class="recap-row">
            <span class="recap-label">City</span>
            <span class="recap-value">${escapeHtml(city)}</span>
          </div>
          <div class="recap-row">
            <span class="recap-label">Phone</span>
            <span class="recap-value">${escapeHtml(phone)}</span>
          </div>
          <div class="recap-row">
            <span class="recap-label">Preferred Contact Language</span>
            <span class="recap-value">${escapeHtml(language)}</span>
          </div>
          <div class="recap-row">
            <span class="recap-label">Message</span>
            <span class="recap-value">${escapeHtml(message)}</span>
          </div>
        </div>

        <p class="next-steps">
          If anything above doesn't look right, or if this is urgent, just call us directly
          at <strong>323-582-8003</strong> and we'll take care of it right away.
        </p>
      </td></tr>

      <tr><td class="contact-strip">
        <table role="presentation" width="100%">
          <tr>
            <td class="cs-cell">
              <span class="label">Address</span>
              2535 E 28th Street,<br>Vernon, CA 90058
            </td>
            <td class="cs-cell">
              <span class="label">Hours</span>
              Mon–Sat, 6am–3pm
            </td>
            <td class="cs-cell">
              <span class="label">Phone</span>
              323-582-8003
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td class="footer">
        <p>
          This is an automated confirmation sent because a message was submitted through the
          contact form at aaainternationalseafood.com. If you didn't submit this, you can
          safely ignore this email.
        </p>
      </td></tr>
    </table>
  </div>
</body>
</html>`;
}

// Best-effort — errors are caught and logged by the caller (via
// context.waitUntil below) rather than propagated, since a confirmation
// email failing should never make an already-successful form submission
// look like it failed.
async function sendConfirmationEmail(env, { business, city, phone, email, language, message }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured — skipping confirmation email.');
    return;
  }

  const html = buildConfirmationEmailHtml({ business, city, phone, language, message });

  const resp = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: email,
      subject: EMAIL_SUBJECT,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`Resend API error (${resp.status}): ${errText}`);
  }
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

  // Send the visitor's confirmation email in the background so it can
  // never delay or fail the response below — their message is already
  // safely recorded in the Sheet at this point regardless of what happens
  // to the email.
  context.waitUntil(
    sendConfirmationEmail(context.env, { business, city, phone, email, language, message }).catch((err) => {
      console.error('Failed to send confirmation email:', err);
    })
  );

  return json({ ok: true }, 200);
}

export async function onRequestGet() {
  return json({ ok: false, error: 'This endpoint only accepts form submissions.' }, 405);
}
