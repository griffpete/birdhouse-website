# Birdhouse Dog Co. website

Static site for Birdhouse Dog Co. (dog grooming and training in Ivins, Utah), hosted on Vercel.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `grooming.html`, `training.html`, `about.html`, `book.html` | The five pages. Vercel serves them at `/`, `/grooming`, `/training`, `/about`, `/book` (clean URLs). |
| `css/site.css` | All styles. Colors and type live at the top as CSS variables. |
| `js/site.js` | Intro reveal, mobile menu, hero word swap, home-page contact form. |
| `js/book.js` | The booking wizard (grooming / training / both). Step content is the `SERVICES` object at the top. |
| `api/lead.js` | Vercel serverless function. Receives a booking or message and forwards it to Zoho CRM as a Lead. |
| `img/` | Optimized photos (jpg + webp, 900 and 1600 px). Originals stay in `assets/` and are not deployed. |
| `fonts/` | Archivo and Bagel Fat One (latin subsets). |
| `vercel.json` | Clean URLs, domain redirects, cache headers. |
| `design-export/` | The original Claude Design export, kept for reference. Not deployed. |

## Run it locally

```bash
npm run dev
```

Opens on http://localhost:4321 with clean URLs and the `/api/lead` function. In this mode leads are printed to the terminal instead of going to Zoho.

## Zoho CRM hookup

The site never talks to Zoho from the browser. The wizard and contact form POST JSON to `/api/lead`, and that function posts to the Zoho **Web-to-Lead** form named **Website Booking** (Birdhouse Zoho CRM → Setup → Channels → Webforms, Leads module, "Birdhouse Dog Co - Lead Layout"). Each wizard answer lands in its own Lead field; the field names are in `api/lead.js`.

**Vercel setup (one time):** Project → Settings → Environment Variables, add these for Production (and Preview if you want test deploys to send real leads):

| Name | Value |
| --- | --- |
| `ZOHO_WEBFORM_XNQSJSDP` | the `xnQsjsdp` value from the webform's embed code (also in `.env.local` on Griffin's machine) |
| `ZOHO_WEBFORM_XMIWTLD` | the `xmIwtLD` value from the same embed code |

Then redeploy. To get the values again later: Zoho → Setup → Webforms → Website Booking → Get Code, and copy the two hidden inputs.

Optional extras: `LEAD_WEBHOOK_URL` also sends every lead as JSON to a Zapier/Make/Slack webhook as a backup. `ZOHO_FIELD_MAP` (JSON) overrides field names if the Zoho form is rebuilt.

**Local testing:** `npm run dev` runs in fake mode (leads print to the terminal). `npm run dev:real` reads `.env.local` and sends real leads to Zoho.

Notes: the Lead layout has no Description field, so the home-page contact form's free-text message is not stored in Zoho yet (add Description to the layout and to the webform if you want it). Zoho's "Notify Leads Owner" is on, so Dani gets an email for each new lead. Duplicate emails are routed to Zoho's approval queue (Leads → Actions → Approve Leads) rather than silently merged.

## Instagram and TikTok feeds (SnapWidget)

The "Follow along" section on the home page has two slots marked `SNAPWIDGET INSTAGRAM` and `SNAPWIDGET TIKTOK` in `index.html`. Until embed code is pasted in, each slot shows a follow button, so the page never looks broken.

1. Create an account at snapwidget.com. The Instagram widget is free; the TikTok widget needs the Lite plan ($8/month or $80/year, 14-day trial).
2. Create an **Instagram** widget → connect `@birdhousedogrooming` (log in with the Instagram account) → pick Grid, 3 columns, 6 photos, and set the widget to responsive width. Copy the embed code (an `<iframe>` plus a `<script>`).
3. Create a **TikTok** widget → enter `@danigal_bird` → same layout settings → copy the embed code.
4. Paste each embed code into its slot in `index.html`, replacing the `feed__placeholder` div. Commit and deploy.

Feeds refresh on SnapWidget's side (every 5 minutes on paid plans, every 15 minutes on free), so nothing on the site changes when Dani posts.

## Domains

`vercel.json` holds the redirects. Replace the placeholders:

- `MAIN-DOMAIN.com` → the primary domain (canonical site).
- `GROOMING-DOMAIN.com` → redirects every path to `/grooming` on the main domain.
- `TRAINING-DOMAIN.com` → redirects to `/training`.
- `SECOND-MAIN-DOMAIN.com` → redirects to the same path on the main domain.

All four domains are added to the Vercel project (Settings → Domains); the redirects decide where each one lands. Also replace `https://SITE_URL` in the HTML heads, `robots.txt` and `sitemap.xml` with the main domain:

```bash
grep -rl "SITE_URL" --include=*.html --include=*.txt --include=*.xml . | xargs sed -i '' 's#https://SITE_URL#https://MAIN-DOMAIN.com#g'
```

## Editing content

- Prices: `grooming.html` (`#prices`), `training.html` (`#programs`), and the summary on `index.html` (`#pricing`). The wizard's add-on prices are in `js/book.js`.
- Photos: drop a new original in `assets/`, then resize it into `img/` at 900 and 1600 px wide (jpg + webp) and reference it with a `<picture>` block like the existing ones.
- Phone, email and address appear in each page's footer and in `index.html`'s contact section and JSON-LD.
