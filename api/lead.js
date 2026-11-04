// Vercel serverless function: receives a booking or contact request from the site
// and forwards it to Zoho CRM as a Lead via Zoho's Web-to-Lead form endpoint.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   ZOHO_WEBFORM_XNQSJSDP   the hidden "xnQsjsdp" value from the Zoho webform embed code
//   ZOHO_WEBFORM_XMIWTLD    the hidden "xmIwtLD" value from the Zoho webform embed code
// Optional:
//   ZOHO_WEBFORM_URL        defaults to https://crm.zoho.com/crm/WebToLeadForm
//   ZOHO_WEBFORM_ACTIONTYPE defaults to TGVhZHM= (base64 "Leads")
//   ZOHO_FIELD_MAP          JSON object mapping site keys to Zoho webform input names, to override
//                           the defaults in FIELD_MAP below, e.g. {"dogName":"LEADCF1"}
//   LEAD_WEBHOOK_URL        optional extra URL that receives the raw JSON payload (Zapier, Make, Slack…)
//
// Zoho webform input names: standard fields use their label ("First Name", "Last Name", "Email", "Phone",
// "Lead Source", "Description"); custom fields are named LEADCFn. Read them from the webform's embed code
// (Setup → Developer Space → Webforms → the form → Get Code) and override with ZOHO_FIELD_MAP.

// Input names from the "Website Booking" webform in the Birdhouse Zoho CRM (Leads module,
// "Birdhouse Dog Co - Lead Layout"). If the form is rebuilt in Zoho, re-check these in its embed code.
const FIELD_MAP = {
  lastName: 'Last Name',          // shown as "Owner Full Name" in Zoho; we send the visitor's full name here
  email: 'Email',
  phone: 'Phone',
  leadSource: 'Lead Source',      // Google / Instagram / TikTok / Friend/Family Referral / Facebook / Other
  desiredServices: 'LEADCF9',     // Desired Services (multi-select): Grooming / Dog Training / Boarding / Event / Not sure yet
  dogName: 'LEADCF5',             // Dog Name
  breed: 'LEADCF3',               // Breed
  age: 'LEADCF1',                 // Age
  sex: 'LEADCF2',                 // Sex: Male / Female
  vaccination: 'LEADCF7',         // Vaccination Status: Up to Date / Partially Vaccinated / Unknown
  cpr: 'LEADCF6',                 // CPR Authorization: Yes / No
  spayed: 'LEADCF8',              // Spayed or Nuetered?: Yes / No
  allergies: 'LEADCF4',           // Allergies
  vetName: 'LEADCF10',            // Vet Clinic Name
  vetPhone: 'LEADCF11'            // Vet Clinic Phone
  // The layout has no First Name or Description field, so neither is sent.
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 50000) reject(new Error('Payload too large')); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function clean(v, max = 2000) {
  if (v == null) return '';
  if (Array.isArray(v)) v = v.join(', ');
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function cleanList(v, max = 60) {
  if (!Array.isArray(v)) v = v ? [v] : [];
  return v.map((x) => clean(x, max)).filter(Boolean);
}

function splitName(full) {
  const parts = clean(full, 120).split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: '', last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Anything that has no field of its own goes into the Lead's Description.
function describe(p) {
  const lines = [];
  const add = (label, v) => { const c = clean(v); if (c) lines.push(`${label}: ${c}`); };
  add('Request', p.service);
  add('Message', p.dogNotes);
  add('Submitted from', p.page);
  add('Submitted at', p.submittedAt);
  return lines.join('\n');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
  }

  let p;
  try { p = await readJson(req); } catch (e) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: 'Bad JSON' }));
  }

  // Honeypot: real visitors never fill the hidden "website" field.
  if (clean(p.website)) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  }

  // The wizard sends firstName/lastName; a single "yourName" is still accepted as a fallback.
  let first = clean(p.firstName, 60), last = clean(p.lastName, 60);
  if (!last) { const n = splitName(p.yourName); first = first || n.first; last = n.last; }
  const phone = clean(p.phone, 40);
  const email = clean(p.email, 120);
  if (!last || (!phone && !email)) {
    res.statusCode = 422;
    return res.end(JSON.stringify({ ok: false, error: 'Name and a phone or email are required' }));
  }

  const lead = {
    firstName: first,
    lastName: [first, last].filter(Boolean).join(' '), // Zoho's "Owner Full Name" is the Last Name field
    email,
    phone,
    leadSource: clean(p.leadSource, 60),
    description: describe(p),
    desiredServices: cleanList(p.desiredServices),
    dogName: clean(p.dogName, 100),
    breed: clean(p.breed, 100),
    age: clean(p.age, 40),
    sex: clean(p.sex, 20),
    spayed: clean(p.spayed, 10),
    vaccination: clean(p.vaccination, 40),
    allergies: clean(p.allergies, 500),
    vetName: clean(p.vetName, 120),
    vetPhone: clean(p.vetPhone, 40),
    cpr: clean(p.cpr, 10)
  };

  const results = {};

  // 1) Zoho Web-to-Lead
  const xnQsjsdp = process.env.ZOHO_WEBFORM_XNQSJSDP;
  const xmIwtLD = process.env.ZOHO_WEBFORM_XMIWTLD;
  if (xnQsjsdp && xmIwtLD) {
    let map = FIELD_MAP;
    try { if (process.env.ZOHO_FIELD_MAP) map = { ...FIELD_MAP, ...JSON.parse(process.env.ZOHO_FIELD_MAP) }; } catch (e) { /* keep defaults */ }
    const body = new URLSearchParams();
    body.set('xnQsjsdp', xnQsjsdp);
    body.set('xmIwtLD', xmIwtLD);
    body.set('actionType', process.env.ZOHO_WEBFORM_ACTIONTYPE || 'TGVhZHM=');
    body.set('returnURL', 'https://www.birdhousedogco.com/book');
    for (const [key, name] of Object.entries(map)) {
      const v = lead[key];
      if (!name || v === undefined || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => body.append(name, x)); // multi-select: repeated params, like a real form post
      else body.set(name, v);
    }
    body.set('aG9uZXlwb3Q', ''); // Zoho's own honeypot field must be present and empty
    try {
      const r = await fetch(process.env.ZOHO_WEBFORM_URL || 'https://crm.zoho.com/crm/WebToLeadForm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        redirect: 'manual'
      });
      // Zoho can return HTTP 200 for errors too. Check its submission result.
      if (r.status >= 300 && r.status < 400) {
        results.zoho = r.headers.get('location') === body.get('returnURL') ? 'sent' : 'unexpected redirect';
      } else if (r.ok) {
        let result;
        try { result = await r.json(); } catch (e) { /* unrecognized response */ }
        const acceptedActions = ['Splash Message', 'thankyou_page', 'redirect_url', 'parent_redirect'];
        const accepted = result && acceptedActions.includes(result.actionsubmit)
          && result.success !== false && result.success !== 'false'
          && result.invalidCaptcha !== true && result.invalidCaptcha !== 'true';
        results.zoho = accepted ? 'sent' : 'submission not accepted';
      } else {
        results.zoho = `http ${r.status}`;
      }
    } catch (e) {
      results.zoho = 'error: ' + e.message;
    }
  } else {
    results.zoho = 'not configured';
  }

  // 2) Optional webhook copy (Zapier / Make / Slack etc.)
  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      const r = await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, raw: p })
      });
      results.webhook = r.ok ? 'sent' : `http ${r.status}`;
    } catch (e) {
      results.webhook = 'error: ' + e.message;
    }
  }

  const delivered = Object.values(results).some((v) => v === 'sent');
  console.log('[lead]', JSON.stringify({ name: lead.lastName, service: p.service, results }));

  if (!delivered) {
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: 'No delivery channel succeeded', results }));
  }
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, results }));
};
