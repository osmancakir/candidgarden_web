# Bot mitigation

The archive is 54,497 dossiers, each of them a crawlable address backed by a
database query against a 1 GB RDS instance. That combination is unusually
attractive to commercial crawlers and unusually expensive to serve them, so the
site needs a deliberate policy rather than a default one.

This document records what that policy is, why each layer exists, and what has
to be done by hand in the Cloudflare dashboard because it cannot live in the
repository.

## What the traffic actually looked like

Measured over 24 hours from zone analytics (`httpRequestsAdaptiveGroups`), all
20,312 requests to the zone — not a sample:

| Source                      | Requests | Share     | Notes                           |
| --------------------------- | -------- | --------- | ------------------------------- |
| SemrushBot                  | 6,464    | **31.8%** | SEO backlink index              |
| AwarioBot                   | 4,103    | **20.2%** | Brand-mention listener, Hetzner |
| MJ12bot                     | 2,885    | **14.2%** | Majestic backlink index         |
| AhrefsBot                   | 160      | 0.8%      |                                 |
| Applebot-Extended           | 154      | 0.8%      | AI training opt-out signal      |
| SERankingBacklinksBot       | 138      | 0.7%      |                                 |
| **Googlebot**               | **141**  | **0.7%**  | the crawler that matters        |

**Three crawlers were 66% of all traffic.** The search engine that actually
sends readers was 0.7% — Semrush alone outweighed Googlebot 46:1.

Response codes over the same window tell the consequence:

| Status | Count  |
| ------ | ------ |
| 200    | 12,016 |
| 503    | 5,231  |
| 404    | 1,143  |
| 504    | 522    |
| 500    | 247    |

Roughly **6,000 requests — 29.5% — were 5xx.** Independently, 5,291 of 17,164
Worker invocations failed with `Worker exceeded CPU time limit`. Those are the
same failures counted at two layers.

The lesson worth keeping: the load was not a spike or an attack. It was the
steady-state cost of being publicly crawlable at this size, which means it
returns on its own unless something structural changes.

## Update, 2026-08-12: the traffic changed shape entirely

Three days after `robots.txt` shipped, the same 24-hour query returns a
completely different site. **The SEO crawlers are gone.** Semrush, Awario and
MJ12 — 66% of all traffic — no longer appear in the top 25 user agents at all.
Layer 2 worked exactly as predicted.

What replaced them is larger and is not the same problem:

| Source                          | Requests | Notes                                   |
| ------------------------------- | -------- | --------------------------------------- |
| Chrome / Windows (forged)       | 17,741   | almost entirely `/resources/images`      |
| **Claude-SearchBot**            | 17,427   | `/` and `/support`, mostly receiving 503 |
| (empty user agent)              | 17,012   |                                          |
| Chrome / macOS (forged)         | 9,251    | almost entirely `/resources/images`      |
| Chrome / Linux                  | 1,986    |                                          |

Status codes, ~71,000 requests total:

| Status | Count  |
| ------ | ------ |
| 200    | 35,666 |
| 503    | 15,550 |
| 504    | 8,514  |
| 204    | 8,445  |
| 500    | 1,362  |

And the paths, which is where the actual finding is:

| Path                | Requests |
| ------------------- | -------- |
| `/resources/images` | 25,539   |
| `/`                 | 10,701   |
| `/support`          | 3,841    |
| `/robots.txt`       | 114      |

**`/archive/*` is no longer in the top paths at all.** The crawl trap is closed.
The dossier enumeration that motivated this entire document has stopped.

### The image endpoint is now the whole story

The homepage emits **180 `/resources/images` references** — 60 images × three
`<picture>` sources (avif, webp, fallback). Every one that the browser actually
requests is a separate Worker invocation that signs an S3 URL and runs a
Cloudflare image transformation. Measured directly, each takes 0.6–1.2 s.

Cross-tabulating path × status × user agent shows the consequence, and the ratio
is nearly identical for every browser user agent:

| UA               | 200   | 204   | 504   |
| ---------------- | ----- | ----- | ----- |
| Chrome / Windows | 4,598 | 4,610 | 4,531 |
| Chrome / macOS   | 2,423 | 2,341 | 2,404 |
| Chrome / Linux   | 520   | 522   | 508   |

A clean one-third split into success, empty response and gateway timeout. Fetched
one at a time from outside, the same URLs return 200 every time. So this is a
**concurrency failure, not a bot**: sixty near-simultaneous subrequests per page
load, a third of which time out. It would happen with one real reader and no
bots at all.

That reframes the 503s on `/` too. A bot that receives a 503 retries, so the
error rate is partly *manufacturing* the traffic volume that appears to be
causing it.

### The policy that followed

The decision on 2026-08-12 was to challenge **all** traffic, with no exception
for verified search engines — accepting that the archive will fall out of
Google's index over the following weeks. That is a deliberate trade, not an
oversight, and it is reversible by narrowing the rule to `(not cf.client.bot)`.

It is worth being clear about what this does and does not buy, because the two
halves of the problem are independent:

- It **does** remove the Claude-SearchBot volume and the forged-Chrome traffic,
  which is most of the invocation count.
- It **does not** fix the image fan-out or the CPU cap. Once a real reader solves
  the challenge they receive a `cf_clearance` cookie good for the whole zone, and
  every one of their sixty image subrequests passes straight through to the
  Worker exactly as before. A challenged site with one human on it still returns
  504s on a third of its images.

The image fan-out and the plan upgrade below remain the actual fixes.

## The four layers

Blocking is the last of them, not the first. Each layer catches what the one
above it could not.

### 1. Don't offer the crawl surface — `robots.txt`

`app/routes/_seo/robots[.]txt.ts` disallows the facet space (`motif`, `sense`,
`institution`, `century`, `category`, `sort`, `seed`, …). Those parameters
compose, so they present a combinatorial address space no crawler can finish and
no reader asked to have indexed — a crawl trap that happens to be one database
query per address.

`page` is deliberately still allowed. The sitemap carries only static routes, so
walking the paginated index is the only path by which a crawler reaches the
dossiers at all; disallowing it would make the archive undiscoverable rather
than merely cheaper to crawl.

### 2. Ask the crawlers to leave — `robots.txt` user-agent groups

The same file carries `Disallow: /` groups for the SEO and backlink crawlers,
and for bulk AI-training corpora. Assistant fetchers that read one page because
a person asked about it (`ChatGPT-User`, `Claude-User`, `Perplexity-User`) are
explicitly allowed: they cost about what a browser costs and they bring a
reader.

Semrush, Ahrefs and MJ12 do honour `robots.txt`, typically within a day or two.
That is the whole reason this layer is worth having — it is free, and it works
on the well-behaved majority. It is a request, not a control, which is why
layer 3 exists.

### 3. Make it not matter — caching

`app/routes/archive/$resourceId.tsx` builds each dossier through `cachified`
into the LRU + Workers KV cache, with a 6-hour TTL and a **seven-day**
stale-while-revalidate window. A miss is cached as `null`, so a crawler
enumerating ids finds its 404 in KV rather than in Postgres.

This is the layer that actually protects Hyperdrive, and the only one that keeps
working against a crawler that ignores every rule and forges its user agent. A
blocked bot costs nothing; a cached bot costs almost nothing. Prefer widening
the cache over adding a block.

### 4. Stop it at the edge — WAF

For the crawlers that ignore `robots.txt`. **This layer is not in the repository
and lives in the Cloudflare zone, not the repo** — but it is scriptable with the
current token; see below.

## The WAF rule

`candidgarden.com` is on the Free plan, which allows 5 custom WAF rules. One is
enough.

> **Note — this step resists automation, and both obvious fixes are now closed.**
>
> `Zone → Firewall Services → Edit` was added to the `.env` token and verified
> to take effect: `GET /zones/{id}/firewall/rules` and `/filters` both went from
> `Authentication error` to `success: true`. The **Rulesets API still returns
> `request is not authorized`** on both
> `/zones/{id}/rulesets/{ruleset_id}` and
> `/zones/{id}/rulesets/phases/http_request_firewall_custom/entrypoint`,
> re-tested over several minutes to rule out propagation delay.
>
> So Firewall Services grants the *legacy* Firewall Rules API, not the Rulesets
> API where custom rules actually live.
>
> **2026-08-12: the legacy API is no longer a way around this.** Writing to it
> now fails with `firewallrules.api.maintenance_mode` — "This API is in
> maintenance mode and no longer accepts modifications." Reads still work, which
> is why the one existing rule is still listed. The Rulesets API is the only
> write path that exists, and this token cannot use it: `PUT` to the
> `http_request_firewall_custom` entrypoint returns `Authentication error`, while
> `GET /zones/{id}/rulesets` succeeds — so the token has ruleset *read* and lacks
> ruleset *write*.
>
> The missing permission group is **`Zone → WAF → Edit`**. It could not be
> confirmed by name from inside the account —
> `GET /accounts/{id}/tokens/permission_groups` returns
> `9109 Unauthorized to access requested resource`, and `/user/tokens/verify`
> returns `Invalid API Token`, both because this is an account-scoped token
> without user-level token-management access.
>
> **Resolved, same day.** `Zone → WAF → Edit` was added to the `.env` token and
> is confirmed working — both read and write against the Rulesets API now
> succeed, and Rule 0 below was created through it rather than by hand. The WAF
> is scriptable from this repo again.
>
> Keep the dashboard route in mind anyway: it stays available when the token is
> rotated or scoped down, and it is faster than debugging a permission.

### Rule 0 — Managed Challenge, everything — **LIVE since 2026-08-12**

This supersedes rules 1 and 2 below rather than joining them: a challenge on all
traffic already catches everything they name. They are kept because they are the
rules to fall back to when the site-wide gate is narrowed or removed.

Action **Managed Challenge**, description `Human verification - all traffic`,
expression:

```
(http.host eq "candidgarden.com") or (http.host eq "www.candidgarden.com")
```

Verified live: `GET /` returns `403` with `cf-mitigated: challenge` and the
"Just a moment" interstitial, on the apex, on `www`, and on
`/resources/images`.

#### Append, don't replace

The rule was added with `POST .../rulesets/{ruleset_id}/rules`, which **appends**
to the phase. Use that, not `PUT` on the entrypoint — a `PUT` **replaces every
rule in the phase**, and this zone carries a second rule created by the
dashboard's AI Crawl Control feature (`AI Crawl Control - Block AI bots by User
Agent`, blocking Amazonbot and bingbot) that a careless `PUT` would silently
delete.

```bash
# needs CLOUDFLARE_API_TOKEN from .env with Zone → WAF → Edit
ZONE=fc077e2f12af9e5c0e4f7f3d0df0336e
RULESET=41077959698342a1a1d3d373bd496f8a   # http_request_firewall_custom, kind=zone
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/rulesets/$RULESET/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "action": "managed_challenge",
    "expression": "(http.host eq \"candidgarden.com\") or (http.host eq \"www.candidgarden.com\")",
    "description": "Human verification - all traffic",
    "enabled": true
  }'
```

Rules evaluate top to bottom and the AI Crawl Control block sits first, so
Amazonbot and bingbot are still blocked outright rather than challenged. That is
the intended order; appending preserves it.

#### Narrowing it later

To let verified search engines back through without removing the gate, change
the expression to:

```
(not cf.client.bot)
```

That is the setting to reach for once the archive needs to be findable again.
It restores Googlebot and Bingbot; it does **not** restore `ChatGPT-User`,
`Claude-User` or `OAI-SearchBot`, which cannot solve a challenge.

#### Known consequences

- `/resources/healthcheck` is challenged along with everything else, so any
  external uptime monitor pointed at it will fail until a path exception is
  added.
- Playwright tests in `tests/` that hit production will be challenged. They run
  against a local server, so this is only a problem if a smoke test is ever
  pointed at the live host.
- The archive will fall out of Google's index over the following weeks. This was
  a deliberate choice, not an oversight — see the policy note above.

### Rule 1 — Block, the crawlers that identify themselves

**Security → WAF → Custom rules → Create rule.** Name it `Block commercial
crawlers`, action **Block**, expression:

```
(http.user_agent contains "AwarioBot") or
(http.user_agent contains "SemrushBot") or
(http.user_agent contains "MJ12bot") or
(http.user_agent contains "AhrefsBot") or
(http.user_agent contains "DotBot") or
(http.user_agent contains "SERankingBacklinksBot") or
(http.user_agent contains "BLEXBot") or
(http.user_agent contains "DataForSeoBot") or
(http.user_agent contains "Barkrowler") or
(http.user_agent contains "serpstatbot") or
(http.user_agent contains "PetalBot") or
(http.user_agent contains "SeekportBot") or
(http.user_agent contains "ZoominfoBot") or
(http.user_agent contains "GPTBot") or
(http.user_agent contains "ClaudeBot") or
(http.user_agent contains "CCBot") or
(http.user_agent contains "Bytespider") or
(http.user_agent contains "Applebot-Extended") or
(http.user_agent contains "Google-Extended") or
(http.user_agent contains "Meta-External") or
(http.user_agent contains "Diffbot") or
(http.user_agent contains "ImagesiftBot")
```

Keep this list in step with `deniedAgents` in
`app/routes/_seo/robots[.]txt.ts`. The two are halves of one policy: the polite
half and the enforced half. They will drift apart if only one is ever edited.

`Meta-External` is a prefix on purpose — it covers both `Meta-ExternalAgent` and
`Meta-ExternalFetcher`.

**Do not add** `ChatGPT-User`, `Claude-User`, `Perplexity-User`, `OAI-SearchBot`
or `Claude-SearchBot`. Those are readers arriving through a different door.

Blocking `Google-Extended` and `Applebot-Extended` does **not** affect search
ranking. They are training opt-out signals, read independently of `Googlebot`
and `Applebot`.

## Challenge, not block, for the traffic that lies

About 3,900 requests a day dress as browsers: an empty user agent, `curl/8.7.1`,
`WordPress/6.4.3`, and a Firefox-on-iPhone signature claiming 1,231 views a day
against a site with fewer than ten real visitors. None of these can be blocked
by name — the name is the thing they are faking, and a rule broad enough to
catch them catches real Chrome and Safari too.

A **Managed Challenge** separates them without having to name them. Cloudflare
serves the "Performing security verification" interstitial; a real browser
solves it invisibly in a fraction of a second and is issued a cookie good for
the zone's challenge TTL, while a headless script or a bare HTTP client cannot
solve it at all.

The reason it is the right tool *here* specifically: **a challenge is issued at
the edge, before the Worker runs.** A challenged request costs zero Worker
invocations, zero CPU and zero Hyperdrive queries. Blocking and challenging are
equally free from the origin's point of view, which is why the choice between
them can be made purely on whether the traffic can be identified.

So the policy splits in two:

| Traffic                            | Action                | Why                                                                 |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------- |
| Crawlers that identify themselves  | **Block**             | They would never solve a challenge. A 403 is cleaner and they back off. |
| Clients pretending to be browsers  | **Managed Challenge** | Cannot be named without catching real readers. Let the challenge sort them. |
| Verified search engines            | Leave alone           | Googlebot is 0.7% of traffic and the only crawler that sends readers. |

### Rule 2 — Managed Challenge, the impostors

Same place, **action: Managed Challenge**, name it `Challenge unidentified
clients`:

```
(http.user_agent eq "") or
(http.user_agent contains "curl/") or
(http.user_agent contains "WordPress/") or
(http.user_agent contains "python-requests") or
(http.user_agent contains "python-httpx") or
(http.user_agent contains "Go-http-client") or
(http.user_agent contains "libwww-perl") or
(http.user_agent contains "Java/") or
(http.user_agent contains "okhttp") or
(http.user_agent contains "Scrapy") or
(http.user_agent contains "HeadlessChrome")
```

This is the rule to widen later. If bot volume climbs again, the next step is
challenging anything that is not a verified bot on the crawl surface:

```
(not cf.client.bot and starts_with(http.request.uri.path, "/archive/"))
```

That is deliberately **not** the starting position. It challenges every real
reader's first dossier view, and it breaks the assistant fetchers that
`robots.txt` explicitly allows — `ChatGPT-User` and `Claude-User` cannot solve a
challenge any more than a scraper can. Reach for it if the cheaper rule stops
being enough, not before.

### Also enable

- **Security → Bots → Bot Fight Mode.** One free toggle, and the only layer that
  catches forged user agents Cloudflare recognises but this document cannot
  enumerate. **Test the site after turning it on** — Bot Fight Mode has a
  history of challenging XHR and `fetch` traffic, and this app makes
  client-side `.data` requests on every navigation. Walk the archive filters and
  a drift session before considering it settled.
- Optionally, a rate-limiting rule on `/archive/*` keyed by IP. The Worker
  already rate-limits in `app/utils/rate-limit.server.ts`, but a WAF rule stops
  the request before it costs an invocation.

### What not to do

**Do not turn on "I'm Under Attack" mode** as a way to get the same screen. It
challenges everyone indiscriminately, including Googlebot and every assistant
fetcher, and for a public archive whose whole purpose is to be found and cited
that is self-harm dressed as security. It is for an active attack, which this is
not — this is steady-state crawler load, and it responds to targeted rules.

## The CPU limit, which is a separate problem

Blocking bots reduces the volume of the error rate. It does not fix its cause,
and the errors are reaching real readers — which is the part that matters and
the part the blended 29.5% figure hides.

Splitting the same 24 hours by whether the user agent is a crawler:

| Audience              | Requests | 5xx   | Rate      |
| --------------------- | -------- | ----- | --------- |
| Crawlers              | 15,275   | 5,065 | 33.2%     |
| **Everyone else**     | 5,039    | 937   | **18.6%** |

And per real client:

| Client                  | 5xx rate | 5xx / total |
| ----------------------- | -------- | ----------- |
| Android Chrome          | 33.4%    | 155 / 464   |
| Chrome, Windows         | 27.7%    | 48 / 173    |
| Firefox, macOS          | 26.2%    | 55 / 210    |
| Safari, iPhone          | 25.1%    | 309 / 1,231 |
| **Googlebot**           | **0.0%** | **0 / 141** |
| Static assets (no UA)   | 0.0%     | 0 / 1,081   |

So roughly **one page view in four fails for a real reader on a real browser.**

Two things in that table are worth understanding rather than just reading.
Static assets never fail, because they are served by the `ASSETS` binding and
never reach the SSR path — this is a render problem, not a delivery problem.
And Googlebot's clean 0/141 is not luck: it is not requesting the heavy dossier
renders at the rate the SEO crawlers are, which is precisely why the crawler
traffic and the CPU ceiling read as one problem when they are two.

### What the reader actually sees

Not the app's `GeneralErrorBoundary`. When a Worker is killed for exceeding CPU,
the isolate is terminated before the app can produce any response, so no error
boundary, no `ErrorBoundary` route export and no Sentry handler ever runs. The
reader gets Cloudflare's own **error 1102, "Worker exceeded resource limits"**,
as an HTTP 503 — an unstyled Cloudflare interstitial with none of the site's
markup on it. That is why this never showed up as an application error: from the
app's perspective the request simply never finished.

The measurements, over the same 24 hours:

| status              | requests | cpuTime p50   | cpuTime p99 |
| ------------------- | -------- | ------------- | ----------- |
| `success`           | 11,875   | 33.5 ms       | 245 ms      |
| `exceededResources` | 5,309    | **exactly 10.000 ms** | 35.8 ms |

Every single failure caps at exactly 10.000 ms of CPU. That is the **Workers
Free plan's 10 ms per-invocation CPU limit**, and this app's server-side render
needs roughly 33 ms at the median — three times the budget it is allowed.

The `cachified` layer added to `$resourceId.tsx` does **not** fix this. It
removes the database round trip, which is what was draining Hyperdrive, but the
10 ms is being spent in the React render and the render still happens on every
request.

There are only two real options:

1. **The Workers Paid plan ($5/month.)** Raises the per-invocation limit from
   10 ms to 30 s. The p99 successful render is 245 ms, so every request now
   failing would pass with two orders of magnitude to spare. This takes the
   error rate to approximately zero without any code change.
2. **Cache the rendered HTML**, via the Cache API inside the Worker, so repeat
   requests return a stored response instead of re-rendering. A cache hit costs
   well under 10 ms, so it fits the free budget. But it only helps repeat views
   of the same dossier — a first view, or any of 54,497 pages not yet cached,
   still renders and still fails. It also introduces a cached-HTML layer that
   has to reason about logged-in state.

Option 1 is the correct one here. Option 2 is real engineering with a partial
result, to avoid a cost roughly equal to a coffee; it is only worth building if
the plan upgrade is off the table for some reason other than the money.

This was not confirmed against the billing API — the token lacks subscription
read permission — so verify the current plan under **Workers & Pages → Plans**
before concluding. If the account is already on Paid, the exact-10 ms cap needs
a different explanation and is worth investigating on its own.

**2026-08-12:** `GET /zones/{id}` confirms the *zone* is on `Free Website`. That
is the CDN plan, which is a separate product from the Workers plan, so it does
not settle the question on its own. The behavioural evidence still does:
16,191 invocations in 24 hours terminated at a `cpuTimeP50` of exactly
10,000 µs, while successful invocations sat just under it at 9,406 µs. A cap
that sharp at exactly the documented Free-plan ceiling is not a coincidence.
The upgrade remains the single highest-value change available, and it is
unaffected by the WAF work — the challenge reduces how many requests reach the
10 ms wall, not how much CPU each one needs.

## Checking whether it worked

Worker invocations by status, last 24 hours:

```bash
# needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from .env
curl -s https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @- <<'JSON' | jq '.data.viewer.accounts[0]'
{"query":"query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:20,filter:{datetime_geq:$s,datetime_leq:$u,scriptName:\"candidgarden\"}){dimensions{status} sum{requests} quantiles{cpuTimeP50 cpuTimeP99}}}}}",
 "variables":{"a":"ACCOUNT_ID","s":"2026-08-08T00:00:00Z","u":"2026-08-09T00:00:00Z"}}
JSON
```

What to expect after the crawlers pick up `robots.txt` and the WAF rule is live:
total invocations should fall by roughly half, and `exceededResources` should
fall with it. If invocations drop but the *proportion* of `exceededResources`
holds near 31%, that is the CPU-limit problem above, not a bot problem.

Per-user-agent request counts, which is the number that says whether the WAF
rule is working:

```bash
python3 - <<'PY'
import json,os,urllib.request,datetime
tok=os.environ['CLOUDFLARE_API_TOKEN']; zone='fc077e2f12af9e5c0e4f7f3d0df0336e'
s=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ')
u=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
q="""query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){
 byUA: httpRequestsAdaptiveGroups(limit:20,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[count_DESC]){count dimensions{userAgent}}
 byStatus: httpRequestsAdaptiveGroups(limit:8,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[count_DESC]){count dimensions{edgeResponseStatus}}
}}}"""
req=urllib.request.Request('https://api.cloudflare.com/client/v4/graphql',
 data=json.dumps({'query':q,'variables':{'z':zone,'s':s,'u':u}}).encode(),
 headers={'Authorization':'Bearer '+tok,'Content-Type':'application/json'})
z=json.load(urllib.request.urlopen(req))['data']['viewer']['zones'][0]
for r in z['byUA']: print(f"{r['count']:>7}  {(r['dimensions']['userAgent'] or '')[:70]}")
print()
for r in z['byStatus']: print(f"{r['count']:>7}  {r['dimensions']['edgeResponseStatus']}")
PY
```

This needs **Zone → Analytics → Read**, which the `.env` token now has. Note
that `clientAsn` and `clientCountryName` are **not** available on the Free plan
— a query including them fails with `zone does not have access to the field`,
which reads like a permissions error and is not one.
