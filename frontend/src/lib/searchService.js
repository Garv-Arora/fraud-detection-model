// ============================================================================
// searchService.js — Search orchestration for the Search Lab and batch engine
// ----------------------------------------------------------------------------
// One entry point, used identically by:
//   * the Search Lab (investigator types keywords)
//   * the batch engine (50 PDFs / one 50-row Excel, one search per case)
//
// Transport strategy, in order:
//   1. /api/search        — Netlify Function (production, real live search)
//   2. /api/search/workbench — FastAPI backend (local `python run.py`)
//   3. offline            — manual research links only, clearly labelled
//
// The chosen transport is probed once and cached, so a 50-case batch does not
// pay 50 failed round-trips before falling back.
//
// A full sweep — a dozen queries across thirteen Google News language editions
// plus the web tier — cannot fit in the 10s cap on a single Netlify
// invocation. The work is therefore SHARDED and fanned out across many
// parallel invocations, each with its own independent budget. See
// buildShards().
//
// The search runs in up to three passes, each conditional on the last:
//   1. the precise plan
//   2. entity-harvest round 2, if nothing identifier-level was found
//   3. the widening ladder, if there is still nothing at all
// ============================================================================

import {
  extractAnchors, buildQueryPlan, buildWideningPlan, buildSocialQueries,
  rankAndDedupe, scrubQuery, isVerifiedSocialResult, BANDS
} from './searchIntel.js';
import { buildGoogleDeepLinks } from './googleDeepLinks.js';
import { buildEvidenceSummary } from './evidenceSummary.js';

// `import.meta.env` only exists under Vite. Guarding it lets the offline test
// harness import this module in bare Node, where the search planning and
// sharding logic can be exercised without a browser.
const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || '/api';

// 'unknown' | 'function' | 'legacy' | 'offline'
let transport = 'unknown';
let transportProbe = null;

// One shard's fetch budget. A Netlify invocation has ~8.2s of wall clock and
// runs up to 10 fetches concurrently. RSS feeds typically answer in well under
// a second, so roughly fourteen fetches finish inside the budget even though
// the per-request ceiling is 4.5s; the slow ones simply get dropped by the
// deadline rather than holding up the rest.
const FETCHES_PER_SHARD = 14;
// DuckDuckGo + Bing Web + Mojeek + up to 3 Bing News markets.
const NON_LANG_FETCHES = 6;
const MAX_SHARDS = 16;

export function getTransport() {
  return transport;
}

export function resetTransport() {
  transport = 'unknown';
  transportProbe = null;
}

async function postJSON(url, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // A SPA fallback returns index.html with a 200 — detect and reject it.
    if (text.trim().startsWith('<')) throw new Error('HTML received instead of JSON (SPA fallback)');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// Probe once; every later call reuses the resolved transport.
async function resolveTransport(samplePlan) {
  if (transport !== 'unknown') return transport;
  if (transportProbe) return transportProbe;

  transportProbe = (async () => {
    const probeQueries = samplePlan.slice(0, 1).map((p) => ({ query: p.query, tier: p.tier, engines: p.engines }));

    try {
      const data = await postJSON(`${API_BASE}/search`, { queries: probeQueries, limit: 40 }, 15000);
      if (data && Array.isArray(data.results)) {
        transport = 'function';
        return { transport, primed: data };
      }
    } catch { /* fall through */ }

    try {
      const data = await postJSON(`${API_BASE}/search/workbench`, { query: probeQueries[0]?.query || '', deep_scrape: false }, 15000);
      if (data && Array.isArray(data.results)) {
        transport = 'legacy';
        return { transport, primed: null };
      }
    } catch { /* fall through */ }

    transport = 'offline';
    return { transport, primed: null };
  })();

  const outcome = await transportProbe;
  transportProbe = null;
  return outcome.transport;
}

// ---------------------------------------------------------------------------
// Sharding
// ---------------------------------------------------------------------------

/**
 * Split a query plan across parallel function invocations.
 *
 * Each query's first shard is the "primary" one and carries the engines that
 * are not per-language (the whole web tier); the rest are additional language
 * editions only. Region-matched languages are placed in the primary shard, so
 * if a later shard is slow or throttled the edition most likely to carry the
 * report has already answered.
 */
export function buildShards(plan, languages, options = {}) {
  const langs = (languages && languages.length ? languages : ['en']);
  const perShard = Math.max(1, FETCHES_PER_SHARD - NON_LANG_FETCHES);
  const shards = [];

  plan.forEach((p) => {
    const isSiteQuery = /\bsite:/i.test(p.query);
    // A site: query is web-only, so language editions are irrelevant to it and
    // one shard covers it completely.
    const queryLangs = isSiteQuery ? ['en'] : langs;

    const primaryLangs = queryLangs.slice(0, perShard);
    shards.push({
      primary: true,
      queries: [{ query: p.query, tier: p.tier, intent: p.intent, engines: p.engines, langs: primaryLangs, primary: true }]
    });

    // Vernacular tiers are where the district report actually lives, so the
    // remaining editions are worth their own invocations rather than being
    // dropped to fit one budget.
    for (let i = perShard; i < queryLangs.length; i += FETCHES_PER_SHARD) {
      shards.push({
        primary: false,
        queries: [{
          query: p.query,
          tier: p.tier,
          intent: p.intent,
          engines: ['news'],
          langs: queryLangs.slice(i, i + FETCHES_PER_SHARD),
          primary: false
        }]
      });
    }
  });

  // Primary shards first: if the cap truncates the sweep, it must truncate the
  // long tail of extra editions, never the queries themselves.
  shards.sort((a, b) => Number(b.primary) - Number(a.primary));
  const capped = shards.slice(0, options.maxShards || MAX_SHARDS);
  return { shards: capped, dropped: shards.length - capped.length };
}

function mergeShardResults(payloads) {
  const merged = {
    results: [],
    enginesUsed: [],
    enginesUnavailable: [],
    siteSearchAvailable: false,
    errors: [],
    elapsedMs: 0,
    timedOut: false
  };
  const unavailableByEngine = new Map();

  payloads.forEach((data) => {
    if (!data) return;
    merged.results.push(...(data.results || []));
    (data.engines_used || []).forEach((e) => {
      if (!merged.enginesUsed.includes(e)) merged.enginesUsed.push(e);
    });
    (data.engines_unavailable || []).forEach((u) => {
      const key = typeof u === 'string' ? u : u.engine;
      if (key && !unavailableByEngine.has(key)) unavailableByEngine.set(key, u);
    });
    merged.errors.push(...(data.errors || []));
    merged.elapsedMs = Math.max(merged.elapsedMs, data.elapsed_ms || 0);
    if (data.site_search_available) merged.siteSearchAvailable = true;
    if (data.timed_out) merged.timedOut = true;
  });

  // An engine that answered on any shard is available, whatever happened on the
  // others — reporting it as unavailable because one parallel call was throttled
  // would understate the coverage actually achieved.
  merged.enginesUnavailable = [...unavailableByEngine.entries()]
    .filter(([engine]) => !merged.enginesUsed.includes(engine))
    .map(([, u]) => u);

  return merged;
}

async function fetchViaFunction(plan, options, anchors) {
  const { shards, dropped } = buildShards(plan, anchors?.languages, options);

  // Social discovery rides its own shard, appended after the cap so it can
  // never displace a language edition and can never itself be the thing
  // dropped. Every query on it is one Serper call, so the whole platform sweep
  // costs a single invocation running in parallel with everything else — no
  // added wall clock. The server drops the shard outright when no SERP key is
  // configured, so with no key this costs nothing and changes nothing.
  const socialQueries = Array.isArray(options.socialQueries) ? options.socialQueries : [];
  const allShards = socialQueries.length
    ? [...shards, { primary: false, social: true, queries: socialQueries }]
    : shards;

  const payloads = await Promise.all(allShards.map(async (shard) => {
    try {
      return await postJSON(`${API_BASE}/search`, {
        queries: shard.queries,
        limit: options.limit || 120
      }, options.timeoutMs || 25000);
    } catch (err) {
      // One shard failing degrades coverage; it must never fail the search.
      // That holds for the social shard too: if Serper is down, rate limited or
      // unkeyed, the news and web tiers carry on and the investigation stands.
      return {
        errors: [`${shard.social ? 'Social shard' : 'Shard'} failed: ${String(err.message || err)}`]
      };
    }
  }));

  const merged = mergeShardResults(payloads);
  merged.shardCount = allShards.length;
  if (dropped > 0) {
    // Never let a truncated sweep read as a complete one.
    merged.errors.push(`${dropped} language shard${dropped > 1 ? 's were' : ' was'} dropped to stay within the invocation cap`);
  }
  return merged;
}

async function fetchViaLegacy(plan, params, options) {
  const data = await postJSON(`${API_BASE}/search/workbench`, {
    query: params.query || plan[0]?.query || '',
    insured_name: params.insured_name || '',
    vehicle_no: params.vehicle_no || '',
    location: params.location || '',
    date_str: params.date_str || '',
    incident_keywords: params.incident_keywords || '',
    strict_accident_filter: false,
    deep_scrape: options.deepScrape !== false
  }, options.timeoutMs || 30000);

  return {
    results: (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      publish_date: r.publish_date,
      source: r.source,
      engine: r.engine || 'Backend search',
      domain: r.domain,
      full_article_text: r.full_article_text,
      query_used: r.query_used
    })),
    enginesUsed: ['Backend multi-engine search'],
    enginesUnavailable: [],
    siteSearchAvailable: true,
    errors: [],
    elapsedMs: (data.execution_time_seconds || 0) * 1000,
    timedOut: false
  };
}

// ---------------------------------------------------------------------------
// Deep full-text fetch
// ---------------------------------------------------------------------------

/**
 * Pull the body text of the most promising results and re-score them.
 *
 * The registration number is nearly always in the article body and nearly never
 * in the snippet, so without this a genuine match can only ever be graded as
 * circumstantial. Runs as its own invocation alongside the search shards.
 */
async function enrichWithFullText(ranked, anchors, options) {
  const candidates = ranked
    .filter((r) => r.band !== BANDS.CONFIRMED && r.url && !/web\.archive\.org/.test(r.url))
    // A social post is behind a login wall for an anonymous fetch, so the body
    // would come back as a sign-in page. Spending the fetch budget on that
    // would displace a news article that can actually be read.
    .filter((r) => !isVerifiedSocialResult(r))
    .slice(0, options.fetchTop || 10);

  if (!candidates.length) return ranked;

  let pages = [];
  try {
    const data = await postJSON(`${API_BASE}/search`, {
      mode: 'fetch',
      urls: candidates.map((r) => r.url)
    }, options.timeoutMs || 25000);
    pages = data.pages || [];
  } catch {
    // A failed enrichment must leave the snippet-scored ranking intact.
    return ranked;
  }

  const textByUrl = new Map(pages.filter((p) => p.ok && p.text).map((p) => [p.url, p.text]));
  if (!textByUrl.size) return ranked;

  const enriched = ranked.map((r) => {
    const text = textByUrl.get(r.url);
    return text ? { ...r, full_article_text: text } : r;
  });

  return rankAndDedupe(enriched, anchors, {
    minScore: options.minScore ?? 20,
    limit: options.limit || 60
  });
}

// ---------------------------------------------------------------------------
// Entity harvesting for round 2
// ---------------------------------------------------------------------------

/**
 * Read back what the first round returned and mine it for anchors the
 * investigator never supplied.
 *
 * A district report names the village, the police station and the local
 * spelling of the spot — none of which appear on a claim form. Feeding those
 * back is how a human investigator closes a case, and it is the only way to
 * reach an accident filed under a name nobody typed.
 */
export function harvestEntities(results, anchors, limit = 6) {
  const known = new Set(
    [...anchors.places, ...anchors.names, ...anchors.corridors, ...anchors.orgs]
      .map((v) => String(v).toLowerCase())
  );
  const counts = new Map();

  const bump = (term) => {
    const t = String(term || '').trim();
    if (t.length < 4 || known.has(t.toLowerCase())) return;
    counts.set(t, (counts.get(t) || 0) + 1);
  };

  results.slice(0, 20).forEach((r) => {
    const text = `${r.title || ''} ${r.snippet || ''}`;
    // Capitalised runs in the English press...
    (text.match(/\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,})?\b/g) || []).forEach(bump);
    // ...and the phrase before a locative postposition in the vernacular press.
    (text.match(/([ऀ-ൿ]{3,})\s*(?:के\s*पास|में|नजदीक|जवळ|પાસે|কাছে|அருகே|ಬಳಿ)/g) || [])
      .forEach((m) => bump(m.replace(/\s*(?:के\s*पास|में|नजदीक|जवळ|પાસે|কাছে|அருகே|ಬಳಿ)$/, '')));
    // Any registration number the press printed is worth searching directly.
    (text.match(/\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{3,4}\b/g) || []).forEach(bump);
  });

  // A term seen in several independent results is far more likely to be the
  // real location than a one-off from a single unrelated article.
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function buildHarvestPlan(harvested, anchors, maxQueries = 6) {
  const incident = anchors.incidentTerms.find((t) => t !== 'police' && t !== 'fir') || 'accident';
  const plan = [];
  const seen = new Set();

  harvested.forEach((term) => {
    [`${term} ${incident}`, anchors.dateISO ? `${term} ${incident} ${anchors.dateISO}` : '']
      .filter(Boolean)
      .forEach((q) => {
        const query = scrubQuery(q);
        if (!query || seen.has(query.toLowerCase()) || plan.length >= maxQueries) return;
        seen.add(query.toLowerCase());
        plan.push({ query, tier: 2, intent: `Harvested from round 1: ${term}`, cls: 'harvest', engines: ['news', 'web'] });
      });
  });

  return plan;
}

// ---------------------------------------------------------------------------
// Result cache
// ---------------------------------------------------------------------------

// Re-opening a case must not re-burn engine quota, which matters most on a
// 50-case batch where the investigator revisits rows.
const CACHE_TTL_MS = 30 * 60 * 1000;
const memoryCache = new Map();

function cacheKey(anchors, options) {
  return JSON.stringify({
    p: anchors.plates, n: anchors.names, o: anchors.orgs, pl: anchors.places.slice(0, 4),
    d: anchors.dateISO, c: anchors.corridors, m: options.minScore ?? 20, q: options.maxQueries || 8
  });
}

function cacheGet(key) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  memoryCache.set(key, { at: Date.now(), value });
  if (memoryCache.size > 200) memoryCache.delete(memoryCache.keys().next().value);
}

export function clearSearchCache() {
  memoryCache.clear();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute a full evidence search.
 *
 * @param {object} input
 *   input.query        Free-text keywords typed by the investigator.
 *   input.facts        Optional 30-header claim facts (from Excel/PDF).
 *   input.options      { limit, maxQueries, deepScrape, timeoutMs, minScore,
 *                        deepFetch, adaptiveRounds, noCache }
 * @returns {Promise<object>} search bundle
 */
export async function runSearch(input = {}) {
  const started = Date.now();
  const options = input.options || {};
  const facts = input.facts || {};

  // Anchors are derived from the typed keywords AND the parsed claim facts, so
  // an Excel row or a PDF intimation sheet searches exactly as precisely as a
  // hand-typed query would.
  const seedText = [
    input.query || '',
    facts.FIR_cause_narrative || '',
    facts.loss_location || '',
    facts.spot_of_accident || ''
  ].filter(Boolean).join(' ');

  const anchors = extractAnchors(input.query || seedText, facts);
  const deepLinks = buildGoogleDeepLinks(anchors);

  // Additive: the tiered plan below is built exactly as before and is never
  // consulted for these.
  const socialQueries = options.includeSocial === false
    ? []
    : buildSocialQueries(anchors, { maxPerPlatform: options.maxSocialPerPlatform || 3 });

  // An explicit list (from the investigator's edited query console) is executed
  // verbatim; otherwise the tiered planner decides what to run.
  const plan = Array.isArray(input.explicitQueries) && input.explicitQueries.length
    ? input.explicitQueries
      .map((q) => String(q || '').trim())
      .filter((q) => q.length >= 3)
      .slice(0, options.maxQueries || 12)
      .map((q) => ({ query: q, tier: 1, intent: 'Investigator-authored query', engines: ['news', 'web'] }))
    : buildQueryPlan(anchors, {
      maxQueries: options.maxQueries || 8,
      includeVernacular: options.includeVernacular !== false,
      includeVideo: options.includeVideo !== false
    });

  // Nothing searchable was supplied. Say so plainly instead of dispatching
  // queries that cannot match and then reporting a nil digital footprint that
  // was never actually looked for.
  if (!plan.length) {
    return {
      success: true,
      mode: 'insufficient_anchors',
      transport,
      anchors,
      query_plan: [],
      query_executed: [],
      keywords_extracted: [],
      results: [],
      total_results: 0,
      raw_result_count: 0,
      engines_used: [],
      engines_unavailable: [],
      site_search_available: false,
      deep_links: deepLinks,
      errors: [],
      insufficient_anchors: true,
      guidance: 'Supply a registration number, an accident location, a claimant name or an operator name. A date or a claim number on its own cannot be searched against public reporting.',
      timed_out: false,
      execution_time_seconds: Number(((Date.now() - started) / 1000).toFixed(2)),
      ai_summary: buildEvidenceSummary(anchors, [], { live: false, queriesExecuted: [] })
    };
  }

  const key = cacheKey(anchors, options);
  if (!options.noCache) {
    const cached = cacheGet(key);
    if (cached) return { ...cached, from_cache: true };
  }

  const audit = [];
  const record = (pass, queries, raw) => {
    audit.push({
      pass,
      at: new Date().toISOString(),
      queries,
      engines_used: raw.enginesUsed || [],
      engines_unavailable: raw.enginesUnavailable || [],
      raw_results: (raw.results || []).length,
      errors: raw.errors || []
    });
  };

  let raw = { results: [], enginesUsed: [], enginesUnavailable: [], siteSearchAvailable: false, errors: [], elapsedMs: 0, timedOut: false };
  let mode = 'offline';
  let widened = false;
  let roundsRun = 0;

  const chosen = await resolveTransport(plan);

  const dispatch = async (queries, extra = {}) => {
    if (chosen === 'function') return fetchViaFunction(queries, { ...options, ...extra }, anchors);
    if (chosen === 'legacy') {
      return fetchViaLegacy(queries, {
        query: input.query,
        insured_name: facts.insured_name,
        vehicle_no: anchors.plates[0] || facts.vehicle_numbers,
        location: anchors.places[0] || facts.loss_location,
        date_str: anchors.dateISO || facts.accident_date_time,
        incident_keywords: anchors.incidentTerms.join(' ')
      }, options);
    }
    return null;
  };

  const absorb = (next) => {
    if (!next) return;
    raw.results.push(...(next.results || []));
    next.enginesUsed.forEach((e) => { if (!raw.enginesUsed.includes(e)) raw.enginesUsed.push(e); });
    (next.enginesUnavailable || []).forEach((u) => {
      const k = typeof u === 'string' ? u : u.engine;
      if (!raw.enginesUnavailable.some((x) => (typeof x === 'string' ? x : x.engine) === k)) {
        raw.enginesUnavailable.push(u);
      }
    });
    raw.errors.push(...(next.errors || []));
    raw.elapsedMs = Math.max(raw.elapsedMs, next.elapsedMs || 0);
    if (next.siteSearchAvailable) raw.siteSearchAvailable = true;
    if (next.timedOut) raw.timedOut = true;
  };

  const executed = [...plan, ...socialQueries];

  try {
    // Social runs once, on the first pass. Repeating it on the harvest and
    // widening rounds would re-spend SERP credits for the same platform hits.
    const first = await dispatch(plan, { socialQueries });
    if (first) {
      absorb(first);
      record('primary', [...plan, ...socialQueries].map((p) => p.query), first);
      mode = 'live';
      roundsRun = 1;
    }
  } catch (err) {
    raw.errors.push(String(err.message || err));
    // A transport that worked before may be rate-limited now; re-probe next call.
    transport = 'unknown';
    mode = 'offline';
  }

  let ranked = rankAndDedupe(raw.results, anchors, {
    minScore: options.minScore ?? 20,
    limit: options.limit || 60
  });

  // --- Round 2: entity harvest, only when round 1 proved nothing -----------
  const noIdentifierMatch = !ranked.some((r) => r.band === BANDS.CONFIRMED);
  if (mode === 'live' && options.adaptiveRounds !== false && noIdentifierMatch) {
    const harvested = harvestEntities(ranked, anchors);
    const harvestPlan = buildHarvestPlan(harvested, anchors, options.maxQueries || 6);
    if (harvestPlan.length) {
      try {
        const second = await dispatch(harvestPlan);
        if (second) {
          absorb(second);
          record('harvest', harvestPlan.map((p) => p.query), second);
          executed.push(...harvestPlan);
          roundsRun = 2;
          ranked = rankAndDedupe(raw.results, anchors, {
            minScore: options.minScore ?? 20,
            limit: options.limit || 60
          });
        }
      } catch (err) {
        raw.errors.push(`Harvest round failed: ${String(err.message || err)}`);
      }
    }
  }

  // --- Widening ladder: only when there is still nothing at all ------------
  if (mode === 'live' && !ranked.length) {
    const widePlan = buildWideningPlan(anchors, { maxQueries: options.maxQueries || 8 });
    if (widePlan.length) {
      try {
        const third = await dispatch(widePlan);
        if (third) {
          absorb(third);
          record('widening', widePlan.map((p) => p.query), third);
          executed.push(...widePlan);
          widened = true;
          ranked = rankAndDedupe(raw.results, anchors, {
            minScore: Math.max(10, (options.minScore ?? 20) - 10),
            limit: options.limit || 60
          });
        }
      } catch (err) {
        raw.errors.push(`Widening round failed: ${String(err.message || err)}`);
      }
    }
  }

  // --- Deep full-text pass --------------------------------------------------
  if (mode === 'live' && chosen === 'function' && options.deepFetch !== false && ranked.length) {
    ranked = await enrichWithFullText(ranked, anchors, options);
  }

  const socialResults = ranked.filter(isVerifiedSocialResult);
  const bandCounts = ranked.reduce((acc, r) => {
    acc[r.band] = (acc[r.band] || 0) + 1;
    return acc;
  }, {});

  const meta = {
    enginesUsed: raw.enginesUsed,
    queriesExecuted: executed.map((p) => p.query),
    // Wall clock, not the slowest single shard. With the sweep spread over
    // three passes and a dozen parallel invocations, the slowest shard is a
    // small fraction of the time the investigator actually waited, and
    // reporting it as "engine response time" understates the run by an order
    // of magnitude.
    elapsedMs: Date.now() - started,
    slowestShardMs: raw.elapsedMs,
    live: mode === 'live',
    languages: anchors.languages,
    rounds: roundsRun,
    widened
  };

  const bundle = {
    success: true,
    mode,
    transport,
    anchors,
    query_plan: executed,
    social_queries: socialQueries.map((p) => p.query),
    query_executed: executed.map((p) => p.query),
    keywords_extracted: [
      ...anchors.plates,
      ...anchors.names,
      ...anchors.orgs,
      ...anchors.places,
      ...anchors.corridors,
      ...anchors.vehicleTypes,
      ...anchors.incidentTerms
    ].filter(Boolean).slice(0, 24),
    results: ranked,
    total_results: ranked.length,
    band_counts: bandCounts,
    social_counts: {
      facebook: socialResults.filter((r) => r.platform === 'facebook').length,
      instagram: socialResults.filter((r) => r.platform === 'instagram').length
    },
    raw_result_count: raw.results.length,
    engines_used: raw.enginesUsed,
    engines_unavailable: raw.enginesUnavailable || [],
    languages_swept: anchors.languages,
    site_search_available: !!raw.siteSearchAvailable,
    deep_links: deepLinks,
    errors: raw.errors,
    widened,
    rounds_run: roundsRun,
    audit_trail: audit,
    timed_out: raw.timedOut,
    execution_time_seconds: Number(((Date.now() - started) / 1000).toFixed(2)),
    ai_summary: buildEvidenceSummary(anchors, ranked, meta)
  };

  if (!options.noCache && mode === 'live') cacheSet(key, bundle);
  return bundle;
}

/**
 * Build the manual research trail without touching the network. Used to render
 * the Google deep links instantly, before the live search resolves.
 */
export function previewDeepLinks(query, facts = {}) {
  const anchors = extractAnchors(query, facts);
  return { anchors, deepLinks: buildGoogleDeepLinks(anchors) };
}
