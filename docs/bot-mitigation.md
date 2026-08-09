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
and must be configured in the Cloudflare dashboard** — see below.

## Manual step: the WAF rule

`candidgarden.com` is on the Free plan, which allows 5 custom WAF rules. One is
enough.

> **Note — this step resists automation, and the obvious fix does not work.**
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
> API where custom rules actually live. The correct permission group could not
> be identified from inside the account — `GET /accounts/{id}/tokens/permission_groups`
> needs user-level access the token does not have.
>
> Unless someone finds the right group, **create this rule in the dashboard.**
> It is a one-time, two-minute task, and the WAF is not something this repo
> needs to manage as code.

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
