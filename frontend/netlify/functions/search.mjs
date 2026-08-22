// ============================================================================
// Netlify Function: /api/search
// ----------------------------------------------------------------------------
// Server-side multi-engine web search for the Universal Sompo Search Lab.
//
// Why this exists: the deployed site is a static SPA. A browser cannot call
// Google News RSS, Bing or DuckDuckGo directly (CORS), so before this function
// existed every production search silently fell back to canned data. This runs
// the queries server-side and returns real, live, keyword-specific results.
//
// Engines (all free, no key required):
//   * Google News RSS   — every Indian-language edition, not just en/hi
//   * Bing News RSS     — per-market, so hi-IN / mr-IN / ta-IN each get a pass
//   * Bing Web          — site: capable
//   * DuckDuckGo HTML   — site: capable, rate-limits hard
//   * Mojeek            — independent index, site: capable, no bot challenge
// Optional, enabled by environment variable if the client has a key:
//   * SERPER_API_KEY                      -> real Google SERP via serper.dev
//   * GOOGLE_CSE_KEY + GOOGLE_CSE_CX      -> Google Programmable Search JSON API
//
// A single invocation is capped at 10s by Netlify, which is nowhere near enough
// for a full multi-language sweep. The client therefore SHARDS the work and
// calls this function many times in parallel; each invocation gets its own
// budget. See fetchViaFunction in searchService.js.
//
// Contract:
//   POST { queries: [{query, tier, intent, engines, langs}], limit }
//        -> { results, engines_used, engines_unavailable, errors, elapsed_ms }
//   POST { mode: 'fetch', urls: [...] }
//        -> { pages: [{url, text, ok}] }
// ============================================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

// Netlify synchronous functions are capped at 10s. Stay comfortably inside it
// and return whatever has landed rather than timing out with nothing.
const TOTAL_BUDGET_MS = 8200;
const PER_REQUEST_MS = 4500;
// RSS and HTML endpoints are I/O bound and mostly answer in well under a
// second, so a wider pool converts the 8.2s budget into more coverage rather
// than more waiting.
const MAX_CONCURRENT = 10;

// Article fetches are cheaper and more predictable than search scrapes, so they
// get a tighter timeout and more of them run at once.
const FETCH_REQUEST_MS = 3500;
const FETCH_CONCURRENT = 10;
const MAX_FETCH_URLS = 12;
const MAX_ARTICLE_CHARS = 12000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Google News India editions. Kept inline rather than imported from the client
// bundle so the function has no build-time coupling to src/.
const NEWS_EDITIONS = {
  en: { hl: 'en-IN', ceid: 'IN:en', label: 'Google News' },
  hi: { hl: 'hi-IN', ceid: 'IN:hi', label: 'Google News (Hindi)' },
  mr: { hl: 'mr-IN', ceid: 'IN:mr', label: 'Google News (Marathi)' },
  gu: { hl: 'gu-IN', ceid: 'IN:gu', label: 'Google News (Gujarati)' },
  bn: { hl: 'bn-IN', ceid: 'IN:bn', label: 'Google News (Bengali)' },
  ta: { hl: 'ta-IN', ceid: 'IN:ta', label: 'Google News (Tamil)' },
  te: { hl: 'te-IN', ceid: 'IN:te', label: 'Google News (Telugu)' },
  kn: { hl: 'kn-IN', ceid: 'IN:kn', label: 'Google News (Kannada)' },
  ml: { hl: 'ml-IN', ceid: 'IN:ml', label: 'Google News (Malayalam)' },
  pa: { hl: 'pa-IN', ceid: 'IN:pa', label: 'Google News (Punjabi)' },
  or: { hl: 'or-IN', ceid: 'IN:or', label: 'Google News (Odia)' },
  ur: { hl: 'ur-IN', ceid: 'IN:ur', label: 'Google News (Urdu)' },
  as: { hl: 'as-IN', ceid: 'IN:as', label: 'Google News (Assamese)' }
};

const BING_MARKETS = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', gu: 'gu-IN', bn: 'bn-IN',
  ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN'
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function timedFetch(url, options = {}, ms = PER_REQUEST_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8', ...(options.headers || {}) }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Minimal, dependency-free XML field reader. RSS payloads here are shallow and
// well-formed, so regex extraction is safe and far cheaper than a parser.
function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1])).trim() : '';
}

function extractAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
}

function stripCdata(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function items(xml) {
  return String(xml || '').split(/<item[\s>]/i).slice(1).map((chunk) => chunk.split(/<\/item>/i)[0]);
}

/**
 * Reject a response that is not actually an RSS feed.
 *
 * Google News answers a throttled request with a 302 to a consent or homepage
 * URL. `fetch` follows redirects by default, so the engine returns 200 with a
 * body that is empty or HTML — and parsing that yields zero items, which is
 * indistinguishable from a genuine "nothing matched" unless it is raised here.
 * Reporting a throttled edition as one that searched and found nothing is the
 * precise silent degradation this system must not do.
 */
function assertFeed(body, label, res) {
  const text = String(body || '');
  if (!text.trim()) {
    throw new Error(`${label} returned an empty body (HTTP ${res.status}${res.redirected ? ', redirected' : ''}) — throttled, not empty`);
  }
  if (!/<(?:rss|feed|channel)\b/i.test(text)) {
    throw new Error(`${label} returned a non-feed response${res.redirected ? ' after a redirect' : ''} — throttled or blocked`);
  }
  return text;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function classify(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('news.google.com') || u.includes('bing.com/news')) return 'News';
  return 'Web';
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

// Google News RSS. `hl`/`ceid` switch the edition — the regional editions
// surface Dainik Bhaskar / Lokmat / Dinamalar district reports that the English
// one never returns, which is exactly where Indian road accidents get reported.
async function googleNewsRSS(query, lang = 'en') {
  const edition = NEWS_EDITIONS[lang] || NEWS_EDITIONS.en;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${edition.hl}&gl=IN&ceid=${encodeURIComponent(edition.ceid)}`;

  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`${edition.label} ${res.status}`);
  const xml = assertFeed(await res.text(), edition.label, res);

  return items(xml).slice(0, 10).map((block) => {
    const link = extractTag(block, 'link');
    const publisher = extractTag(block, 'source') || extractAttr(block, 'source', 'url');
    const publisherHost = hostOf(extractAttr(block, 'source', 'url')) || '';
    const rawTitle = extractTag(block, 'title');
    // Google appends " - Publisher" to every headline; strip it for scoring.
    const title = rawTitle.replace(/\s+-\s+[^-]{2,40}$/, '').trim() || rawTitle;
    const description = stripTags(extractTag(block, 'description'));
    return {
      title,
      url: link,
      snippet: description || title,
      publish_date: extractTag(block, 'pubDate'),
      source: 'News',
      engine: edition.label,
      lang,
      publisher: publisher || publisherHost,
      domain: publisherHost || 'news.google.com',
      query_used: query
    };
  }).filter((r) => r.url);
}

// Bing wraps every RSS link in a click-tracking redirect:
//   bing.com/news/apiclick.aspx?...&url=<percent-encoded publisher URL>&...
// Left as-is, the investigator gets an opaque bing.com link and the ranker
// scores it as a Bing page rather than as the newspaper that published it.
function unwrapBingLink(link) {
  if (!link || !link.includes('bing.com/news/apiclick')) return link;
  try {
    const inner = new URL(link).searchParams.get('url');
    if (inner && /^https?:\/\//i.test(inner)) return inner;
  } catch { /* fall through to the original link */ }
  return link;
}

async function bingNewsRSS(query, lang = 'en') {
  const mkt = BING_MARKETS[lang] || 'en-IN';
  const label = lang === 'en' ? 'Bing News' : `Bing News (${mkt})`;
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&cc=IN&setmkt=${mkt}`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  const xml = assertFeed(await res.text(), label, res);

  return items(xml).slice(0, 10).map((block) => {
    const link = unwrapBingLink(extractTag(block, 'link'));
    return {
      title: extractTag(block, 'title'),
      url: link,
      snippet: stripTags(extractTag(block, 'description')),
      publish_date: extractTag(block, 'pubDate'),
      source: 'News',
      engine: label,
      lang,
      domain: hostOf(link),
      query_used: query
    };
  }).filter((r) => r.url);
}

// DuckDuckGo's no-JS HTML endpoint. Returns direct publisher URLs (unlike
// Google News RSS), which makes it the best source of clean, openable links.
async function duckDuckGo(query) {
  const url = 'https://html.duckduckgo.com/html/';
  const res = await timedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(query)}&kl=in-en`
  });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const html = await res.text();

  // DuckDuckGo answers rate-limited traffic with HTTP 202 and a bot-challenge
  // page rather than an error status. Parsing that yields zero results, which
  // is indistinguishable from "nothing matched" unless it is raised here — and
  // reporting a blocked engine as a successful empty search is exactly the kind
  // of silent degradation this system must not do.
  if (/Unfortunately, bots use DuckDuckGo too|anomaly-modal|challenge/i.test(html)) {
    throw new Error('DuckDuckGo served a bot challenge (rate limited) — results unavailable this run');
  }

  const out = [];
  const blocks = html.split(/class="result__body"/).slice(1);
  for (const block of blocks.slice(0, 12)) {
    const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    if (!hrefMatch) continue;
    let link = decodeEntities(hrefMatch[1]);

    // DDG wraps outbound links: //duckduckgo.com/l/?uddg=<encoded>&rut=...
    const uddg = link.match(/[?&]uddg=([^&]+)/);
    if (uddg) link = decodeURIComponent(uddg[1]);
    if (link.startsWith('//')) link = `https:${link}`;
    if (!/^https?:\/\//.test(link)) continue;
    if (link.includes('duckduckgo.com')) continue;

    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    out.push({
      title: stripTags(titleMatch ? titleMatch[1] : ''),
      url: link,
      snippet: stripTags(snippetMatch ? snippetMatch[1] : ''),
      publish_date: null,
      source: classify(link),
      engine: 'DuckDuckGo',
      domain: hostOf(link),
      query_used: query
    });
  }
  return out.filter((r) => r.title && r.url);
}

// Bing web search (not the news RSS feed). This is the second engine that
// honours a `site:` operator, so it is what keeps video discovery alive when
// DuckDuckGo is rate limited. Bing wraps every result URL in a /ck/a redirect
// carrying the real target base64url-encoded in `u=a1…`.
function decodeBingRedirect(link) {
  if (!link || !link.includes('bing.com/ck/a')) return link;
  try {
    const u = new URL(decodeEntities(link)).searchParams.get('u');
    if (!u || !u.startsWith('a1')) return link;
    const b64 = u.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    return /^https?:\/\//i.test(decoded) ? decoded : link;
  } catch {
    return link;
  }
}

async function bingWeb(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=IN&setmkt=en-IN&count=20`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`Bing web ${res.status}`);
  const html = await res.text();

  const blocks = html.split('<li class="b_algo"').slice(1);
  const out = [];
  for (const block of blocks.slice(0, 12)) {
    const m = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    const link = decodeBingRedirect(m[1]);
    if (!/^https?:\/\//i.test(link) || link.includes('bing.com')) continue;

    const capMatch = block.match(/class="b_lineclamp\d"[^>]*>([\s\S]*?)<\/p>/)
      || block.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
    const dateMatch = block.match(/class="news_dt"[^>]*>([^<]+)</);

    out.push({
      title: stripTags(m[2]),
      url: link,
      snippet: capMatch ? stripTags(capMatch[1]) : '',
      publish_date: dateMatch ? dateMatch[1].trim() : null,
      source: classify(link),
      engine: 'Bing Web',
      domain: hostOf(link),
      query_used: query
    });
  }
  return out.filter((r) => r.title && r.url);
}

// Mojeek runs its own crawler and index — not a Bing or Google reseller — so it
// surfaces small district portals the majors never indexed. It also honours
// `site:` and, unlike DuckDuckGo, does not serve a bot challenge to anonymous
// traffic, which makes it the reliable third leg of site:-restricted discovery.
async function mojeek(query) {
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}&arc=in`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`Mojeek ${res.status}`);
  const html = await res.text();

  const out = [];
  const blocks = html.split(/<li[^>]*>\s*(?=<h2)/).slice(1);
  for (const block of blocks.slice(0, 12)) {
    const m = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    let link = decodeEntities(m[1]);
    if (link.startsWith('/')) continue;
    if (!/^https?:\/\//i.test(link)) continue;

    const desc = block.match(/<p class="s"[^>]*>([\s\S]*?)<\/p>/);
    out.push({
      title: stripTags(m[2]),
      url: link,
      snippet: desc ? stripTags(desc[1]) : '',
      publish_date: null,
      source: classify(link),
      engine: 'Mojeek',
      domain: hostOf(link),
      query_used: query
    });
  }
  return out.filter((r) => r.title && r.url);
}

// GDELT and the Wayback CDX index were both implemented here and both removed
// after measurement, rather than left in as engines that can never succeed:
//
//   GDELT DOC 2.0 enforces one request per five seconds and takes 13-15s even
//   to return its rate-limit notice. The sweep fires roughly a dozen parallel
//   invocations, so it would be throttled on every run, and 13s exceeds the
//   entire function budget regardless.
//
//   The Wayback CDX wildcard scan (url=*&filter=urlkey:.*term.*) is a full
//   index scan; it took over five seconds to return nothing at all. CDX is
//   built for prefix queries against a known host, not for discovery.
//
// An engine that reports "unavailable" on every single search is worse than no
// engine: it trains an investigator to ignore the unavailable list, which is
// the one place this system reports degraded coverage.

// Real Google SERP, when the deployment has a serper.dev key configured.
async function serperGoogle(query, apiKey) {
  const res = await timedFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 10 })
  });
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  const data = await res.json();
  const organic = data.organic || [];
  const news = data.news || [];
  return [...organic, ...news].slice(0, 14).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || r.title,
    publish_date: r.date || null,
    source: classify(r.link),
    engine: 'Google (live SERP)',
    domain: hostOf(r.link),
    query_used: query
  })).filter((r) => r.url);
}

// Google Programmable Search JSON API — the officially supported path.
async function googleCSE(query, key, cx) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&gl=in&num=10`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`Google CSE ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || r.title,
    publish_date: (r.pagemap && r.pagemap.metatags && r.pagemap.metatags[0] &&
      (r.pagemap.metatags[0]['article:published_time'] || r.pagemap.metatags[0].date)) || null,
    source: classify(r.link),
    engine: 'Google Programmable Search',
    domain: hostOf(r.link),
    query_used: query
  })).filter((r) => r.url);
}

// ---------------------------------------------------------------------------
// Article full-text fetch
// ---------------------------------------------------------------------------

// Indian accident reports print the registration number in the body of the
// article and almost never in the headline or the search snippet. Without the
// body text a genuine match can only ever be scored as circumstantial, so this
// is what promotes a result from STRONG to CONFIRMED.
async function fetchArticle(url) {
  const res = await timedFetch(url, {}, FETCH_REQUEST_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const type = res.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml/i.test(type)) throw new Error(`Not HTML (${type})`);

  const html = await res.text();

  // Drop the furniture before stripping tags, or the body text is drowned in
  // navigation, script payloads and cookie banners.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');

  const article = body.match(/<article[\s\S]*?<\/article>/i);
  const text = stripTags(article ? article[0] : body);
  if (!text || text.length < 120) throw new Error('No extractable article text');

  return text.slice(0, MAX_ARTICLE_CHARS);
}

async function runFetchPool(urls, deadline) {
  const pages = [];
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      if (Date.now() > deadline) {
        pages.push({ url, ok: false, error: 'Skipped: time budget exhausted' });
        continue;
      }
      try {
        pages.push({ url, ok: true, text: await fetchArticle(url) });
      } catch (err) {
        pages.push({ url, ok: false, error: String(err.message || err) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENT, urls.length) }, worker));
  return pages;
}

// ---------------------------------------------------------------------------
// Concurrency pool with a hard wall-clock budget
// ---------------------------------------------------------------------------

async function runPool(tasks, limit, deadline) {
  const results = [];
  const errors = [];
  // Engines are recorded by OUTCOME, not by intent. Reporting an engine as
  // "used" because a request was merely dispatched to it makes a rate-limited
  // engine look like one that searched and found nothing.
  const responded = new Set();
  const failed = new Map();
  const skipped = new Set();
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const task = tasks[index];

      if (Date.now() > deadline) {
        skipped.add(task.engine);
        continue;
      }
      try {
        const value = await task.run();
        if (Array.isArray(value)) {
          results.push(...value);
          responded.add(task.engine);
        }
      } catch (err) {
        const message = String(err.message || err);
        errors.push(`${task.engine} · "${task.query}": ${message}`);
        if (!failed.has(task.engine)) failed.set(task.engine, message);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));

  // An engine that failed every attempt is unavailable, not merely empty.
  const unavailable = [...failed.entries()]
    .filter(([engine]) => !responded.has(engine))
    .map(([engine, message]) => ({ engine, reason: message }));

  return {
    results,
    errors,
    responded: [...responded],
    unavailable,
    skipped: [...skipped].filter((e) => !responded.has(e))
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req) => {
  // A 204 must carry a null body; passing '' makes the Response constructor throw.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: CORS });
  }

  const started = Date.now();
  const deadline = started + TOTAL_BUDGET_MS;

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS });
  }

  // ------------------------------------------------------- full-text mode --
  if (body.mode === 'fetch') {
    const urls = (Array.isArray(body.urls) ? body.urls : [])
      .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, MAX_FETCH_URLS);

    if (!urls.length) {
      return new Response(JSON.stringify({ ok: true, pages: [] }), { status: 200, headers: CORS });
    }
    const pages = await runFetchPool(urls, deadline);
    return new Response(JSON.stringify({
      ok: true,
      pages,
      fetched: pages.filter((p) => p.ok).length,
      elapsed_ms: Date.now() - started
    }), { status: 200, headers: CORS });
  }

  // ---------------------------------------------------------- search mode --
  const rawQueries = Array.isArray(body.queries) ? body.queries : [];
  const queries = rawQueries
    .map((q) => (typeof q === 'string' ? { query: q, engines: ['news', 'web'] } : q))
    .filter((q) => q && typeof q.query === 'string' && q.query.trim().length >= 3)
    .slice(0, 12);

  if (!queries.length) {
    return new Response(JSON.stringify({ error: 'No queries supplied', results: [] }), { status: 400, headers: CORS });
  }

  const serperKey = process.env.SERPER_API_KEY;
  const cseKey = process.env.GOOGLE_CSE_KEY;
  const cseCx = process.env.GOOGLE_CSE_CX;

  const tasks = [];
  const add = (engine, query, run) => tasks.push({ engine, query, run });

  queries.forEach((q) => {
    const wantsNews = !q.engines || q.engines.includes('news');
    const wantsWeb = !q.engines || q.engines.includes('web');
    const isSiteQuery = /\bsite:/i.test(q.query);

    // The client decides which language editions this shard covers, so the
    // sweep can be spread across many parallel invocations instead of being
    // crushed into one 10-second budget.
    const langs = (Array.isArray(q.langs) && q.langs.length ? q.langs : ['en'])
      .filter((l) => NEWS_EDITIONS[l]);

    // A `site:` operator is meaningless to an RSS news feed — send it to the
    // web engines only.
    // The same query is spread over several shards, one per group of language
    // editions. Engines that are not per-language — GDELT, and the web tier —
    // must run on exactly one of those shards or the sweep pays for them N
    // times and each shard's budget is spent re-fetching identical results.
    const isPrimary = q.primary !== false;

    if (wantsNews && !isSiteQuery) {
      langs.forEach((lang) => {
        add(NEWS_EDITIONS[lang].label, q.query, () => googleNewsRSS(q.query, lang));
      });
      if (isPrimary) {
        // Bing News only has markets for the larger languages; the rest fall
        // back to en-IN, which would just duplicate the English pass.
        langs.filter((l) => BING_MARKETS[l]).slice(0, 3).forEach((lang) => {
          const label = lang === 'en' ? 'Bing News' : `Bing News (${BING_MARKETS[lang]})`;
          add(label, q.query, () => bingNewsRSS(q.query, lang));
        });
        }
    }

    if (wantsWeb && isPrimary) {
      // Three independent `site:`-capable engines: DuckDuckGo rate-limits hard,
      // and site:-restricted discovery (video) has no other route.
      add('DuckDuckGo', q.query, () => duckDuckGo(q.query));
      add('Bing Web', q.query, () => bingWeb(q.query));
      add('Mojeek', q.query, () => mojeek(q.query));

      if (serperKey) {
        add('Google (live SERP)', q.query, () => serperGoogle(q.query, serperKey));
      } else if (cseKey && cseCx) {
        add('Google Programmable Search', q.query, () => googleCSE(q.query, cseKey, cseCx));
      }
    }
  });

  const { results, errors, responded, unavailable, skipped } = await runPool(tasks, MAX_CONCURRENT, deadline);

  // De-duplicate by URL here so the client receives a compact payload; full
  // ranking and near-duplicate collapsing happen client-side in searchIntel.
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    const key = (r.url || '').split('#')[0].replace(/\/+$/, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }

  const limit = Math.min(Number(body.limit) || 120, 200);

  return new Response(JSON.stringify({
    ok: true,
    shard: body.shard ?? null,
    results: unique.slice(0, limit),
    total_fetched: results.length,
    // Engines that actually returned data. `engines_unavailable` names the ones
    // that were blocked or errored, so an investigator is never shown a
    // confident "searched N engines" for a run where an engine never answered.
    engines_used: responded,
    engines_unavailable: unavailable,
    engines_skipped: skipped,
    site_search_available: responded.includes('DuckDuckGo') || responded.includes('Bing Web')
      || responded.includes('Mojeek') || responded.includes('Google (live SERP)')
      || responded.includes('Google Programmable Search'),
    queries_executed: queries.map((q) => q.query),
    errors: errors.slice(0, 12),
    timed_out: Date.now() > deadline,
    elapsed_ms: Date.now() - started
  }), { status: 200, headers: CORS });
};

export const config = { path: '/api/search' };

// Exposed for the offline parser test suite; not used at runtime.
export const __test = {
  extractTag, extractAttr, decodeEntities, stripTags, items, hostOf, classify,
  unwrapBingLink, decodeBingRedirect, assertFeed, NEWS_EDITIONS, BING_MARKETS
};
