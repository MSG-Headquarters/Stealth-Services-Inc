# Capture of production — 2026-08-30

What `www.umbrassi.com` actually served, pulled into version control so seven
months of undocumented dashboard edits become visible.

**This branch is a record, not a proposal.** Nothing here was deployed, nothing
on Cloudflare was changed, and `main` was not touched.

- **Origin:** `https://www.umbrassi.com`
- **Served by:** the `ssi` Cloudflare Worker — a static asset bundle uploaded by
  hand through the dashboard. Every version reads *Manually deployed ·
  Dashboard*; zero bindings; no repo connection.
- **Worker version at capture:** `7c156c69`
- **Captured:** 28 files, ~938 KB

---

## ⚠️ Completeness cannot be proven. This is a best-effort capture.

Said in those words because the distinction matters more than the number.

### What was done

**1 · Crawl.** Breadth-first from `/`, following every same-origin
`href`/`src`/`link`, every `url()` in CSS, and every path-shaped string literal
in HTML and JavaScript. Finds what is **reachable**.

**2 · Probe.** An explicit list of 63 paths nobody links to: every path present
in `main`, plus `/covrd/`, `/Sunday/`, `/robots.txt`, `/sitemap.xml`,
`/favicon.ico`, manifests, and `.well-known`. Finds what **exists but is
unlinked** — `/covrd/` and `/Sunday/` are both in that category, and both were
only ever found because somebody already knew the path.

**3 · Redirect following.** Cloudflare Static Assets rewrites `/x.html` → `/x`
and `/dir/index.html` → `/dir/`, so **a 307 is proof the asset exists** — a
missing path 404s instead. The first run recorded those 307s and stopped, which
silently dropped `/apps` and `/enterprise`. Following them is what found both.

### What could not be done

**There is no Cloudflare API that enumerates a deployed Worker's static
assets.** The asset manifest flows one way only — the client supplies it when
uploading:

| endpoint | direction |
|---|---|
| `POST …/workers/scripts/:name/assets-upload-session` | write |
| `POST …/workers/assets/upload` | write |
| `PUT …/workers/scripts/:name` | write |

There is no corresponding `GET` or `LIST`. So the one method that would settle
completeness does not exist. (Separately, this session held no Cloudflare
credential, so no API attempt was made either way.)

**The consequence, stated plainly: a file that is both unlinked and absent from
the probe list is invisible to this capture, and nothing here would reveal it.**
If a path turns up later that is not in this branch, that is expected behaviour
of the method, not a contradiction of it.

---

## The auth gate is client-side, and it covers two paths

Verified by comparing a `curl` fetch against a headless-browser render:

| path | browser lands on | gated? |
|---|---|---|
| `/` | `/Sunday/?app=ssi&redirect=…` | yes |
| `/apps` | `/Sunday/?app=ssi&redirect=…/apps` | yes |
| `/enterprise` | itself | no |
| `/macra/` | itself | no |
| `/Apps/` | itself | no |
| `/covrd/` | itself | no |

Two things are true at once and both matter:

- In a real browser, `/` and `/apps` **do** bounce to the Sunday sign-in.
- The full page content **still ships to the wire**. `curl` returns the complete
  marketing copy for both. The gate is a client-side redirect, not access
  control — anyone not running JavaScript reads everything.

Everything else is ungated and public, including `/covrd/` and `/macra/`.

---

## Capture artefacts stored as `.html`

`/apps` and `/enterprise` are served extensionless and are written here as
`apps.html` and `enterprise.html`. Two reasons:

1. It is almost certainly what the bundle holds — the 307 runs *from*
   `/apps.html` *to* `/apps`, which is the Static Assets rewrite.
2. Without it the capture collides on Windows. The site serves **both** `/Apps/`
   and `/apps`; on a case-insensitive filesystem the directory `Apps` and the
   file `apps` are the same name. The first run died with `EEXIST`. That
   collision is itself a fact about the bundle worth knowing.

## Secret scan — run, and clean

Scanned all 28 files for API keys, tokens, bearer credentials, private keys, and
the common vendor formats (`sk_`, `pk_`, JWT `eyJ…`, `AIza…`, `ghp_`, `xox…`).

**No credential found.** Every hit was a variable name reading from
`localStorage`/`sessionStorage`, not a literal.

Two observations that are **not** secrets but are worth a reader knowing:

- `macra/index.html` takes a **user-entered Anthropic API key**, keeps it
  client-side, and calls `api.anthropic.com` directly with
  `anthropic-dangerous-direct-browser-access: true`. No key is hardcoded — the
  person pastes their own. It is their key, in their browser, on this domain.
- `Sunday/index.html` loads `face-api.js` and `tesseract.js` from jsDelivr,
  executing on this origin. **Sunday-owned code on Koda's domain.** Flagged only;
  that platform is owned by its own session and nothing was changed.
