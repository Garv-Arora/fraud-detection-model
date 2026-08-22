// ============================================================================
// search-regression.mjs — offline regression suite for the search core
// ----------------------------------------------------------------------------
// Run with `npm test`. No network, no browser: every check exercises the pure
// planning, scoring and de-duplication logic directly.
//
// Each check corresponds to a defect that was observed and reproduced, not to a
// hypothetical. The two that matter most:
//
//   * a long narrative used to anchor its whole query plan on the vehicle make
//     ("Tata"), so a rich case searched for nothing that was actually in it;
//   * two different accidents sharing a generic headline used to be merged into
//     one row and awarded a corroboration bonus for it.
//
// Both are silent failures — the search still returned a confident-looking
// answer — which is why they are pinned here.
// ============================================================================
import {
  extractAnchors, buildQueryPlan, buildWideningPlan, scoreResult, rankAndDedupe,
  scrubQuery, extractCasualtyCount, extractInjuredCount, normaliseDigits,
  parseFlexibleDate, toISO, BANDS, buildSocialQueries, isVerifiedSocialResult
} from '../src/lib/searchIntel.js';
import { buildShards, harvestEntities } from '../src/lib/searchService.js';
import { phoneticEquals, phoneticKey, indicToLatin } from '../src/lib/transliterate.js';
import { __test as fn } from '../netlify/functions/search.mjs';
const { assertFeed } = fn;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; return; }
  fail += 1;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const LONG = 'On 12/08/2026 at around 3 PM the insured vehicle bearing registration RJ14GH9988 a Tata dumper truck was proceeding from Jaipur towards Sikar on NH-52 near Chomu toll plaza when the driver Ramesh Kumar lost control and the vehicle overturned resulting in serious injuries to three persons who were shifted to SMS Hospital Jaipur and an FIR was registered at Chomu Police Station';
const SHORT = 'Jaipur Sikar highway dumper accident';

// -- 1. long-prompt reproduction -------------------------------------------
{
  const a = extractAnchors(LONG, {});
  const plan = buildQueryPlan(a, { maxQueries: 8 });
  const qs = plan.map((p) => p.query).join(' ');
  check('1a places[0] is a real place, not the vehicle make',
    ['Jaipur', 'Chomu', 'Sikar'].includes(a.places[0]), `got ${a.places[0]}`);
  check('1b no query anchored on Tata', !/\bTata\b/.test(qs));
  check('1c claimant extracted from free text', a.names.includes('Ramesh Kumar'), JSON.stringify(a.names));
  check('1d corridor extracted', a.corridors.includes('NH-52'));
  check('1e queries reference the real geography', /Jaipur|Chomu|Sikar/.test(qs));
  check('1f long narrative still produces a tier-1 query', plan.some((p) => p.tier === 1));
  check('1g police station captured', a.policeStation === 'Chomu Police Station', a.policeStation);
  check('1h injury count captured', a.injured === 3, String(a.injured));
  check('1i date parsed day-first', a.dateISO === '2026-08-12', a.dateISO);
}

// -- 2. cross-script scoring ------------------------------------------------
{
  const a = extractAnchors(LONG, {});
  const article = {
    title: 'चौमू टोल प्लाजा के पास डंपर पलटा, तीन घायल',
    snippet: 'जयपुर-सीकर हाईवे पर चौमू के पास एक डंपर पलट गया। हादसे में तीन लोग घायल हो गए।',
    url: 'https://www.bhaskar.com/rajasthan/jaipur/news/chomu-dumper-overturn-123.html',
    domain: 'bhaskar.com',
    publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT'
  };
  const v = scoreResult(article, a);
  check('2a Devanagari article gets location credit',
    v.reasons.some((r) => /location matched/i.test(r)), JSON.stringify(v.reasons));
  check('2b score materially above the old 43', v.score > 60, String(v.score));
  check('2c banded STRONG without an identifier', v.band === BANDS.STRONG, v.band);

  const withBody = { ...article, full_article_text: 'डंपर संख्या RJ14GH9988 पलट गया। चालक रमेश कुमार घायल हुए।' };
  const v2 = scoreResult(withBody, a);
  check('2d full text promotes to CONFIRMED', v2.band === BANDS.CONFIRMED, v2.band);
  check('2e plate matched in body', v2.reasons.some((r) => /RJ14GH9988/.test(r)));
  check('2f Devanagari name matched a Latin anchor',
    v2.reasons.some((r) => /Ramesh Kumar/.test(r)), JSON.stringify(v2.reasons));
}

// -- 3. short/long parity ---------------------------------------------------
{
  const long = buildQueryPlan(extractAnchors(LONG, {}), { maxQueries: 8 });
  const short = buildQueryPlan(extractAnchors(SHORT, {}), { maxQueries: 8 });
  check('3a long prompt yields at least as many queries', long.length >= short.length,
    `${long.length} vs ${short.length}`);
  check('3b long prompt reaches the vernacular tier', long.some((p) => p.tier === 3));
  check('3c short prompt reaches the vernacular tier', short.some((p) => p.tier === 3));
}

// -- 7. edge-case matrix ----------------------------------------------------
{
  const dev = extractAnchors('चौमू टोल प्लाजा के पास डंपर पलटा तीन घायल जयपुर सीकर हाईवे', {});
  check('7a native script yields places', dev.places.length > 0 && dev.places[0] === 'चौमू', JSON.stringify(dev.places.slice(0, 2)));
  check('7b native script yields a vehicle', dev.vehicleTypes.includes('dumper'));
  check('7c native script yields an incident', dev.incidentTerms.includes('overturned'));
  check('7d native script injury count', dev.injured === 3, String(dev.injured));
  check('7e no generic geography as place', !dev.places.some((p) => /टोल|प्लाजा|हाईवे/.test(p)), JSON.stringify(dev.places));

  const rom = extractAnchors('Chomu ke paas dumper palta teen ghayal Jaipur Sikar highway', {});
  check('7f romanised detects overturned', rom.incidentTerms.includes('overturned'));
  check('7g romanised detects injured', rom.incidentTerms.includes('injured'));

  const org = extractAnchors('M/s Sharma Transport Pvt Ltd truck accident', {});
  check('7h company captured as an org', org.orgs.length > 0, JSON.stringify(org.orgs));
  check('7i "Ltd" is not a place', !org.places.some((p) => /^ltd$/i.test(p)), JSON.stringify(org.places));

  const two = extractAnchors('RJ14GH9988 and UP85AT1234 collision Agra', {});
  const twoPlan = buildQueryPlan(two, { maxQueries: 10 }).map((p) => p.query).join(' ');
  check('7j both plates extracted', two.plates.length === 2, JSON.stringify(two.plates));
  check('7k both plates searched', /RJ14GH9988/.test(twoPlan) && /UP85AT1234/.test(twoPlan), twoPlan);

  const dateOnly = extractAnchors('12/08/2026', {});
  check('7l date-only is insufficient', dateOnly.sufficient === false);
  check('7m date-only dispatches nothing', buildQueryPlan(dateOnly, { maxQueries: 6 }).length === 0);

  const plateOnly = extractAnchors('RJ14GH9988', {});
  const plateQs = buildQueryPlan(plateOnly, { maxQueries: 6 }).map((p) => p.query).join(' ');
  check('7n plate-only does not search the whole state', !/Rajasthan/.test(plateQs), plateQs);
  check('7o state kept as a scoring hint', plateOnly.regionHint === 'Rajasthan');

  const nameOnly = extractAnchors('Ramesh Kumar Meena', {});
  check('7p bare name read as a name', nameOnly.names.length > 0, JSON.stringify(nameOnly.names));
  check('7q bare name not also a place', nameOnly.places.length === 0, JSON.stringify(nameOnly.places));

  const ocr = extractAnchors('Cl@im N0: CL26140317 |  RJ14 GH 9988  ||  J@ipur ... dumperr acident', {});
  const ocrQs = buildQueryPlan(ocr, { maxQueries: 6 }).map((p) => p.query).join(' ');
  check('7r OCR noise still finds the plate', ocr.plates.includes('RJ14GH9988'));
  check('7s claim id never dispatched', !/CL26140317/.test(ocrQs), ocrQs);
}

// -- 8. outbound scrubber ---------------------------------------------------
{
  check('8a claim id stripped', !/CL26140317/.test(scrubQuery('Claim No : CL26140317 Jaipur')));
  check('8b mobile stripped', !/9876543210/.test(scrubQuery('contact 9876543210 Jaipur')));
  check('8c PAN stripped', !/ABCDE1234F/.test(scrubQuery('PAN ABCDE1234F Jaipur')));
  check('8d site: operator preserved', scrubQuery('site:youtube.com Chomu') === 'site:youtube.com Chomu',
    scrubQuery('site:youtube.com Chomu'));
  check('8e quoted phrase preserved', scrubQuery('"Ramesh Kumar" accident') === '"Ramesh Kumar" accident',
    scrubQuery('"Ramesh Kumar" accident'));
  check('8f plate survives scrubbing', /RJ14GH9988/.test(scrubQuery('RJ14GH9988 accident')));
}

// -- 9. de-duplication ------------------------------------------------------
{
  const a = extractAnchors(SHORT, {});
  const diff = [
    { title: 'Dumper overturns on Jaipur Sikar highway', url: 'https://bhaskar.com/a/1', domain: 'bhaskar.com', snippet: 'Three injured near Chomu.', publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT' },
    { title: 'Dumper overturns on Jaipur Sikar highway', url: 'https://patrika.com/b/2', domain: 'patrika.com', snippet: 'Two killed near Ringas.', publish_date: 'Mon, 22 Sep 2026 04:00:00 GMT' }
  ];
  const o1 = rankAndDedupe(diff, a, { minScore: 0, limit: 10 });
  check('9a different incidents stay separate', o1.length === 2, String(o1.length));
  check('9b no false corroboration bonus', o1.every((r) => !(r.also_reported_by || []).length));
  check('9c flagged as distinct', o1.every((r) => r.distinct_incident));

  const same = [
    { title: 'Dumper overturns on Jaipur Sikar highway, three injured', url: 'https://bhaskar.com/a/1', domain: 'bhaskar.com', snippet: 'Three injured near Chomu.', publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT' },
    { title: 'Dumper overturns on Jaipur Sikar highway, three injured', url: 'https://patrika.com/b/2', domain: 'patrika.com', snippet: 'Three injured near Chomu.', publish_date: 'Wed, 13 Aug 2026 09:00:00 GMT' }
  ];
  const o2 = rankAndDedupe(same, a, { minScore: 0, limit: 10 });
  check('9d syndicated copies collapse', o2.length === 1, String(o2.length));

  const hiSame = [
    { title: 'डंपर पलटा तीन घायल', url: 'https://bhaskar.com/h/1', domain: 'bhaskar.com', snippet: 'चौमू के पास', publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT' },
    { title: 'डंपर पलटा तीन घायल', url: 'https://jagran.com/h/2', domain: 'jagran.com', snippet: 'चौमू के पास', publish_date: 'Wed, 13 Aug 2026 06:00:00 GMT' }
  ];
  check('9e short Devanagari syndication collapses', rankAndDedupe(hiSame, a, { minScore: 0, limit: 10 }).length === 1);

  const hiDiff = [
    { title: 'डंपर पलटा तीन घायल', url: 'https://bhaskar.com/h/1', domain: 'bhaskar.com', snippet: 'तीन घायल', publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT' },
    { title: 'डंपर पलटा दो मरे', url: 'https://jagran.com/h/2', domain: 'jagran.com', snippet: 'दो मौत', publish_date: 'Mon, 22 Sep 2026 06:00:00 GMT' }
  ];
  check('9f distinct Devanagari incidents stay separate', rankAndDedupe(hiDiff, a, { minScore: 0, limit: 10 }).length === 2);
}

// -- 10. transliteration ----------------------------------------------------
{
  check('10a जयपुर == Jaipur', phoneticEquals('जयपुर', 'Jaipur'));
  check('10b चौमू == Chomu', phoneticEquals('चौमू', 'Chomu'));
  check('10c चित्तौड़गढ़ == Chittorgarh', phoneticEquals('चित्तौड़गढ़', 'Chittorgarh'));
  check('10d Chomu != Chennai', !phoneticEquals('चौमू', 'Chennai'));
  check('10e Jaipur != Jodhpur', !phoneticEquals('Jaipur', 'Jodhpur'));
  check('10f schwa deletion', indicToLatin('जयपुर') === 'jaypur', indicToLatin('जयपुर'));
  check('10g Tamil romanises', indicToLatin('சென்னை') === 'chennai', indicToLatin('சென்னை'));
}

// -- 11. digits and dates ---------------------------------------------------
{
  check('11a Devanagari digits', normaliseDigits('१२') === '12', normaliseDigits('१२'));
  check('11b Tamil digits', normaliseDigits('௫௬') === '56', normaliseDigits('௫௬'));
  check('11c Devanagari date', toISO(parseFlexibleDate('१२/०८/२०२६')) === '2026-08-12');
  check('11d Marathi casualties', extractCasualtyCount('दोन ठार') === 2);
  check('11e reversed injury phrasing', extractInjuredCount('serious injuries to three persons') === 3);
}

// -- 12. sharding and harvesting -------------------------------------------
{
  const a = extractAnchors(LONG, {});
  const plan = buildQueryPlan(a, { maxQueries: 6 });
  const { shards, dropped } = buildShards(plan, a.languages, {});
  const covered = new Set(shards.flatMap((s) => s.queries[0].langs));
  check('12a every language edition covered', covered.size >= 13, `${covered.size}`);
  check('12b exactly one primary shard per query',
    shards.filter((s) => s.primary).length === plan.length, `${shards.filter((s) => s.primary).length}/${plan.length}`);
  check('12c region language rides the primary shard',
    shards[0].queries[0].langs.includes('hi'), shards[0].queries[0].langs.join(','));
  check('12d nothing silently dropped', dropped === 0, String(dropped));

  const harvested = harvestEntities([
    { title: 'Dumper overturns near Govindgarh village', snippet: 'The accident happened near Govindgarh.' },
    { title: 'Three injured as dumper topples at Govindgarh', snippet: 'Police at Govindgarh said so.' }
  ], a);
  check('12e harvests an unsupplied place', harvested.includes('Govindgarh'), JSON.stringify(harvested));

  const wide = buildWideningPlan(a, { maxQueries: 8 });
  check('12f widening plan is non-empty', wide.length > 0);
  check('12g widening drops the date qualifier', !wide.some((p) => /2026-08-12/.test(p.query)));
}

// -- 13. language selection -------------------------------------------------
{
  const mr = extractAnchors('पुणे नाशिक महामार्गावर ट्रक अपघात दोन ठार', {});
  check('13a Marathi detected from vocabulary', mr.languages[1] === 'mr', mr.languages.slice(0, 3).join(','));
  const ta = extractAnchors('சென்னை அருகே லாரி விபத்து மூன்று பலி', {});
  check('13b Tamil detected from vocabulary', ta.languages[1] === 'ta', ta.languages.slice(0, 3).join(','));
  const mrPlan = buildQueryPlan(mr, { maxQueries: 8 }).map((p) => p.query).join(' ');
  check('13c Marathi case queries in Marathi', /अपघात/.test(mrPlan), mrPlan);
}


// -- 14. outbound scrubber, adversarially ----------------------------------
//
// Enumerating identifier formats one at a time leaked nine of twenty: a spaced
// claim number, a 16-digit policy, a slashed policy, a 0-prefixed mobile, a
// GSTIN, a bank account, a VIN and an engine number all walked through. The
// scrubber now protects the tokens that belong in a query and strips the rest,
// which is why both halves of this table matter equally.
{
  const MUST_STRIP = [
    ['claim id', 'Claim No : CL26140317 Chomu accident', 'CL26140317'],
    ['claim id spaced', 'Claim No CL 26140317 Chomu', '26140317'],
    ['policy 16 digit', 'policy 0123456789012345 Chomu', '0123456789012345'],
    ['policy slashed', 'policy 2311/12345678/00/000 Chomu', '12345678'],
    ['aadhaar spaced', 'aadhaar 1234 5678 9012 Chomu', '1234 5678 9012'],
    ['aadhaar solid', 'aadhaar 123456789012 Chomu', '123456789012'],
    ['PAN', 'PAN ABCDE1234F Chomu', 'ABCDE1234F'],
    ['mobile plain', 'call 9876543210 Chomu', '9876543210'],
    ['mobile +91 spaced', 'call +91 98765 43210 Chomu', '98765 43210'],
    ['mobile 0-prefixed', 'call 09876543210 Chomu', '9876543210'],
    ['licence spaced', 'DL RJ14 20190004935 Chomu', '20190004935'],
    ['licence solid', 'DL MH1420110062821 Chomu', 'MH1420110062821'],
    ['GSTIN', 'GST 27AAPFU0939F1ZV Chomu', '27AAPFU0939F1ZV'],
    ['bank account', 'account 12345678901234 Chomu', '12345678901234'],
    ['VIN', 'chassis MA3EWDE1S00123456 Chomu', 'MA3EWDE1S00123456'],
    ['engine no', 'engine G12BN1234567 Chomu', 'G12BN1234567'],
    ['email', 'mail rakesh.kumar@usgi.in Chomu', '@usgi.in']
  ];
  MUST_STRIP.forEach(([label, input, secret]) => {
    check(`14 strips ${label}`, !scrubQuery(input).includes(secret), scrubQuery(input));
  });

  const MUST_KEEP = [
    ['plate solid', 'RJ14GH9988 accident', 'RJ14GH9988'],
    ['plate spaced', '"RJ 14 GH 9988" accident', 'RJ 14 GH 9988'],
    ['plate hyphen', 'RJ-14-GH-9988 accident', 'RJ-14-GH-9988'],
    ['BH series', '22BH1234A accident', '22BH1234A'],
    ['corridor', 'NH-52 Chomu accident', 'NH-52'],
    ['site: operator', 'site:youtube.com Chomu', 'site:youtube.com'],
    ['quoted phrase', '"Ramesh Kumar" accident', '"Ramesh Kumar"'],
    ['ISO date', 'Chomu accident 2026-08-12', '2026-08-12'],
    ['native script', 'चौमू सड़क हादसा', 'चौमू'],
    ['year', 'Chomu accident 2026', '2026'],
    ['casualty figure', 'Chomu 3 killed', '3 killed']
  ];
  MUST_KEEP.forEach(([label, input, keep]) => {
    check(`14 keeps ${label}`, scrubQuery(input).includes(keep), scrubQuery(input));
  });
}

// -- 15. determinism --------------------------------------------------------
// Global regexes carry lastIndex between calls; a leak would make the same
// claim return different anchors on a second run, which an audit trail cannot
// tolerate.
{
  const runs = new Set();
  for (let i = 0; i < 5; i += 1) runs.add(JSON.stringify(extractAnchors(LONG, {})));
  check('15a extractAnchors is deterministic across repeats', runs.size === 1);

  const plans = new Set();
  for (let i = 0; i < 5; i += 1) plans.add(JSON.stringify(buildQueryPlan(extractAnchors(LONG, {}), { maxQueries: 8 })));
  check('15b buildQueryPlan is deterministic across repeats', plans.size === 1);
}

// -- 16. mutation safety ----------------------------------------------------
// runSearch ranks the accumulated results after every pass, and the deep-fetch
// pass re-ranks an already-ranked array. Any in-place mutation would compound
// the corroboration bonus each time round.
{
  const a = extractAnchors(LONG, {});
  const input = [
    { title: 'Dumper overturns near Chomu, three injured', url: 'https://bhaskar.com/1', domain: 'bhaskar.com', snippet: 'Chomu three injured', publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT' },
    { title: 'Dumper overturns near Chomu, three injured', url: 'https://patrika.com/2', domain: 'patrika.com', snippet: 'Chomu three injured', publish_date: 'Wed, 13 Aug 2026 06:00:00 GMT' }
  ];
  const frozen = JSON.stringify(input);
  const r1 = rankAndDedupe(input, a, { minScore: 0, limit: 60 });
  check('16a input array is not mutated', JSON.stringify(input) === frozen);
  const r3 = rankAndDedupe(r1, a, { minScore: 0, limit: 60 });
  check('16b re-ranking does not compound the corroboration bonus',
    r3[0].relevance_score === r1[0].relevance_score, `${r1[0].relevance_score} -> ${r3[0].relevance_score}`);
  check('16c also_reported_by is not duplicated',
    (r3[0].also_reported_by || []).length === (r1[0].also_reported_by || []).length);
}

// -- 17. de-duplication edge cases ------------------------------------------
{
  const a = extractAnchors(SHORT, {});
  const row = (u, d, extra = {}) => ({ title: 'Dumper overturns on Jaipur Sikar highway', url: u, domain: d, snippet: 'x', ...extra });
  check('17a no dates either side collapses',
    rankAndDedupe([row('https://a.com/1', 'a.com'), row('https://b.com/2', 'b.com')], a, { minScore: 0 }).length === 1);
  check('17b one date missing collapses',
    rankAndDedupe([row('https://a.com/1', 'a.com', { publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT' }), row('https://b.com/2', 'b.com')], a, { minScore: 0 }).length === 1);
  check('17c canonical URL folds utm, trailing slash and case',
    rankAndDedupe([
      { title: 'A', url: 'https://a.com/x?utm_source=fb', domain: 'a.com', snippet: 'Chomu accident' },
      { title: 'A', url: 'https://A.com/x/', domain: 'a.com', snippet: 'Chomu accident' }
    ], a, { minScore: 0 }).length === 1);
  check('17d empty input returns empty', rankAndDedupe([], a, { minScore: 0 }).length === 0);
  check('17e malformed rows are skipped', rankAndDedupe([null, undefined, {}, { url: '' }], a, { minScore: 0 }).length === 0);
}

// -- 18. shard cap ----------------------------------------------------------
{
  const a = extractAnchors(LONG, {});
  const plan = buildQueryPlan(a, { maxQueries: 12 });
  const { shards, dropped } = buildShards(plan, a.languages, { maxShards: 6 });
  check('18a cap is respected', shards.length === 6, String(shards.length));
  check('18b dropped shards are counted, never silent', dropped > 0, String(dropped));
  check('18c truncation keeps queries and drops extra editions', shards.every((s) => s.primary));
  const empty = buildShards([], ['en', 'hi'], {});
  check('18d empty plan yields no shards', empty.shards.length === 0 && empty.dropped === 0);
}

// -- 19. structural rejection ------------------------------------------------
{
  const a = extractAnchors(LONG, {});
  const rej = (r) => scoreResult(r, a).rejected === true;
  check('19a classified-ad host rejected', rej({ title: 'Buy dumper truck', url: 'https://olx.in/x', domain: 'olx.in', snippet: 'Chomu Jaipur dumper for sale' }));
  check('19b entertainment rejected', rej({ title: 'Chomu accident song jukebox', url: 'https://youtube.com/watch?v=1', domain: 'youtube.com', snippet: 'full movie' }));
  check('19c social host rejected', rej({ title: 'Chomu accident', url: 'https://instagram.com/p/abc', domain: 'instagram.com', snippet: 'Chomu dumper' }));
  const empty = scoreResult({ title: '', snippet: '', url: 'https://x.in/1', domain: 'x.in' }, a);
  check('19d empty result is BACKGROUND, not a crash', empty.score >= 0 && empty.band === 'BACKGROUND');
}

// -- 20. phonetic matching does not merge distinct places -------------------
// The fuzzy cross-script matcher is the component most able to manufacture
// false evidence, so it is measured against real Indian place names rather
// than spot-checked.
{
  const PLACES = ('Jaipur Jodhpur Jaisalmer Jhalawar Jhunjhunu Bikaner Barmer Bharatpur Bhilwara Bundi Baran '
    + 'Ajmer Alwar Aligarh Amritsar Ahmedabad Agra Aurangabad Amravati Akola Chomu Chennai Chittorgarh '
    + 'Chandigarh Chandrapur Churu Coimbatore Cuttack Dausa Dholpur Dungarpur Dehradun Delhi Dhanbad '
    + 'Ganganagar Gurugram Gwalior Guntur Gorakhpur Gaya Ghaziabad Gandhinagar Govindgarh Hanumangarh '
    + 'Hisar Haridwar Hubli Hyderabad Karauli Kota Kolkata Kanpur Kochi Kolhapur Kurnool Kotputli '
    + 'Ludhiana Lucknow Latur Meerut Mumbai Madurai Mysuru Muzaffarpur Moradabad Mathura Nagaur Nagpur '
    + 'Nashik Noida Nellore Nanded Pali Patna Pune Panipat Prayagraj Patiala Phagi Rajsamand Ranchi '
    + 'Raipur Rajkot Rohtak Ratlam Rewari Ringas Sikar Sirohi Surat Solapur Salem Srinagar Sirsa Shahpura '
    + 'Tonk Thane Tiruppur Tirupati Trichy Udaipur Ujjain Udupi Varanasi Vadodara Vijayawada Vellore Warangal').split(' ');

  const keyCounts = new Map();
  PLACES.forEach((p) => {
    const k = phoneticKey(p);
    keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
  });
  check('20a no phonetic key collisions among real place names',
    [...keyCounts.values()].every((n) => n === 1));

  let falseUnifications = 0;
  for (let i = 0; i < PLACES.length; i += 1) {
    for (let j = i + 1; j < PLACES.length; j += 1) {
      if (phoneticEquals(PLACES[i], PLACES[j])) falseUnifications += 1;
    }
  }
  check('20b no distinct places are phonetically unified', falseUnifications === 0, String(falseUnifications));
}

// -- 21. performance guards --------------------------------------------------
// Both of these were real stalls. Ranking sixty results with body text took 26
// seconds — 68 with a dozen place anchors — because the phonetic matcher
// re-tokenised each article once per anchor; and extractAnchors was quadratic
// in document length because the place scanner sliced the whole prefix on every
// match. The thresholds are deliberately loose: they exist to catch a
// reintroduced blow-up, not to police milliseconds on a slower machine.
{
  const bigDoc = LONG.repeat(260); // ~96KB, the size of a scanned FIR text layer
  let t = Date.now();
  extractAnchors(bigDoc, {});
  const bigMs = Date.now() - t;
  check('21a extractAnchors stays linear on a 96KB document', bigMs < 600, `${bigMs}ms`);

  const a = extractAnchors(LONG, {});
  const body = 'जयपुर सीकर हाईवे पर चौमू के पास डंपर पलट गया घायल पुलिस अस्पताल '.repeat(200);
  const article = {
    title: 'चौमू के पास डंपर पलटा',
    snippet: 'तीन घायल',
    url: 'https://bhaskar.com/rajasthan/jaipur/chomu-dumper-1.html',
    domain: 'bhaskar.com',
    publish_date: 'Wed, 13 Aug 2026 04:00:00 GMT',
    full_article_text: body
  };
  const many = Array.from({ length: 60 }, (_, i) => ({
    ...article,
    url: `https://bhaskar.com/rajasthan/jaipur/s-${i}.html`,
    title: `चौमू के पास डंपर पलटा ${i}`
  }));
  t = Date.now();
  rankAndDedupe(many, a, { minScore: 0, limit: 60 });
  const rankMs = Date.now() - t;
  check('21b ranking 60 results with full body text stays under 5s', rankMs < 5000, `${rankMs}ms`);
}


// -- 22. the relevance floor must actually filter ---------------------------
// `keepBackground` defaulted to true and was OR'd into the filter, which made
// the floor dead code: a zero-scoring air-fryer recipe — returned live by an
// engine that ignored a `site:` operator — sat in the evidence list alongside
// real reports. Showing every band is not the same as showing every response.
{
  const a = extractAnchors('Jaipur Sikar accident', {});
  const mixed = [
    { title: 'Quick and Easy Air Fryer Nachos', url: 'https://allrecipes.com/x', domain: 'allrecipes.com', snippet: 'nachos recipe' },
    { title: 'Air Fryer Nachos', url: 'https://simply-delicious-food.com/y', domain: 'simply-delicious-food.com', snippet: 'nachos' },
    { title: '3 dead in Jaipur Sikar highway crash', url: 'https://bhaskar.com/rajasthan/jaipur/z.html', domain: 'bhaskar.com', snippet: 'Three killed on the Jaipur Sikar highway' }
  ];
  const kept = rankAndDedupe(mixed, a, { minScore: 20, limit: 20 });
  check('22a irrelevant results are dropped by the floor', kept.length === 1, `kept ${kept.length}`);
  check('22b the genuine report survives', kept[0] && kept[0].domain === 'bhaskar.com');
  // A floor of 0 admits everything the scorer did not reject outright. The
  // first recipe is rejected before scoring by the commercial-content rule,
  // which is a separate mechanism from the floor and should stay that way.
  check('22c floor of 0 admits everything not structurally rejected',
    rankAndDedupe(mixed, a, { minScore: 0, limit: 20 }).length === 2,
    String(rankAndDedupe(mixed, a, { minScore: 0, limit: 20 }).length));
  check('22d commercial content is rejected regardless of the floor',
    scoreResult(mixed[0], a).rejected === true);
}

// -- 23. a throttled feed is never reported as an empty one -----------------
// Google News answers a throttled request with a 302 to a consent page, and
// fetch follows it: the engine then returns HTTP 200 with an empty or HTML
// body. Parsing that yields zero items, which is indistinguishable from
// "nothing matched" unless the non-feed response is raised as an error.
{
  const res200 = { status: 200, redirected: false };
  const resRedir = { status: 200, redirected: true };
  const throws = (body, res) => {
    try { assertFeed(body, 'Google News (Marathi)', res); return false; } catch { return true; }
  };
  check('23a empty body is an error, not an empty result', throws('', res200));
  check('23b whitespace body is an error', throws('   \n  ', res200));
  check('23c consent HTML after a redirect is an error', throws('<!doctype html><html><body>consent</body></html>', resRedir));
  check('23d a real feed with items passes',
    !throws('<?xml version="1.0"?><rss version="2.0"><channel><item><title>x</title></channel></rss>', res200));
  check('23e a real feed with zero items still passes',
    !throws('<?xml version="1.0"?><rss version="2.0"><channel><title>Search</title></channel></rss>', res200));
}


// -- 24. real client spreadsheet ---------------------------------------------
//
// Modelled on an actual claims sheet: seven columns, no registration number, no
// claim id — just a make, a driver, a date, a written location, a police
// station and a free-text cause. Every check below is a defect that sheet
// exposed, and each one silently crippled the search rather than failing.
{
  // Row shapes as clientExcelParser produces them.
  const ROWS = [
    {
      label: 'Dakshina Kannada',
      facts: {
        vehicle_make: 'AutoRiksha', driver_name: 'Hanif Bannur,',
        accident_date_time: '2025-11-02',
        loss_location: 'Parpunja Koilattadka, Puttur taluk, Dakshina Kannada district.',
        police_station_district: 'Puttur Rural Police',
        FIR_cause_narrative: 'car collided with an autorickshaw in Parpunja Koilattadka,'
      }
    },
    {
      label: 'Akola-Amravati',
      facts: {
        driver_name: 'Kishor Babulal Kakani', accident_date_time: '2026-08-18',
        loss_location: 'Akola-Amravati highway', police_station_district: 'Loni Police Statipn',
        FIR_cause_narrative: 'speeding truck crossed the road divider and hit the car.'
      }
    },
    {
      label: 'Ratlam',
      facts: {
        accident_date_time: '2025-11-14', loss_location: 'Ratlam Disctrict, Madhya Pradesh',
        FIR_cause_narrative: 'Car fell into ditch'
      }
    },
    {
      label: 'Ujjain-Indore',
      facts: {
        driver_name: 'Gopal Das Soni', accident_date_time: '2026-08-17',
        loss_location: 'Ujjain-Indore highway,', police_station_district: 'Panth Piplai'
      }
    }
  ];

  const anchors = ROWS.map((r) => extractAnchors('', r.facts));
  const [dk, akola, ratlam, ujjain] = anchors;

  // Every row must be searchable. A claim with a location and a date and
  // nothing else is the common case, not the exception.
  ROWS.forEach((r, i) => {
    check(`24a ${r.label} is searchable`, anchors[i].sufficient);
    check(`24b ${r.label} produces queries`, buildQueryPlan(anchors[i], { maxQueries: 6 }).length > 0);
  });

  // Administrative words and the registry's own typos are not part of a place
  // name. "Ratlam Disctrict" as a search term matches nothing at all.
  check('24c district suffix stripped', ratlam.places.includes('Ratlam'), JSON.stringify(ratlam.places));
  check('24d misspelt "Disctrict" also stripped',
    !ratlam.places.some((p) => /disctrict/i.test(p)), JSON.stringify(ratlam.places));
  check('24e taluk suffix stripped', dk.places.includes('Puttur'), JSON.stringify(dk.places));

  // A police-station column names a jurisdiction, not the accident spot.
  check('24f police station captured as its own anchor',
    dk.policeStation === 'Puttur Rural Police', dk.policeStation);
  check('24g police station is not a place anchor',
    !dk.places.some((p) => /police/i.test(p)), JSON.stringify(dk.places));
  check('24h misspelt "Statipn" does not become a place',
    !akola.places.some((p) => /statipn/i.test(p)), JSON.stringify(akola.places));

  // A corridor named by its endpoints also names two towns. Without this the
  // live run returned exactly the right articles and could only rank them
  // BACKGROUND, because no report writes "Ujjain-Indore highway".
  check('24i corridor keeps its full form', ujjain.places[0] === 'Ujjain-Indore highway', ujjain.places[0]);
  check('24j corridor yields both endpoints',
    ujjain.places.includes('Ujjain') && ujjain.places.includes('Indore'), JSON.stringify(ujjain.places));

  // Language follows the written location when there is no plate to read it
  // from. A Dakshina Kannada accident is reported in Kannada.
  check('24k Kannada inferred from the district', dk.languages[1] === 'kn', dk.languages.slice(0, 3).join(','));
  check('24l Marathi inferred from Akola', akola.languages[1] === 'mr', akola.languages.slice(0, 3).join(','));
  check('24m vernacular queries use the inferred language',
    buildQueryPlan(dk, { maxQueries: 8 }).some((p) => /ಅಪಘಾತ/.test(p.query)),
    buildQueryPlan(dk, { maxQueries: 8 }).map((q) => q.query).join(' | '));

  // Free-text narrative still contributes vehicle and incident vocabulary.
  check('24n narrative yields a vehicle', dk.vehicleTypes.includes('car'));
  check('24o narrative yields an incident', ratlam.incidentTerms.includes('fell'), JSON.stringify(ratlam.incidentTerms));

  // The driver name is quoted as a phrase so the engines treat it as one.
  check('24p named party searched as a phrase',
    buildQueryPlan(ujjain, { maxQueries: 8 }).some((p) => p.query.includes('"Gopal Das Soni"')));
}

// -- 25. spreadsheet dates are calendar dates -------------------------------
//
// xlsx (cellDates) converts a serial by subtracting the timezone offset and
// lands ten seconds short of local midnight: a cell displaying 11/2/25 arrives
// as "Nov 01 23:59:50" local. Formatting that through toISOString() then
// converts to UTC and loses another 5h30 in India. Both together re-dated every
// claim in the sheet by a day, which silently shifts the whole T-1..T+3
// publication window the scoring depends on.
{
  const cell = (y, m, d, h = 23, mi = 59, sec = 50) => new Date(y, m - 1, d, h, mi, sec);

  // The xlsx artifact: ten seconds before the target day.
  check('25a near-midnight artifact rounds to the intended day',
    toISO(parseFlexibleDate(cell(2025, 11, 1))) === '2025-11-02',
    toISO(parseFlexibleDate(cell(2025, 11, 1))));
  check('25b second artifact case',
    toISO(parseFlexibleDate(cell(2026, 8, 17))) === '2026-08-18',
    toISO(parseFlexibleDate(cell(2026, 8, 17))));

  // An exact local midnight is already the right day and must not move.
  check('25c exact local midnight is unchanged',
    toISO(parseFlexibleDate(new Date(2026, 7, 18, 0, 0, 0))) === '2026-08-18',
    toISO(parseFlexibleDate(new Date(2026, 7, 18, 0, 0, 0))));

  // A real time of day is left alone — the correction window is five minutes.
  check('25d a genuine midday timestamp keeps its day',
    toISO(parseFlexibleDate(new Date(2026, 7, 18, 14, 30, 0))) === '2026-08-18',
    toISO(parseFlexibleDate(new Date(2026, 7, 18, 14, 30, 0))));

  // Excel serials, which is what the sheet actually stores, were already right.
  check('25e excel serial unchanged', toISO(parseFlexibleDate('45963')) === '2025-11-02',
    toISO(parseFlexibleDate('45963')));
}


// -- 26. social query generation --------------------------------------------
//
// Facebook and Instagram discovery is additive. The tiered plan is the existing,
// tested behaviour, so these queries live in their own builder and must never
// be able to displace one of its entries.
{
  const a = extractAnchors('', {
    driver_name: 'Dhirendra Rawat', accident_date_time: '2025-11-23',
    loss_location: 'Kotdwar, Pauri Garhwal', vehicle_types: 'Dumper',
    FIR_cause_narrative: 'Vehicle fell into gorge'
  });
  const social = buildSocialQueries(a, { maxPerPlatform: 3 });
  const main = buildQueryPlan(a, { maxQueries: 8 });

  check('26a social queries are produced', social.length > 0, String(social.length));
  check('26b both platforms are covered',
    social.some((q) => /site:facebook\.com/.test(q.query)) && social.some((q) => /site:instagram\.com/.test(q.query)));
  check('26c every social query is routed to the social engine',
    social.every((q) => q.engines.length === 1 && q.engines[0] === 'social'));
  check('26d per-platform cap respected',
    social.filter((q) => /facebook/.test(q.query)).length <= 3);
  check('26e the named party is quoted so engines treat it as a phrase',
    social.some((q) => q.query.includes('"Dhirendra Rawat"')));
  check('26f queries are focused, not one query with every field',
    social.every((q) => q.query.split(/\s+/).length <= 8),
    social.map((q) => q.query).join(' | '));

  // The existing plan must be untouched by any of this.
  check('26g no social query leaks into the tiered plan',
    !main.some((p) => /facebook|instagram/i.test(p.query)));
  check('26h the tiered plan is unchanged in shape', main.length > 0 && main.some((p) => p.tier === 1));

  // Nothing searchable means nothing dispatched, on the social side too.
  check('26i insufficient anchors produce no social queries',
    buildSocialQueries(extractAnchors('12/08/2026', {}), {}).length === 0);
  check('26j social queries carry no internal identifiers',
    buildSocialQueries(extractAnchors('', {
      claim_id: 'CL26140317', insured_contact_no: '9876543210',
      loss_location: 'Kotdwar', FIR_cause_narrative: 'accident'
    }), {}).every((q) => !/CL26140317|9876543210/.test(q.query)));
}

// -- 27. platform classification --------------------------------------------
//
// A platform label asserts that a post exists at that address, so it is decided
// from the host of the URL the provider returned and from nothing else. It is
// never inferred from the query that was asked, and no social URL is ever built.
{
  const { platformOf, isSocialIndexPage, isBrowsableUrl, toSerperResult } = fn;

  check('27a facebook post classified', platformOf('https://www.facebook.com/WIONews/posts/abc') === 'facebook');
  check('27b instagram post classified', platformOf('https://www.instagram.com/p/ABC123/') === 'instagram');
  check('27c mobile host classified', platformOf('https://m.facebook.com/story.php?id=1') === 'facebook');
  check('27d fb.watch classified', platformOf('https://fb.watch/xyz/') === 'facebook');
  check('27e a news site is not a platform', platformOf('https://timesofindia.indiatimes.com/x') === null);
  check('27f a lookalike host is not the platform',
    platformOf('https://facebook.com.attacker.example/p/1') === null);
  check('27g userinfo spoof is not the platform',
    platformOf('https://facebook.com@evil.example/p/1') === null);
  check('27h garbage yields no platform', platformOf('not a url') === null);

  // Profile and hashtag indexes carry no incident content.
  check('27i platform homepage rejected', isSocialIndexPage('https://www.facebook.com/') === true);
  check('27j hashtag index rejected', isSocialIndexPage('https://www.instagram.com/explore/tags/x/') === true);
  check('27k "popular" index rejected', isSocialIndexPage('https://www.instagram.com/popular/kotdwar-news/') === true);
  check('27l a real reel is kept', isSocialIndexPage('https://www.instagram.com/reel/DaphU7agGO6/') === false);
  check('27m a real post is kept', isSocialIndexPage('https://www.facebook.com/TimesofIndia/posts/abc') === false);
  check('27n /watch with a video id is kept', isSocialIndexPage('https://www.facebook.com/watch/?v=12345') === false);

  // Every result URL is rendered as a clickable href, so only browsable schemes
  // may survive the mapper.
  check('27o https is browsable', isBrowsableUrl('https://www.facebook.com/a/posts/b') === true);
  ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '//evil.example/x', '', null]
    .forEach((u) => check(`27p dangerous scheme rejected: ${String(u).slice(0, 18)}`, isBrowsableUrl(u) === false));
  check('27q a hostile link is dropped entirely by the mapper',
    toSerperResult({ title: 'x', link: 'javascript:alert(1)' }, 'q', 'Serper social').url === '');

  // Malformed provider payloads must not throw.
  [null, undefined, {}, { link: null }, { title: {}, link: 'https://www.instagram.com/p/A/' }]
    .forEach((raw, i) => {
      let threw = false;
      try { toSerperResult(raw || {}, 'q', 'Serper social'); } catch { threw = true; }
      check(`27r malformed payload ${i} does not throw`, !threw);
    });
}

// -- 28. social results are admitted only on a keyed provider's word ---------
//
// The default remains rejection. An anonymous engine returns login walls for
// these hosts, and a login wall in a fraud file is worse than nothing — so a
// social URL is evidence only when a keyed SERP index vouched for it.
{
  const a = extractAnchors('Kotdwar dumper gorge accident', {});
  const post = (over = {}) => ({
    title: 'Dumper falls into gorge near Kotdwar, driver dead',
    snippet: 'A dumper fell into a gorge near Kotdwar on Sunday.',
    url: 'https://www.facebook.com/IndiaToday/posts/dumper-gorge-kotdwar',
    domain: 'facebook.com', platform: 'facebook', source_type: 'social_media',
    engine: 'Serper social', ...over
  });

  check('28a a keyed provider result is admitted', scoreResult(post(), a).rejected === false);
  check('28b the same URL from a scraped engine is still rejected',
    scoreResult(post({ engine: 'Bing Web' }), a).rejected === true);
  check('28c a social URL without the social flags is still rejected',
    scoreResult(post({ source_type: 'web', platform: null }), a).rejected === true);
  // A record asserting a platform while pointing elsewhere is not evidence of a
  // post. It is not rejected outright — as a web page it may still be relevant —
  // but it must never be treated, ranked or badged as social evidence.
  check('28d a platform claim on a non-platform host is not social evidence',
    isVerifiedSocialResult(post({ url: 'https://evil.example/p/1' })) === false);
  check('28e isVerifiedSocialResult agrees with the gate',
    isVerifiedSocialResult(post()) === true && isVerifiedSocialResult(post({ engine: 'Mojeek' })) === false);
}

// -- 29. a name on a social post is weak identification ---------------------
//
// Google builds a social snippet from the post text AND its comment thread, so
// a claimant's name in a snippet is often just someone who commented. Measured
// live: a walk-in-interview job advert came back as a CONFIRMED person match on
// a road-accident claim, purely because the claimant had reacted to it.
{
  const a = extractAnchors('', {
    driver_name: 'Dhirendra Rawat', loss_location: 'Kotdwar, Pauri Garhwal',
    accident_date_time: '2025-11-23', FIR_cause_narrative: 'Vehicle fell into gorge'
  });

  const jobAd = {
    title: 'The walk-in interview advertisement',
    snippet: '... accidents, and rotational night/Sunday/holiday ... Dhirendra Rawat and 14 others. 15 reactions ·. 34 ... 4-5 Year location Kotdwar. 24. QA Assistant ...',
    url: 'https://www.facebook.com/Jkdap/posts/the-walk-in-interview-advertisement',
    domain: 'facebook.com', platform: 'facebook', source_type: 'social_media', engine: 'Serper social'
  };
  const v = scoreResult(jobAd, a);
  check('29a an unrelated social post is never CONFIRMED', v.band !== 'CONFIRMED', v.band);
  check('29b the commenter name does not count as the claimant',
    v.matchedFields.person === false, JSON.stringify(v.matchedFields));
  check('29c it does not present as strong evidence', v.score < 50, String(v.score));

  // A registration number is unambiguous wherever it appears, so it still
  // carries a social post to CONFIRMED.
  const withPlate = extractAnchors('', { vehicle_numbers: 'UK15CA1234', loss_location: 'Kotdwar' });
  const platePost = {
    title: 'Dumper UK15CA1234 falls into gorge at Kotdwar',
    snippet: 'The vehicle UK15CA1234 went off the road near Kotdwar.',
    url: 'https://www.facebook.com/news/posts/uk15ca1234-gorge',
    domain: 'facebook.com', platform: 'facebook', source_type: 'social_media', engine: 'Serper social'
  };
  check('29d a plate on a social post still reaches CONFIRMED',
    scoreResult(platePost, withPlate).band === 'CONFIRMED', scoreResult(platePost, withPlate).band);

  // The same name in the post's own title is legitimate identification, but
  // still capped below CONFIRMED because the platform cannot distinguish a
  // subject from an author.
  const titled = { ...jobAd, title: 'Dhirendra Rawat killed as dumper falls into gorge at Kotdwar', snippet: 'Kotdwar accident.' };
  const tv = scoreResult(titled, a);
  check('29e a name in the post title is matched', tv.matchedFields.person === true);
  check('29f but a social name still never reaches CONFIRMED', tv.band !== 'CONFIRMED', tv.band);
  check('29g the cap is explained to the investigator',
    tv.reasons.some((r) => /commenter rather than a party/i.test(r)));
}

// -- 30. social results reuse the existing dedup and ranking ----------------
{
  const a = extractAnchors('Kotdwar dumper gorge accident', {});
  const mk = (url, title) => ({
    title, snippet: 'A dumper fell into a gorge near Kotdwar.', url,
    domain: 'facebook.com', platform: 'facebook', source_type: 'social_media', engine: 'Serper social'
  });

  // The same post reached by three different social queries.
  const dupes = [
    mk('https://www.facebook.com/IndiaToday/posts/gorge-kotdwar', 'Dumper falls into gorge at Kotdwar'),
    mk('https://www.facebook.com/IndiaToday/posts/gorge-kotdwar?utm_source=fb', 'Dumper falls into gorge at Kotdwar'),
    mk('https://www.facebook.com/IndiaToday/posts/gorge-kotdwar/', 'Dumper falls into gorge at Kotdwar')
  ];
  const out = rankAndDedupe(dupes, a, { minScore: 0, limit: 20 });
  check('30a the same social post appears once', out.length === 1, `kept ${out.length}`);

  // Existing news behaviour must be untouched when social sits alongside it.
  const mixed = [
    ...dupes,
    { title: 'Dumper falls into gorge in Pauri, driver killed', snippet: 'Kotdwar dumper gorge accident.', url: 'https://timesofindia.indiatimes.com/city/dehradun/a.html', domain: 'timesofindia.indiatimes.com', publish_date: 'Mon, 24 Nov 2025 04:00:00 GMT' },
    { title: 'Dumper falls into gorge in Pauri, driver killed', snippet: 'Kotdwar dumper gorge accident.', url: 'https://hindustantimes.com/b.html', domain: 'hindustantimes.com', publish_date: 'Mon, 24 Nov 2025 06:00:00 GMT' }
  ];
  const both = rankAndDedupe(mixed, a, { minScore: 0, limit: 20 });
  check('30b news syndication still collapses alongside social',
    both.filter((r) => !isVerifiedSocialResult(r)).length === 1);
  check('30c social and news coexist in one ranked list',
    both.some(isVerifiedSocialResult) && both.some((r) => !isVerifiedSocialResult(r)));
  check('30d every ranked url is unique',
    both.map((r) => r.url).length === new Set(both.map((r) => r.url)).size);
  check('30e matched fields are reported for the card',
    both.every((r) => r.matched_fields && typeof r.matched_fields.location === 'boolean'));
}


// -- 31. social searches what the investigation searches --------------------
//
// The social builder used to carry its own short list of angles. It searched
// three while the tiered plan searched eight, and the ones it skipped were the
// productive ones: on a real Kotdwar claim the two best social hits were both
// Hindi posts, and the builder had no vernacular angle at all. It now derives
// from the plan, so anything the planner learns to search, social searches too.
{
  const a = extractAnchors('', {
    driver_name: 'Dhirendra Rawat', accident_date_time: '2025-11-23',
    loss_location: 'Kotdwar, Pauri Garhwal', vehicle_types: 'Dumper',
    FIR_cause_narrative: 'Vehicle fell into gorge'
  });
  const social = buildSocialQueries(a, {});
  const bare = social.map((q) => q.query.replace(/^site:\S+\s+/, ''));
  const plan = buildQueryPlan(a, { maxQueries: 10 }).map((p) => p.query);

  check('31a social queries are drawn from the tiered plan',
    bare.every((q) => plan.includes(q)), bare.filter((q) => !plan.includes(q)).join(' | '));
  check('31b the vernacular tier reaches social',
    social.some((q) => /[ऀ-ॿ]/.test(q.query)), bare.join(' | '));
  check('31c the location angle reaches social', bare.some((q) => /Kotdwar/.test(q)));
  check('31d the named party reaches social', bare.some((q) => /"Dhirendra Rawat"/.test(q)));
  check('31e both platforms get the same angle set',
    social.filter((q) => /facebook/.test(q.query)).length === social.filter((q) => /instagram/.test(q.query)).length);
  check('31f a video-tier site: query is never nested inside another site:',
    social.every((q) => (q.query.match(/site:/g) || []).length === 1), social.map((q) => q.query).join(' | '));

  // A plate is the strongest social angle there is, so it leads when present.
  const plated = extractAnchors('', { vehicle_numbers: 'UK15CA1234', loss_location: 'Kotdwar', FIR_cause_narrative: 'accident' });
  check('31g a registration number leads the social sweep',
    buildSocialQueries(plated, {}).some((q) => /UK15CA1234/.test(q.query)));

  // The tiered plan itself must still be untouched by any of this.
  check('31h the tiered plan carries no social query',
    !buildQueryPlan(a, { maxQueries: 8 }).some((p) => /facebook|instagram/i.test(p.query)));
}

// -- 32. social results must correspond to the case ------------------------
//
// A `site:` query returns whatever the platform holds near those words, and a
// town name sits on every jeweller, school and hiring post in the town. On a
// real Kotdwar claim 52 social results came back and 37 were shop fronts, job
// adverts and tourism reels whose only connection was the word "Kotdwar".
{
  const a = extractAnchors('', {
    loss_location: 'Kotdwar', vehicle_types: 'Dumper', FIR_cause_narrative: 'fell into gorge'
  });
  const soc = (title, snippet) => ({
    title, snippet, url: `https://www.facebook.com/n/posts/${title.length}`,
    domain: 'facebook.com', platform: 'facebook', source_type: 'social_media', engine: 'Serper social'
  });

  check('32a a post about the incident at the place is kept',
    scoreResult(soc('Dumper falls into gorge at Kotdwar', 'A dumper fell into a gorge near Kotdwar.'), a).rejected === false);
  check('32b a shop front in the same town is rejected',
    scoreResult(soc('KING Jewellers #Kotdwar Jhanda Chowk', 'oldest jewellers in Kotdwar'), a).rejected === true);
  check('32c a hiring post in the same town is rejected',
    scoreResult(soc('Urgent hiring Assistant Manager HR', 'location Kotdwar 4-5 year experience'), a).rejected === true);
  check('32d a tourism reel in the same town is rejected',
    scoreResult(soc('Kotdwar dugada deer', '#beargrills #uttrakhand #kotdwar'), a).rejected === true);
  check('32e the same incident in a different town is rejected',
    scoreResult(soc('Bus falls into gorge in Nashik', 'A bus fell into a gorge in Nashik.'), a).rejected === true);

  // The rule is social-only: a news page is a publisher and keeps its latitude.
  const news = {
    title: 'Kotdwar civic news roundup', snippet: 'Municipal notices from Kotdwar.',
    url: 'https://timesofindia.indiatimes.com/kotdwar.html', domain: 'timesofindia.indiatimes.com'
  };
  check('32f news is not subject to the social correspondence rule',
    scoreResult(news, a).rejected === false);
}

// -- 33. the case's own incident vocabulary counts --------------------------
//
// The generic road-incident list does not contain "gorge" or "fell", so a
// report headlined "Dumper falls into gorge at Kotdwar" was taking the -20
// "no road-incident vocabulary" penalty for describing precisely the reported
// event. A term the claim itself anchors on is incident vocabulary for that
// claim.
{
  const a = extractAnchors('', {
    loss_location: 'Kotdwar', vehicle_types: 'Dumper', FIR_cause_narrative: 'vehicle fell into gorge'
  });
  const r = {
    title: 'Dumper falls into gorge at Kotdwar', snippet: 'A dumper fell into a gorge near Kotdwar.',
    url: 'https://timesofindia.indiatimes.com/a.html', domain: 'timesofindia.indiatimes.com'
  };
  const v = scoreResult(r, a);
  check('33a the case incident term is recognised',
    !v.reasons.some((x) => /No road-incident vocabulary/i.test(x)), JSON.stringify(v.reasons));
  check('33b it is credited as an incident match', v.matchedFields.incident === true);
  check('33c and no longer takes the penalty', v.score > 25, String(v.score));

  // A page with neither generic nor case-specific incident words still does.
  const off = { title: 'Kotdwar municipal budget approved', snippet: 'The council approved the budget.', url: 'https://x.in/a', domain: 'x.in' };
  check('33d an unrelated page still takes the penalty',
    scoreResult(off, a).reasons.some((x) => /No road-incident vocabulary/i.test(x)));
}

// -- 34. an uncomparable date does not cap a social post -------------------
//
// The platforms do not expose a publication date to the index, so a social
// result almost never carries one. Requiring date alignment anyway capped every
// social result at BACKGROUND on any dated claim, however precisely it matched.
// Scoped to social: a news page without a date keeps its existing conservative
// treatment.
{
  const a = extractAnchors('', {
    loss_location: 'Kotdwar', vehicle_types: 'Dumper',
    accident_date_time: '2025-11-23', FIR_cause_narrative: 'fell into gorge'
  });
  const body = { title: 'Dumper falls into gorge near Kotdwar', snippet: 'A dumper fell into a gorge near Kotdwar.' };
  const socialNoDate = { ...body, url: 'https://www.facebook.com/n/posts/a', domain: 'facebook.com', platform: 'facebook', source_type: 'social_media', engine: 'Serper social', publish_date: null };
  const newsNoDate = { ...body, url: 'https://timesofindia.indiatimes.com/a.html', domain: 'timesofindia.indiatimes.com', publish_date: null };
  const newsOnDate = { ...newsNoDate, publish_date: 'Mon, 24 Nov 2025 04:00:00 GMT' };
  const newsFarDate = { ...newsNoDate, publish_date: 'Mon, 24 Mar 2024 04:00:00 GMT' };

  check('34a an undated social post can reach STRONG',
    scoreResult(socialNoDate, a).band === 'STRONG', scoreResult(socialNoDate, a).band);
  check('34b existing news banding on-date is unchanged',
    scoreResult(newsOnDate, a).band === 'STRONG');
  check('34c existing news banding far-from-date is unchanged',
    scoreResult(newsFarDate, a).band === 'BACKGROUND');
  check('34d an undated NEWS page keeps its conservative band',
    scoreResult(newsNoDate, a).band === 'BACKGROUND', scoreResult(newsNoDate, a).band);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL  ${f}`));
  process.exit(1);
}
console.log('ALL GREEN');
