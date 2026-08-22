// ============================================================================
// searchIntel.js — Universal Sompo RCU Search Intelligence Core
// ----------------------------------------------------------------------------
// Pure, deterministic, data-driven search intelligence. There is NO hardcoded
// case knowledge in this file: every anchor, query and score is derived from
// the text the investigator actually supplied (typed keywords, or facts parsed
// out of an Excel row / PDF intimation sheet).
//
// Exports:
//   extractAnchors(text, structured)  -> anchor bundle (plates, names, places…)
//   buildQueryPlan(anchors, options)  -> tiered engine queries (what we execute)
//   distillQuery(anchors)             -> one compact query from a long narrative
//   scoreResult(result, anchors)      -> 0..100 relevance + band + explanation
//   rankAndDedupe(results, anchors)   -> sorted, de-duplicated result list
//
// Script handling lives in transliterate.js and the language vocabulary in
// vernacular.js; both are pure and dependency-free for the same reason.
// ============================================================================

import {
  indicToLatin, hasIndic, latinToIndic, phoneticKey, withinOneEdit, romanVariants
} from './transliterate.js';
import {
  VERNACULAR_TERMS, HINDI_TERMS as HINDI_TERMS_TABLE, NATIVE_TO_CANON, NATIVE_TO_LANG,
  NATIVE_NUMBERS, VEHICLE_CANON, ROMANISED_TERMS, ROMANISED_NUMBERS,
  LANGUAGES_FOR_STATE, orderLanguages, languagesForPlaces, termsFor, SUPPORTED_LANGS
} from './vernacular.js';

export { VERNACULAR_TERMS, orderLanguages, termsFor, SUPPORTED_LANGS, LANGUAGES_FOR_STATE };

// ---------------------------------------------------------------------------
// 1. Reference data
// ---------------------------------------------------------------------------

// Indian state / UT codes used by RTO registration plates -> region names.
export const RTO_STATE_CODES = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CG: 'Chhattisgarh', CH: 'Chandigarh', DD: 'Daman and Diu', DL: 'Delhi',
  DN: 'Dadra and Nagar Haveli', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh',
  HR: 'Haryana', JH: 'Jharkhand', JK: 'Jammu and Kashmir', KA: 'Karnataka',
  KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MH: 'Maharashtra',
  ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh', MZ: 'Mizoram',
  NL: 'Nagaland', OD: 'Odisha', OR: 'Odisha', PB: 'Punjab', PY: 'Puducherry',
  RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TR: 'Tripura',
  TS: 'Telangana', UK: 'Uttarakhand', UA: 'Uttarakhand', UP: 'Uttar Pradesh',
  WB: 'West Bengal', BH: 'Bharat Series'
};

// Tokens that never carry search signal.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'near', 'this', 'that', 'was',
  'were', 'has', 'have', 'had', 'are', 'not', 'but', 'his', 'her', 'its',
  'their', 'about', 'after', 'before', 'during', 'while', 'been', 'being',
  'other', 'than', 'then', 'they', 'them', 'when', 'where', 'which', 'who',
  'will', 'would', 'could', 'should', 'said', 'also', 'more', 'most', 'some',
  'such', 'only', 'over', 'under', 'between', 'both', 'each', 'per', 'via',
  'name', 'date', 'time', 'number', 'details', 'detail', 'information', 'info',
  'claim', 'policy', 'insured', 'driver', 'vehicle', 'address', 'contact',
  'null', 'none', 'nil', 'unknown', 'pending', 'yes',
  'around', 'towards', 'proceeding', 'bearing', 'registration', 'resulting',
  'lost', 'control', 'shifted', 'registered', 'serious', 'persons', 'person'
]);

// Placeholder values that must never become a search anchor.
const NULL_VALUES = new Set([
  '', '-', '--', 'n/a', 'na', 'nil', 'none', 'null', 'unknown', 'not available',
  'not applicable', 'pending', 'tbd', 'to be confirmed', 'no', 'yes', 'nan',
  'new', 'new---', 'applied', 'applied for', 'temp', 'temporary',
  'not registered', 'unregistered', 'self', 'same', 'as above', '0', '00'
]);

// Re-exported for the manual research-trail builder, which is Hindi-only.
export const HINDI_TERMS = HINDI_TERMS_TABLE;

// Vehicle body types and popular Indian models worth quoting in a query.
const VEHICLE_TYPES = [
  'truck', 'bus', 'car', 'bike', 'motorcycle', 'scooter', 'scooty', 'auto',
  'rickshaw', 'tempo', 'trailer', 'dumper', 'tanker', 'tractor', 'jeep', 'van',
  'lorry', 'pickup', 'ambulance', 'taxi', 'cab', 'suv', 'sedan', 'hatchback',
  'bolero', 'scorpio', 'swift', 'ertiga', 'creta', 'innova', 'activa', 'splendor',
  'pulsar', 'thar', 'xuv', 'alto', 'wagonr', 'baleno', 'brezza', 'fortuner',
  'harrier', 'nexon', 'safari', 'tiago', 'eeco', 'omni', 'dzire', 'i10', 'i20'
];

// Manufacturer names. These are capitalised in narratives and were being read
// as the accident LOCATION — "a Tata dumper" made every downstream query search
// for a place called Tata, which is how a rich case ended up with a query plan
// that never mentioned the city, the highway or the claimant.
const VEHICLE_MAKES = [
  'tata', 'mahindra', 'maruti', 'suzuki', 'hyundai', 'honda', 'toyota', 'kia',
  'renault', 'nissan', 'ford', 'volkswagen', 'skoda', 'mg', 'jeep', 'citroen',
  'ashok leyland', 'leyland', 'eicher', 'bharatbenz', 'volvo', 'scania', 'man',
  'force', 'sml', 'isuzu', 'piaggio', 'atul', 'bajaj', 'hero', 'tvs', 'yamaha',
  'royal enfield', 'enfield', 'ktm', 'jawa', 'ather', 'ola', 'suzuki motorcycle'
];

// Incident modifiers that sharpen a query when present.
const INCIDENT_TERMS = [
  'accident', 'crash', 'collision', 'overturn', 'overturned', 'rollover',
  'head-on', 'rear-end', 'hit and run', 'hit-and-run', 'pile-up', 'pileup',
  'fatal', 'killed', 'dead', 'death', 'injured', 'casualty', 'casualties',
  'fire', 'burnt', 'theft', 'stolen', 'gorge', 'plunge', 'plunged', 'fell',
  'skidded', 'brake failure', 'drunk', 'stunt', 'drift', 'speeding', 'barat',
  'wedding', 'procession', 'fir', 'police', 'chargesheet', 'challan'
];

// Words that are not the event itself — outcomes, settings and roles. They are
// worth keeping as vocabulary signals for scoring, but using one as the query's
// incident term produces nonsense like "Chomu 3 injured injured" or narrows a
// search on a word as generic as "highway".
const NON_EVENT_TERMS = new Set([
  'police', 'fir', 'injured', 'killed', 'dead', 'death', 'fatal',
  'casualty', 'casualties', 'chargesheet', 'challan',
  'highway', 'hospital', 'driver'
]);

// Words that mark the capitalised run after them as a PERSON, not a place.
// Free-text name detection is gated on these: see the note in extractAnchors.
const NAME_CUES = [
  'driver', 'insured', 'owner', 'claimant', 'deceased', 'injured', 'named',
  'shri', 'smt', 'mr', 'mrs', 'ms', 'dr', 'late', 'complainant', 'accused',
  'victim', 'rider', 'pillion', 'occupant'
];

// Words that mark the capitalised run around them as a LOCATION.
const PLACE_CUES = [
  'at', 'near', 'from', 'towards', 'toward', 'in', 'on', 'via', 'crossing',
  'opposite', 'beside', 'between', 'reached', 'reaching'
];

const PLACE_SUFFIXES = [
  'district', 'dist', 'distt', 'tehsil', 'taluka', 'city', 'town', 'village',
  'road', 'highway', 'bypass', 'chowk', 'circle', 'nagar', 'puram', 'pura',
  'ganj', 'pur', 'bad', 'garh', 'toll', 'plaza'
];

// Institutions are anchors in their own right, not locations. "Chomu Police
// Station" and "SMS Hospital Jaipur" were being stored as places, which then
// leaked the bare word "Station" into the place list and into queries.
const INSTITUTION_WORDS = [
  'police', 'station', 'thana', 'chowki', 'kotwali', 'outpost',
  'hospital', 'dispensary', 'clinic', 'medical', 'court', 'trauma'
];

// Native-script words for generic geography. Indic scripts have no
// capitalisation to lean on, so without this list "टोल प्लाजा" (toll plaza) and
// "महामार्गावर" (on the highway) become the location anchor and the actual town
// is never searched.
const NATIVE_GENERIC = [
  'टोल', 'प्लाजा', 'हाईवे', 'हाइवे', 'राजमार्ग', 'महामार्ग', 'महामार्गावर',
  'रोड', 'सड़क', 'मार्ग', 'चौक', 'तिराहा', 'चौराहा', 'पुल', 'बाईपास', 'बायपास',
  'गांव', 'गाँव', 'जिला', 'जिले', 'तहसील', 'थाना', 'क्षेत्र', 'इलाके', 'पास',
  'नजदीक', 'समीप', 'ओर', 'रास्ता', 'हादसा', 'दुर्घटना', 'अपघात',
  'મહામાર્ગ', 'હાઈવે', 'রাস্তা', 'মহাসড়ক', 'நெடுஞ்சாலை', 'రహదారి', 'ಹೆದ್ದಾರಿ'
];

// Corporate suffixes. A transport firm is a genuine, highly searchable party to
// an accident, but it is neither a person nor a place, and treating it as one
// produced queries like "Sharma Transport Pvt Sharma accident".
const ORG_MARKERS = [
  'transport', 'transports', 'roadways', 'carriers', 'carrier', 'logistics',
  'travels', 'tours', 'freight', 'cargo', 'movers', 'lines', 'motors',
  'enterprises', 'traders', 'trading', 'industries', 'company'
];
const ORG_SUFFIXES = ['pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'corp', 'co'];

// Domain trust tiers used for ranking. Higher = more evidentiary weight.
const DOMAIN_TIERS = [
  { score: 30, hosts: ['bhaskar.com', 'jagran.com', 'amarujala.com', 'patrika.com', 'livehindustan.com', 'navbharattimes.indiatimes.com', 'aajtak.in', 'abplive.com', 'lokmat.com', 'esakal.com', 'sandesh.com', 'divyabhaskar.co.in', 'anandabazar.com', 'dinamalar.com', 'eenadu.net', 'sakshi.com', 'mathrubhumi.com', 'manoramaonline.com', 'prajavani.net', 'ajitjalandhar.com', 'dailythanthi.com', 'maharashtratimes.com', 'loksatta.com'] },
  { score: 28, hosts: ['timesofindia.indiatimes.com', 'hindustantimes.com', 'indianexpress.com', 'thehindu.com', 'ndtv.com', 'news18.com', 'indiatoday.in', 'tribuneindia.com', 'deccanherald.com', 'telegraphindia.com', 'theprint.in', 'thewire.in', 'scroll.in'] },
  { score: 24, hosts: ['ptinews.com', 'aninews.in', 'uniindia.com', 'ians.in', 'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk'] },
  { score: 18, hosts: ['zeenews.india.com', 'republicworld.com', 'freepressjournal.in', 'dnaindia.com', 'firstpost.com', 'oneindia.com', 'jansatta.com', 'punjabkesari.in', 'prabhatkhabar.com', 'naidunia.com'] },
  { score: 10, hosts: ['youtube.com', 'youtu.be'] },
  { score: 6, hosts: ['news.google.com', 'bing.com'] }
];

// Social platforms are excluded from automated evidence discovery.
//
// This was tested rather than assumed: across free, anonymous engines
// (DuckDuckGo, Bing web, Mojeek, SearxNG, Marginalia) a `site:instagram.com` /
// `site:facebook.com` sweep returned zero genuine post URLs — only platform
// homepages and login redirects, because neither platform exposes post content
// to general web crawlers any more. Surfacing those as "evidence" would put a
// login wall in a fraud file, so any URL on these hosts is rejected outright.
// Reaching real posts needs a paid SERP API or a signed-in session.
const SOCIAL_HOSTS = [
  'instagram.com', 'facebook.com', 'fb.watch', 'fb.com',
  'x.com', 'twitter.com', 'threads.net', 'threads.com'
];

export function isSocialUrl(url) {
  const h = hostOf(url);
  return !!h && SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

// Pages that are structurally useless as evidence even if keywords match.
const NOISE_PATTERNS = [
  /\/tag\//i, /\/tags\//i, /\/topic\//i, /\/topics\//i, /\/category\//i,
  /\/author\//i, /\/search\?/i, /\/page\/\d+/i, /wikipedia\.org\/wiki\/(?!.*accident)/i,
  /dictionary\.com/i, /merriam-webster/i, /linkedin\.com/i,
  // Social platforms: see SOCIAL_HOSTS above for why these are excluded.
  /(^|\/\/|\.)(instagram|facebook|threads)\.(com|net)/i,
  /(^|\/\/|\.)fb\.(com|watch)/i,
  /(^|\/\/|\.)(x|twitter)\.com/i,
  /amazon\.(in|com)/i, /flipkart\.com/i, /indiamart\.com/i, /justdial\.com/i,
  /olx\.in/i, /cardekho\.com/i, /carwale\.com/i, /bikewale\.com/i, /zigwheels/i,
  /policybazaar/i, /acko\.com/i, /coverfox/i, /insurancedekho/i
];

// Entertainment / commercial content that pollutes vernacular accident queries.
const ENTERTAINMENT_NOISE = [
  'song', 'jukebox', 'lyrics', 'album', 'bhajan', 'aarti', 'movie trailer',
  'official trailer', 'teaser', 'full movie', 'web series', 'episode',
  'comedy', 'dance video', 'status video', 'ringtone', 'remix', 'dj ',
  'horoscope', 'rashifal', 'astrology', 'recipe', 'gameplay', 'unboxing',
  'ipl ', 'cricket score', 't-series', 'zee music', 'saregama', 'speed records'
];

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6,
  'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12,
  ...NATIVE_NUMBERS,
  ...ROMANISED_NUMBERS
};

// ---------------------------------------------------------------------------
// 2. Small helpers
// ---------------------------------------------------------------------------

export function isMeaningful(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  if (!s || NULL_VALUES.has(s)) return false;
  if (/^[-_.\s]+$/.test(s)) return false;
  return true;
}

function clean(value) {
  return isMeaningful(value) ? String(value).trim() : '';
}

export function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function uniq(list) {
  return [...new Map((list || []).filter(Boolean).map((v) => [String(v).toLowerCase(), v])).values()];
}

// Indic digits share one layout across scripts; normalise before any numeric
// parse so a date or casualty count written as १२ is not simply invisible.
export function normaliseDigits(text) {
  // Every Indic script puts its digits at offset 0x66..0x6F inside its block,
  // so subtracting that offset before masking gives the value. Masking alone
  // reads ० as 6 and turns "१२" into "78".
  return String(text || '').replace(/[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯]/g,
    (d) => String((d.charCodeAt(0) - 0x66) & 0x0F));
}

// ---------------------------------------------------------------------------
// 3. Outbound query hygiene
// ---------------------------------------------------------------------------

// Internal identifiers must never reach a third-party search engine. They
// cannot match a news report — no newspaper prints an insurer's claim number,
// GSTIN or chassis number — so sending them is pure leakage of case data for
// zero recall.
//
// Enumerating formats one by one was tried and leaked: a spaced claim number
// ("CL 26140317"), a 16-digit policy, a slashed policy, a 0-prefixed mobile, a
// GSTIN, a bank account, a VIN and an engine number all walked straight
// through. The reliable shape is the inverse — protect the handful of tokens
// that genuinely belong in a query, then strip anything else that looks like an
// identifier.
const SENSITIVE_PATTERNS = [
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,                       // PAN
  /\b[A-Z]{1,4}[\s/-]?\d{6,}\b/gi,                 // prefixed claim / policy
  /\b(?:\+?\s*91[\s-]?)?[0-9][\d\s-]{6,}\d\b/g,    // 8+ digit runs, spaced or not
  /\b[\w.+-]+@[\w.-]+\b/g,                         // email addresses
  /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{11,}\b/gi // GSTIN / VIN / engine
];

// Tokens that must survive scrubbing because they are the search. A vault swap
// takes them out of harm's way while the identifier rules run.
const PROTECT_PATTERNS = [
  /\b(?:NH|SH|NE|MDR)[\s-]?\d{1,3}\b/gi,           // highway corridors
  /\b\d{4}-\d{2}-\d{2}\b/g,                        // ISO loss date
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g             // Indian-format date
];

const PLATE_CANDIDATE = /\b[A-Z]{2}[\s.-]?\d{1,2}[\s.-]?[A-Z]{0,3}[\s.-]?\d{3,4}\b|\b\d{2}[\s-]?BH[\s-]?\d{4}[\s-]?[A-Z]{1,2}\b/gi;

/**
 * Strip internal identifiers and OCR debris from a query before dispatch.
 * Applied to every outbound query without exception.
 */
export function scrubQuery(query) {
  let q = String(query || '');

  // -- 1. Vault the tokens that must survive --------------------------------
  const vault = [];
  const stash = (m) => `\u0001${vault.push(m) - 1}\u0001`;

  // A registration is only protected when it parses as a real one. That is what
  // separates RJ14GH9988 from a chassis number that merely looks similar.
  q = q.replace(PLATE_CANDIDATE, (m) => (normalisePlate(m) ? stash(m) : m));
  PROTECT_PATTERNS.forEach((re) => { q = q.replace(re, stash); });

  // -- 2. Strip identifiers --------------------------------------------------
  SENSITIVE_PATTERNS.forEach((re) => { q = q.replace(re, ' '); });

  // -- 3. OCR gutter debris --------------------------------------------------
  // Double quotes survive because they carry the phrase operator, and a colon
  // survives unless it is acting as a label separator ("Claim No : CL…") —
  // stripping it unconditionally destroyed every `site:youtube.com` query.
  q = q
    .replace(/[|\\<>{}[\]^~`*=+_]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\b\w*[#$%]\w*\b/g, ' ')
    .replace(/\s*:\s+/g, ' ')
    .replace(/\s+:/g, ' ')
    .replace(/\s*[;,]\s*/g, ' ');

  // -- 4. Restore -------------------------------------------------------------
  // The control-character delimiter is the point: a marker made of ordinary
  // characters could occur in a real query, and the restore step would then
  // rewrite genuine text.
  // eslint-disable-next-line no-control-regex
  q = q.replace(/\u0001(\d+)\u0001/g, (_, i) => vault[Number(i)] ?? ' ');

  return q
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)"(\s|$)/g, '$1$2')          // quotes orphaned by scrubbing
    .replace(/\s+([/-])\s+/g, ' ')              // separators left stranded
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// 4. Vehicle registration handling
// ---------------------------------------------------------------------------

// Matches: RJ14GH9988, RJ-14-GH-9988, RJ 14 GH 9988, UP85AT9988
const PLATE_RE = /\b([A-Z]{2})[\s.-]?(\d{1,2})[\s.-]?([A-Z]{0,3})[\s.-]?(\d{3,4})\b/gi;
// Bharat series: 22BH1234A
const BH_RE = /\b(\d{2})[\s-]?BH[\s-]?(\d{4})[\s-]?([A-Z]{1,2})\b/gi;

export function normalisePlate(raw) {
  if (!isMeaningful(raw)) return null;
  const compact = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length < 6 || compact.length > 11) return null;

  const bh = compact.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/);
  if (bh) return `${bh[1]}BH${bh[2]}${bh[3]}`;

  const m = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{3,4})$/);
  if (!m) return null;
  if (!RTO_STATE_CODES[m[1]]) return null;
  return compact;
}

// All the ways the same plate is written by police, press and social media.
export function platePermutations(plate) {
  const compact = normalisePlate(plate);
  if (!compact) return [];

  const bh = compact.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/);
  if (bh) {
    return [compact, `${bh[1]} BH ${bh[2]} ${bh[3]}`, `${bh[1]}-BH-${bh[2]}-${bh[3]}`];
  }

  const m = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{3,4})$/);
  if (!m) return [compact];
  const st = m[1];
  const dist = m[2];
  const series = m[3];
  const digits = m[4];
  const dist2 = dist.padStart(2, '0');

  const out = new Set([
    compact,
    `${st}-${dist2}-${series}-${digits}`.replace(/--+/g, '-').replace(/-$/, ''),
    `${st} ${dist2} ${series} ${digits}`.replace(/\s+/g, ' ').trim(),
    `${st}${dist2}${series} ${digits}`,
    `${st} ${dist2}${series}${digits}`
  ]);
  if (dist !== dist2) out.add(`${st}${dist}${series}${digits}`);
  return [...out].filter(Boolean);
}

// The compact, punctuation-free form used for substring matching.
export function plateKey(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findPlates(text) {
  const found = new Set();
  if (!text) return [];

  let m;
  BH_RE.lastIndex = 0;
  while ((m = BH_RE.exec(text)) !== null) {
    const p = normalisePlate(m[0]);
    if (p) found.add(p);
  }
  PLATE_RE.lastIndex = 0;
  while ((m = PLATE_RE.exec(text)) !== null) {
    const p = normalisePlate(m[0]);
    if (p) found.add(p);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// 5. Date handling
// ---------------------------------------------------------------------------

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12
};

// Parses the date formats that actually show up in Indian claim documents.
// Defaults to day-first (DD/MM/YYYY), which is the Indian convention.
/**
 * The calendar day a Date object was meant to represent, as [y, m, d].
 *
 * Two things conspire here. A spreadsheet date cell is a calendar date, not an
 * instant, so it must be read in local terms — formatting it through
 * toISOString() converts to UTC and, in any timezone ahead of UTC, rolls the
 * day backwards. In Asia/Kolkata that silently re-dated every claim by a day.
 *
 * On top of that, xlsx converts a date serial by subtracting the timezone
 * offset and lands ten seconds SHORT of local midnight: a cell displaying
 * 11/2/25 arrives as "Nov 01 23:59:50" local. Reading local components alone
 * therefore still gives the first, not the second.
 *
 * A value within five minutes of the following midnight is treated as that next
 * day. The window is deliberately tight: it absorbs the conversion artifact
 * without being able to disturb a genuine time of day.
 */
export function calendarParts(date) {
  const NEAR_MIDNIGHT_MS = 5 * 60 * 1000;
  const msIntoDay = ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000
    + date.getMilliseconds();
  const dayMs = 24 * 3600 * 1000;
  const d = (dayMs - msIntoDay) <= NEAR_MIDNIGHT_MS
    ? new Date(date.getTime() + NEAR_MIDNIGHT_MS)
    : date;
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

export function parseFlexibleDate(raw) {
  if (raw instanceof Date) {
    if (isNaN(raw)) return null;
    const [y, m, d] = calendarParts(raw);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (!isMeaningful(raw)) return null;
  const s = normaliseDigits(String(raw).trim());

  // Excel serial date (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      return new Date(Math.round((serial - 25569) * 86400000));
    }
  }

  // ISO first: YYYY-MM-DD
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return safeDate(+m[1], +m[2], +m[3]);

  // DD-MM-YYYY / DD-MM-YY (Indian convention)
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    let day = +m[1];
    let month = +m[2];
    if (month > 12 && day <= 12) {
      const t = day; day = month; month = t; // tolerate MM-DD-YYYY
    }
    return safeDate(year, month, day);
  }

  // 12 August 2026 / August 12, 2026
  m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return safeDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) return safeDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);

  const native = new Date(s);
  return isNaN(native) ? null : native;
}

function safeDate(y, mo, d) {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(dt) ? null : dt;
}

export function toISO(date) {
  if (!date || isNaN(date)) return '';
  return date.toISOString().slice(0, 10);
}

export function shiftDays(date, days) {
  if (!date) return null;
  return new Date(date.getTime() + days * 86400000);
}

export function formatLongDate(date) {
  if (!date || isNaN(date)) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// 6. Person names
// ---------------------------------------------------------------------------

const NAME_NOISE = new Set([
  'shri', 'smt', 'mr', 'mrs', 'ms', 'dr', 'sh', 'late', 'son', 'daughter',
  'wife', 'husband', 'insured', 'driver', 'owner', 'claimant', 'policyholder',
  'applicant', 'complainant', 'deceased', 'injured', 'name', 'the', 'and',
  'proprietor', 'director', 'limited', 'ltd', 'pvt', 'private', 'company'
]);

export function cleanPersonName(raw) {
  if (!isMeaningful(raw)) return '';
  let s = String(raw).split('(')[0].split('/')[0].split(',')[0].trim();
  s = s.replace(/[^A-Za-zऀ-ॿ .'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = s.split(' ').filter((p) => p.length > 1 && !NAME_NOISE.has(p.toLowerCase()));
  if (parts.length === 0) return '';
  return parts.slice(0, 4).join(' ');
}

// A name is "distinctive" (safe to search on its own) when it has >= 2 tokens.
export function isDistinctiveName(name) {
  const c = cleanPersonName(name);
  return c.split(' ').filter((t) => t.length > 2).length >= 2;
}

// ---------------------------------------------------------------------------
// 7. Location handling
// ---------------------------------------------------------------------------

// Administrative words that describe a place without naming one. Registries
// type them inconsistently and misspell them constantly — "Disctrict" and
// "Statipn" both appear in real client sheets — so near-misses are matched
// too. Left in, they become part of the search term and match nothing.
const ADMIN_SUFFIXES = [
  'district', 'disctrict', 'distict', 'distrct', 'dist', 'distt',
  'taluk', 'taluka', 'tehsil', 'tahsil', 'tahasil', 'thana', 'block',
  'village', 'gram', 'post', 'ps', 'po', 'near', 'at', 'on', 'the', 'road'
];

function stripAdminWords(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => {
    const bare = w.toLowerCase().replace(/[^a-zऀ-෿]/g, '');
    if (!bare) return false;
    return !ADMIN_SUFFIXES.includes(bare);
  });
  return kept.join(' ').trim();
}

/**
 * A corridor named by its endpoints also names two towns.
 *
 * "Ujjain-Indore highway" as a single anchor matches nothing, because no report
 * writes it that way — the press says "Indore Road", "इंदौर उज्जैन रोड", or just
 * names one end. Live runs on real claims returned exactly the right articles
 * and could only band them BACKGROUND for want of a place that matched. The
 * full corridor stays first, as the most specific form; the endpoints follow.
 */
function expandCorridorEndpoints(piece) {
  const out = [piece];
  const m = piece.match(/^([A-Za-zऀ-෿]{3,})\s*[-–—]\s*([A-Za-zऀ-෿]{3,})(?:\s+\w+)?$/);
  if (m) {
    [m[1], m[2]].forEach((end) => {
      if (end.length >= 3 && !ADMIN_SUFFIXES.includes(end.toLowerCase())) out.push(end);
    });
  }
  return out;
}

// Directional and generic modifiers inside a compound place name. Alone they
// name nothing — "Dakshina" or "Pradesh" as a search anchor is noise.
const PLACE_MODIFIERS = new Set([
  'north', 'south', 'east', 'west', 'upper', 'lower', 'greater', 'new', 'old',
  'dakshina', 'uttara', 'purba', 'paschim', 'central', 'rural', 'urban', 'sadar',
  // Halves of two-word state names. "Madhya" or "Pradesh" alone names nothing,
  // and "Tamil" alone would match any article about the language.
  'madhya', 'uttar', 'andhra', 'arunachal', 'himachal', 'pradesh', 'tamil',
  'nadu', 'jammu', 'kashmir', 'bengal', 'nagar', 'haveli', 'daman',
  // Descriptors, not names.
  'highway', 'expressway', 'bypass', 'flyover', 'bridge', 'plaza', 'circle',
  'chowk', 'colony', 'sector', 'phase'
]);

/**
 * A compound place name is also its parts.
 *
 * A hamlet is written in full on the claim form and abbreviated in the press:
 * "Parpunja Koilattadka" was the location on a real claim, and the report that
 * covered it — daijiworld's "Man dies in early morning car accident at
 * Parpunja" — names only the first half. Searching the full string alone found
 * nothing, so the case read as a nil digital footprint when the article was
 * sitting in the index the whole time.
 *
 * The full form stays first, as the most specific anchor; components follow.
 */
function expandPlaceTokens(piece) {
  const out = [piece];
  const tokens = piece.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return out;

  tokens.forEach((tok) => {
    const bare = tok.toLowerCase().replace(/[^a-zऀ-෿]/g, '');
    if (bare.length < 5) return;
    if (PLACE_MODIFIERS.has(bare) || ADMIN_SUFFIXES.includes(bare)) return;
    out.push(tok);
  });
  return out;
}

export function splitLocation(raw) {
  if (!isMeaningful(raw)) return [];
  return String(raw)
    .split(/[,;/|]|near|opposite|in front of/i)
    .map((p) => p.replace(/[^A-Za-zऀ-෿0-9 -]/g, ' ').replace(/\s+/g, ' ').trim())
    .map(stripAdminWords)
    .filter((p) => p.length >= 3 && !NULL_VALUES.has(p.toLowerCase()))
    .flatMap(expandCorridorEndpoints)
    .flatMap(expandPlaceTokens)
    .filter((p, i, arr) => arr.indexOf(p) === i);
}

// Highway / corridor identifiers (NH-48, SH-12, Yamuna Expressway…)
function findCorridors(text) {
  const out = new Set();
  if (!text) return [];
  const re = /\b((?:NH|SH|NE|MDR)[\s-]?\d{1,3}|[A-Z][a-z]+\s+Expressway|Expressway|Flyover|Bypass|Toll\s*Plaza|Overbridge|ROB)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1].replace(/\s+/g, ' ').trim());
  }
  return [...out];
}

// Organisations: "M/s Sharma Transport Pvt Ltd", "Gupta Roadways".
function findOrgs(text) {
  const out = new Set();
  if (!text) return [];
  const markers = ORG_MARKERS.join('|');
  const suffixes = ORG_SUFFIXES.join('|');

  const re = new RegExp(
    `\\b(?:m/s\\.?\\s*)?((?:[A-Z][\\w&.-]*\\s+){0,3}(?:${markers})(?:\\s+(?:${suffixes})\\.?){0,3})`,
    'gi'
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1]
      .replace(/\s+/g, ' ')
      .replace(new RegExp(`\\s+(?:${suffixes})\\.?$`, 'i'), '')
      .trim();
    // A bare marker word ("transport") is not a company name.
    if (name.length >= 6 && /\s/.test(name)) out.add(name);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// 8. Anchor extraction — the heart of keyword-specific search
// ---------------------------------------------------------------------------

/**
 * Score a capitalised run to decide whether it is a place, and how good a place
 * anchor it is. Returns null when it is clearly something else.
 *
 * Free text gives no grammatical marking, so the surrounding words are all the
 * evidence there is: "near Chomu" is a location, "a Tata dumper" is a make, and
 * "driver Ramesh Kumar" is a person. Reading every capitalised run as a place —
 * the previous behaviour — is what produced query plans anchored on "Tata".
 */
function scorePlaceCandidate(run, before, after) {
  const lc = run.toLowerCase();

  if (STOPWORDS.has(lc)) return null;
  if (VEHICLE_TYPES.includes(lc)) return null;
  if (INCIDENT_TERMS.includes(lc)) return null;
  if (VEHICLE_MAKES.some((mk) => lc === mk || lc.startsWith(`${mk} `))) return null;
  if (ORG_MARKERS.some((o) => lc.includes(o))) return null;
  if (INSTITUTION_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lc))) return null;
  if (PLACE_SUFFIXES.includes(lc)) return null;
  if (ORG_SUFFIXES.includes(lc)) return null;
  if (NAME_CUES.includes(before)) return null;

  let score = 1;
  if (PLACE_CUES.includes(before)) score += 3;
  if (PLACE_SUFFIXES.includes(after)) score += 2;
  if (PLACE_SUFFIXES.some((s) => lc.endsWith(s))) score += 2;
  if (run.includes(' ')) score += 1;
  return score;
}

/**
 * Extract every searchable anchor from free text plus (optionally) structured
 * claim fields parsed out of Excel/PDF.
 *
 * @param {string} freeText   Raw investigator keywords or document body.
 * @param {object} structured Optional 30-header claim facts.
 * @returns {object} anchors
 */
export function extractAnchors(freeText = '', structured = {}) {
  const text = String(freeText || '');
  const s = structured || {};

  const anchors = {
    plates: [],
    names: [],
    orgs: [],
    places: [],
    corridors: [],
    vehicleTypes: [],
    incidentTerms: [],
    policeStation: '',
    hospital: '',
    date: null,
    dateISO: '',
    dateWindow: [],
    casualties: null,
    injured: null,
    claimId: '',
    freeTokens: [],
    hindiTerms: [],
    vernacularTerms: [],
    languages: ['en'],
    regionHint: '',
    sufficient: false,
    raw: text
  };

  // -- structured fields take priority (they are already validated data) -----
  const structuredPlates = []
    .concat(s.vehicle_numbers || [], s.vehicle_no || [])
    .flatMap((v) => (typeof v === 'string' ? v.split(/[,;/]/) : [v]));
  structuredPlates.forEach((v) => {
    const p = normalisePlate(v);
    if (p) anchors.plates.push(p);
  });
  findPlates(text).forEach((p) => anchors.plates.push(p));

  [s.insured_name, s.driver_name, s.parties_involved].forEach((v) => {
    if (!v) return;
    const list = Array.isArray(v) ? v : String(v).split(/[,;]/);
    list.forEach((n) => {
      const c = cleanPersonName(n);
      if (c && c.length >= 4) anchors.names.push(c);
    });
  });

  [
    s.loss_location, s.spot_of_accident, s.accident_location_city,
    s.accident_location_region, s.district_state,
    s.accident_location_state, s.state
  ].forEach((v) => splitLocation(v).forEach((p) => anchors.places.push(p)));

  // Any column the header dictionary did not recognise is preserved verbatim in
  // additional_details rather than discarded. Location columns in particular
  // arrive under endless labels, and a case with no registration number has
  // nothing else to search on — so a location-shaped leftover is recovered here
  // instead of being lost between the parser and the planner.
  const extras = Array.isArray(s.additional_details) ? s.additional_details : [];
  extras.forEach((entry) => {
    const label = String((entry && entry.label) || '').toLowerCase();
    const value = (entry && entry.value) || '';
    if (!isMeaningful(value)) return;
    if (/(location|place|spot|site|address|village|town|city|district|taluk|tehsil|highway|road)/.test(label)) {
      splitLocation(value).forEach((piece) => anchors.places.push(piece));
    }
  });

  // A police-station column names a jurisdiction, not the accident spot. Fed
  // straight into places it produced query anchors like "Puttur Rural Police"
  // and "Loni Police Statipn" — the second complete with the registry's own
  // typo. Route it to the police-station anchor and keep only the town.
  const psRaw = clean(s.police_station) || clean(s.police_station_district);
  if (psRaw) {
    anchors.policeStation = psRaw;
    const town = psRaw.replace(/(police|station|statipn|staion|thana|chowki|kotwali|rural|urban|city)/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (town.length >= 3) anchors.places.push(town);
    anchors.places = anchors.places.filter((pl) => pl.toLowerCase() !== psRaw.toLowerCase());
  }
  anchors.hospital = clean(s.hospital_name);
  anchors.claimId = clean(s.claim_id);

  const narrative = clean(s.FIR_cause_narrative);
  const corpus = `${text} ${narrative}`;

  const dateSource = s.accident_date_time || s.fir_date || s.intimation_date || '';
  anchors.date = parseFlexibleDate(dateSource) || parseFlexibleDate(text);
  anchors.dateISO = toISO(anchors.date);
  if (anchors.date) {
    anchors.dateWindow = [-1, 0, 1, 2].map((d) => toISO(shiftDays(anchors.date, d))).filter(Boolean);
  }

  // -- vocabulary, in every script ------------------------------------------
  // Latin, native-script and romanised passes all feed the same two buckets, so
  // a Hindi FIR, a Marathi headline and "dumper palta" behave identically.
  const lower = corpus.toLowerCase();
  const romanised = hasIndic(corpus) ? indicToLatin(corpus).toLowerCase() : lower;

  VEHICLE_TYPES.forEach((v) => {
    if (new RegExp(`\\b${v}\\b`, 'i').test(corpus)) anchors.vehicleTypes.push(v);
  });
  INCIDENT_TERMS.forEach((t) => {
    if (lower.includes(t)) anchors.incidentTerms.push(t);
  });

  const detectedLangs = [];
  NATIVE_TO_CANON.forEach((canon, native) => {
    if (corpus.includes(native)) {
      if (VEHICLE_CANON.has(canon)) anchors.vehicleTypes.push(canon);
      else anchors.incidentTerms.push(canon);
      const lang = NATIVE_TO_LANG.get(native);
      if (lang && !detectedLangs.includes(lang)) detectedLangs.push(lang);
    }
  });

  const romanTokens = new Set(romanised.match(/[a-z]{3,}/g) || []);
  Object.entries(ROMANISED_TERMS).forEach(([roman, canon]) => {
    if (romanTokens.has(roman)) {
      if (VEHICLE_CANON.has(canon)) anchors.vehicleTypes.push(canon);
      else anchors.incidentTerms.push(canon);
    }
  });

  [s.vehicle_make, s.vehicle_model, s.vehicle_types].forEach((v) => {
    if (isMeaningful(v)) {
      String(v).split(/[,;/]/).forEach((piece) => {
        const p = piece.trim();
        if (p.length >= 3 && !NULL_VALUES.has(p.toLowerCase())) anchors.vehicleTypes.push(p);
      });
    }
  });

  findCorridors(corpus).forEach((c) => anchors.corridors.push(c));
  findOrgs(corpus).forEach((o) => anchors.orgs.push(o));

  // -- named parties from free text, cue-gated -------------------------------
  //
  // Only a capitalised run introduced by an explicit cue ("driver Ramesh
  // Kumar") is read as a person. Guessing without a cue is what previously
  // turned "Jaipur Sikar highway" into a claimant called "Jaipur Sikar" and
  // destroyed the location anchor. Geography dominates free text; names arrive
  // reliably through the structured insured/driver fields.
  let soloName = false;
  const nameCueRe = new RegExp(`\\b(?:${NAME_CUES.join('|')})\\.?\\s+((?:[A-Z][a-z]{1,}\\s*){1,4})`, 'g');
  let nm;
  while ((nm = nameCueRe.exec(text)) !== null) {
    const candidate = cleanPersonName(nm[1]);
    if (candidate && candidate.length >= 4 && candidate.includes(' ')) anchors.names.push(candidate);
  }

  // A query that is nothing but a capitalised two-to-four word run, with no
  // location, vehicle or incident word anywhere, is a person — that is the only
  // thing an investigator types on its own in that shape. The cue-word gate
  // above cannot see this case because there is no sentence to carry a cue.
  if (!anchors.names.length && !anchors.plates.length
    && !anchors.vehicleTypes.length && !anchors.incidentTerms.length) {
    const solo = text.trim();
    if (/^(?:[A-Z][a-z]{1,}\s+){1,3}[A-Z][a-z]{1,}$/.test(solo)) {
      const candidate = cleanPersonName(solo);
      if (candidate && isDistinctiveName(candidate)) {
        anchors.names.push(candidate);
        soloName = true;
      }
    }
  }

  // -- institutions from free text -------------------------------------------
  // The place scorer rejects any run containing an institution word, so the
  // town name inside "Chomu Police Station" is harvested here or lost.
  // Collected separately and merged after the place pass, so that pushing one
  // does not make the free-text place scan think it already has places.
  const institutionPlaces = [];
  if (!anchors.policeStation) {
    const ps = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Police\s+Station|Thana|Chowki|Kotwali)\b/);
    if (ps) {
      anchors.policeStation = ps[0].trim();
      institutionPlaces.push(ps[1].trim());
    }
  }
  if (!anchors.hospital) {
    const hp = text.match(/\b((?:[A-Z][A-Za-z]*\s+){0,3}Hospital(?:\s+[A-Z][a-z]+)?)\b/);
    if (hp) {
      anchors.hospital = hp[1].replace(/\s+/g, ' ').trim();
      const tail = hp[1].match(/Hospital\s+([A-Z][a-z]+)/);
      if (tail) institutionPlaces.push(tail[1]);
    }
  }

  // -- places from free text, scored rather than first-seen ------------------
  // Skipped when the entire input was already consumed as a person name, or the
  // same words would be indexed a second time as a location.
  if (!anchors.places.length && !soloName) {
    const scored = [];
    const runRe = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g;
    let rm;
    while ((rm = runRe.exec(text)) !== null) {
      const run = rm[1];
      // Bounded look-around. Slicing the whole prefix on every match makes this
      // loop quadratic in document length — measured at 1.9s for a 96KB PDF
      // text dump, which a fifty-case batch pays fifty times over. Only the
      // adjacent word is ever consulted, so a short window is equivalent.
      const CUE_WINDOW = 40;
      const from = Math.max(0, rm.index - CUE_WINDOW);
      const beforeMatch = text.slice(from, rm.index).match(/([A-Za-z/]+)\W*$/);
      const tail = rm.index + run.length;
      const afterMatch = text.slice(tail, tail + CUE_WINDOW).match(/^\W*([A-Za-z]+)/);
      const before = (beforeMatch ? beforeMatch[1] : '').toLowerCase();
      const after = (afterMatch ? afterMatch[1] : '').toLowerCase();
      const score = scorePlaceCandidate(run, before, after);
      if (score === null) continue;
      scored.push({ run, score });

      // A multi-word run is also worth its individual tokens: "Jaipur Sikar"
      // yields Jaipur and Sikar, either of which a report may use alone.
      run.split(' ').forEach((tok) => {
        const tl = tok.toLowerCase();
        if (tok.length >= 4 && run.includes(' ')
          && !STOPWORDS.has(tl) && !VEHICLE_TYPES.includes(tl)
          && !INCIDENT_TERMS.includes(tl) && !VEHICLE_MAKES.includes(tl)) {
          scored.push({ run: tok, score: score - 0.5 });
        }
      });
    }
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((c) => anchors.places.push(c.run));
  }
  // Town names recovered from institution phrases rank behind the scored ones:
  // "near Chomu toll plaza" is a better spot anchor than the police station's
  // jurisdiction, which may name a different town entirely.
  institutionPlaces.forEach((p) => anchors.places.push(p));

  // Native-script places. Indic scripts have no capitalisation, so there is no
  // equivalent of the capitalised-run heuristic: every token is a candidate and
  // the job is to eliminate the ones that are vocabulary rather than to spot
  // the ones that are names. Proximity to a postposition ("के पास") promotes a
  // token; being a known incident word or generic geography eliminates it.
  if (hasIndic(text)) {
    const isNoise = (tok) => {
      const t = tok.trim();
      if (t.length < 3) return true;
      if (NATIVE_TO_CANON.has(t.toLowerCase())) return true;
      if (NUMBER_WORDS[t] !== undefined) return true;
      return NATIVE_GENERIC.some((g) => t === g || t.startsWith(g));
    };

    const nativeScored = [];
    const tokens = text.match(/[ऀ-ൿ]{2,}/g) || [];
    const postpositions = /^(के|पास|में|पर|से|की|ओर|नजदीक|जवळ|પાસે|কাছে|அருகே|ಬಳಿ|സമീപം|और|तथा)$/;

    tokens.forEach((tok, i) => {
      if (isNoise(tok) || postpositions.test(tok)) return;
      // A token followed within two positions by a postposition is being
      // located, which is exactly what a spot anchor looks like.
      const near = tokens.slice(i + 1, i + 3).some((t) => postpositions.test(t));
      nativeScored.push({ tok, score: near ? 3 : 1 });
    });

    nativeScored.sort((a, b) => b.score - a.score);
    nativeScored.forEach((c) => anchors.places.push(c.tok));
  }

  // Plate state code implies a region. This is a SCORING hint only: promoting
  // it to a query anchor produced "Rajasthan accident", which returns every
  // road accident in the state and nothing about this one.
  if (anchors.plates.length) {
    anchors.regionHint = RTO_STATE_CODES[anchors.plates[0].slice(0, 2)] || '';
  }

  anchors.casualties = extractCasualtyCount(corpus);
  anchors.injured = extractInjuredCount(corpus);

  // Free tokens: whatever the investigator typed that we did not classify.
  // Ranked by distinctiveness and capped — see rankFreeTokens.
  anchors.freeTokens = rankFreeTokens(text);

  // -- language selection ----------------------------------------------------
  const stateCodes = anchors.plates.map((p) => p.slice(0, 2));
  // A language actually observed in the supplied text outranks one merely
  // inferred from a registration plate: if the narrative is written in Marathi,
  // the Marathi edition is where the report will be, whatever the plate says.
  const ordered = orderLanguages(stateCodes);
  // Where the accident happened is as strong a signal as the plate, and is
  // often the only one: a claim row with a location and a date and no
  // registration number still tells us which regional press to search.
  const byPlace = languagesForPlaces(anchors.places);
  anchors.languages = ['en', ...detectedLangs, ...byPlace, ...ordered]
    .filter((l, i, arr) => arr.indexOf(l) === i);

  // Vernacular twins. The generic accident terms always lead: essentially every
  // Indian district daily headlines a road accident with them.
  const canonPool = new Set(['accident', ...anchors.incidentTerms, ...anchors.vehicleTypes.map((v) => v.toLowerCase())]);
  const activeLangs = anchors.languages.filter((l) => l !== 'en');
  canonPool.forEach((t) => {
    termsFor(t, activeLangs).forEach((w) => anchors.vernacularTerms.push(w));
  });
  anchors.hindiTerms = [...(VERNACULAR_TERMS.accident.hi || [])];
  canonPool.forEach((t) => {
    ((VERNACULAR_TERMS[t] || {}).hi || []).forEach((w) => anchors.hindiTerms.push(w));
  });

  // De-duplicate everything, preserving first-seen (i.e. best-scored) order.
  ['plates', 'names', 'orgs', 'places', 'corridors', 'vehicleTypes', 'incidentTerms', 'freeTokens', 'hindiTerms', 'vernacularTerms']
    .forEach((k) => { anchors[k] = uniq(anchors[k]); });

  anchors.sufficient = hasSufficientAnchors(anchors);
  return anchors;
}

/**
 * Is there enough here to search on at all?
 *
 * A bare date, or a claim number on its own, produces queries like
 * "12/08/2026 accident" that match nothing and burn engine quota. Better to say
 * so than to dispatch noise and report a nil footprint that was never searched.
 */
export function hasSufficientAnchors(anchors) {
  if (!anchors) return false;
  if (anchors.plates.length) return true;
  if (anchors.names.some(isDistinctiveName)) return true;
  if (anchors.orgs.length) return true;
  if (anchors.places.length) return true;
  if (anchors.corridors.length) return true;
  if (anchors.policeStation || anchors.hospital) return true;
  return anchors.freeTokens.length >= 2;
}

/**
 * Rank the leftover tokens by how much they narrow a search, and keep only the
 * top few.
 *
 * Scoring previously used hits/total over every token, so a 300-word narrative
 * diluted a genuine match to near zero — the more context an investigator
 * supplied, the worse a real article scored. Capping the set fixes that, and
 * ranking it means the tokens kept are the discriminating ones.
 */
function rankFreeTokens(text, limit = 8) {
  const raw = String(text || '');
  const tokens = (raw.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{1,}/gu) || [])
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

  const freq = new Map();
  tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));

  const scored = [...new Set(tokens)].map((t) => {
    let score = Math.min(t.length, 12);
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(raw) && /[A-Z]/.test(raw.charAt(raw.toLowerCase().indexOf(t)))) score += 4;
    if (INCIDENT_TERMS.includes(t) || VEHICLE_TYPES.includes(t)) score -= 3;
    if (ROMANISED_TERMS[t]) score += 2;
    if ((freq.get(t) || 1) > 2) score -= 2;
    return { t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.t);
}

// Built from the number table rather than hand-listed, so a language added to
// vernacular.js is counted here too. Longest-first, or "दो" would match inside
// "दोन" and the alternation would stop early.
const CASUALTY_NUM = ['\\d{1,3}']
  .concat(Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  .join('|');
const KILLED_WORDS = 'killed|dead|died|deaths?|fatalities|मौत|मृत्यु|मृतक|ठार|મોત|নিহত|மரண|பலி|మృతి|ಸಾವು|മരണ|ਮੌਤ|ମୃତ୍ୟୁ';
// Stems, not just the past participle: an FIR narrative says "serious injuries
// to three persons" at least as often as it says "three injured".
const INJURED_WORDS = 'injured|injuries|injury|hurt|wounded|घायल|जखमी|ઘાયલ|আহত|காயம்|గాయాల|ಗಾಯ|പരിക്ക്|ਜ਼ਖ਼ਮੀ|ଆହତ';

function countMatcher(words, flags) {
  // Unicode-aware boundaries: JavaScript's \b is ASCII-only, so it never fires
  // next to Devanagari and every native-script casualty phrase would be missed.
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${CASUALTY_NUM})\\s*(?:people\\s+|persons?\\s+|passengers?\\s+|लोगों\\s*की\\s*)?(?:${words})(?![\\p{L}\\p{N}])`,
    flags
  );
}

function wordToCount(w) {
  const k = String(w || '').toLowerCase();
  const val = NUMBER_WORDS[k];
  return val !== undefined ? val : (parseInt(k, 10) || null);
}

function firstCount(text, words) {
  if (!text) return null;
  const norm = normaliseDigits(text);

  const m = norm.match(countMatcher(words, 'iu'));
  if (m) return wordToCount(m[1]);

  // English also puts the count after the noun — "serious injuries to three
  // persons" is at least as common in an FIR narrative as "three injured".
  const reversed = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${words})\\s+(?:of\\s+|to\\s+)?(${CASUALTY_NUM})\\s*(?:people|persons?|passengers?|occupants?)?(?![\\p{L}\\p{N}])`,
    'iu'
  );
  const r = norm.match(reversed);
  return r ? wordToCount(r[1]) : null;
}

export function extractCasualtyCount(text) {
  return firstCount(text, KILLED_WORDS);
}

/**
 * Injuries are counted separately from fatalities on purpose. Folding "three
 * injured" into the casualty anchor would make the conflict penalty in
 * scoreResult fire against any report of a non-fatal accident.
 */
export function extractInjuredCount(text) {
  return firstCount(text, INJURED_WORDS);
}

// Collects every distinct fatality figure asserted by an article.
function casualtyFigures(text) {
  const out = new Set();
  if (!text) return out;
  const re = countMatcher(KILLED_WORDS, 'giu');
  let m;
  while ((m = re.exec(normaliseDigits(text))) !== null) {
    const w = m[1].toLowerCase();
    const v = NUMBER_WORDS[w] !== undefined ? NUMBER_WORDS[w] : parseInt(w, 10);
    if (v) out.add(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 9. Query planning
// ---------------------------------------------------------------------------

function phrase(s) {
  const t = String(s || '').trim();
  return t.includes(' ') ? `"${t}"` : t;
}

function tokenCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Compress a case down to one compact, high-signal query.
 *
 * A long narrative cannot be sent to a news engine verbatim — a 300-character
 * string matches nothing — and the old code simply dropped it, leaving the
 * highest-precision tier empty. Distilling keeps the intent and makes the query
 * executable.
 */
export function distillQuery(anchors, maxTokens = 10) {
  if (!anchors) return '';
  const parts = [];
  const push = (v) => {
    if (!v) return;
    const t = String(v).trim();
    if (!t) return;
    if (parts.join(' ').toLowerCase().includes(t.toLowerCase())) return;
    if (tokenCount(parts.join(' ')) + tokenCount(t) > maxTokens) return;
    parts.push(t);
  };

  push(anchors.plates[0]);
  if (!anchors.plates.length) push(anchors.names.find(isDistinctiveName));
  push(anchors.orgs[0]);
  push(anchors.places[0]);
  push(anchors.corridors[0]);
  push(anchors.vehicleTypes[0]);
  push(anchors.incidentTerms.find((t) => !NON_EVENT_TERMS.has(t)) || 'accident');

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build the tiered query plan actually dispatched to search engines.
 * Tier 1 = highest precision (plate / full name + place), Tier 4 = recall.
 * Every query is derived from anchors, so it is always keyword-specific.
 */
export function buildQueryPlan(anchors, options = {}) {
  const { maxQueries = 10, includeVernacular = true, includeVideo = true } = options;
  if (!anchors) return [];
  const plan = [];
  const seen = new Set();

  // `cls` is the angle a query attacks the case from. Within a tier the
  // selector prefers an unused angle, so three spellings of the same plate can
  // never crowd out the only query that names the claimant.
  const add = (query, tier, intent, engines, cls) => {
    const q = scrubQuery(query);
    if (!q || q.length < 3) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    plan.push({ query: q, tier, intent, cls: cls || 'other', engines: engines || ['news', 'web'] });
  };

  // A case with nothing to search on must not dispatch noise.
  if (!anchors.sufficient) return [];

  const place = anchors.places[0] || '';
  const place2 = anchors.places[1] || '';
  const name = anchors.names.find(isDistinctiveName) || anchors.names[0] || '';
  const org = anchors.orgs[0] || '';
  const vtype = anchors.vehicleTypes[0] || '';
  const corridor = anchors.corridors[0] || '';
  const incident = anchors.incidentTerms.find((t) => !NON_EVENT_TERMS.has(t)) || 'accident';
  const dateISO = anchors.dateISO;
  const year = dateISO ? dateISO.slice(0, 4) : '';

  // What the investigator literally typed runs verbatim when it is short enough
  // to be a real query; a long narrative is distilled instead of discarded.
  const literal = (anchors.raw || '').trim();
  if (literal && tokenCount(literal) <= 12 && literal.length <= 160) {
    add(literal, 1, 'Verbatim investigator query', ['news', 'web'], 'literal');
    if (!/accident|crash|हादसा|दुर्घटना|अपघात|અકસ્માત|দুর্ঘটনা|விபத்து|ప్రమాదం|ಅಪಘಾತ|അപകടം|ਹਾਦਸਾ/i.test(literal)) {
      add(`${literal} accident`, 1, 'Verbatim query + incident qualifier', ['news', 'web'], 'literal-q');
    }
  } else if (literal) {
    add(distillQuery(anchors), 1, 'Distilled from the supplied narrative', ['news', 'web'], 'literal');
  }

  // --- Tier 1: identity-anchored, highest precision -------------------------
  // Every plate gets its own query: in a collision the press may print either
  // vehicle's number, and only searching the first one loses half the cases.
  anchors.plates.slice(0, 3).forEach((plate, i) => {
    platePermutations(plate).slice(0, i === 0 ? 3 : 1).forEach((p) => {
      add(`${phrase(p)} accident`, 1, `Vehicle registration ${p}`, ['news', 'web'], `plate-${i}`);
    });
    if (place) add(`${phrase(plate)} ${place}`, 1, 'Registration plate + location', ['news', 'web'], `plate-place-${i}`);
  });

  if (name && isDistinctiveName(name)) {
    if (place) add(`${phrase(name)} ${place} accident`, 1, 'Named party at location', ['news', 'web'], 'name');
    add(`${phrase(name)} accident FIR`, 1, 'Named party in police record', ['news', 'web'], 'name-fir');
  }
  if (org) {
    add(`${phrase(org)} ${incident}`, 1, 'Transport operator named in the incident', ['news', 'web'], 'org');
    if (place) add(`${phrase(org)} ${place}`, 1, 'Transport operator at location', ['news', 'web'], 'org-place');
  }

  // --- Tier 2: event-anchored (place + incident + date) ---------------------
  if (place) {
    const bits = [place, vtype, incident].filter(Boolean).join(' ');
    add(bits, 2, 'Location + vehicle + incident', ['news', 'web'], 'place');
    if (dateISO) add(`${place} ${incident} ${dateISO}`, 2, 'Location + incident + exact date', ['news', 'web'], 'place-date');
    else if (year) add(`${place} ${incident} ${year}`, 2, 'Location + incident + year', ['news', 'web'], 'place-date');
    if (anchors.casualties) add(`${place} ${anchors.casualties} killed ${incident}`, 2, 'Location + casualty count', ['news', 'web'], 'casualty');
    if (anchors.injured) add(`${place} ${anchors.injured} injured ${incident}`, 2, 'Location + injury count', ['news', 'web'], 'injured');

    // Alternate romanisations: the newspaper's spelling of a district name is
    // rarely the claim form's spelling.
    romanVariants(place).slice(1, 2).forEach((v) => {
      add(`${v} ${incident}`, 2, `Location spelling variant: ${v}`, ['news', 'web'], 'place-variant');
    });
  }
  // A hamlet is written in full on a claim form and abbreviated in the press:
  // "Parpunja Koilattadka" on the form, "car accident at Parpunja" in the
  // report. Searching only the primary anchor missed a real case whose article
  // was sitting in the index, so the alternates get their own queries.
  //
  // They sit at tier 1 when the case carries no registration number. That tier
  // is otherwise empty for a location-only claim, and with no plate the
  // location is the identity — there is nothing more precise to spend it on.
  const altTier = anchors.plates.length ? 2 : 1;
  anchors.places.slice(1, 4).forEach((alt, i) => {
    const a = alt.toLowerCase();
    if (a === place.toLowerCase()) return;
    // Skip a component that is merely the primary anchor re-spaced, but keep a
    // genuinely shorter form — that shorter form is the whole point.
    if (a.length >= place.length && a.includes(place.toLowerCase())) return;
    // A rare hamlet name is already selective, and a news index holds very few
    // documents for it. Measured on a real case: "Parpunja" returned the
    // relevant corpus, "Parpunja accident" returned none of it — the qualifier
    // over-constrains. Let the ranker apply the incident and date filters
    // instead, which is what it is for.
    const distinctive = !alt.includes(' ') && alt.length >= 6;
    add(distinctive ? alt : `${alt} ${incident}`, altTier,
      `Alternate location anchor: ${alt}`, ['news', 'web'], `place-alt-${i}`);
  });

  if (corridor && place) add(`${corridor} ${place} accident`, 2, 'Highway corridor', ['news', 'web'], 'corridor');
  else if (corridor) add(`${corridor} accident ${year}`.trim(), 2, 'Highway corridor', ['news', 'web'], 'corridor');
  // Only when the two are genuinely different places — "Jaipur Sikar" already
  // contains "Jaipur", and pairing them just repeats a term.
  if (place && place2 && !place.toLowerCase().includes(place2.toLowerCase())
    && !place2.toLowerCase().includes(place.toLowerCase())) {
    add(`${place} ${place2} accident`, 2, 'Spot + district', ['news', 'web'], 'district');
  }

  // --- Tier 3: vernacular (regional dailies publish in the local language) --
  if (includeVernacular && place) {
    // The place goes in native script too. Sending a Latin place name to a
    // Devanagari index is the difference between reaching the district daily
    // and not reaching it.
    const nativePlaces = anchors.languages
      .filter((l) => l !== 'en')
      .slice(0, 3)
      .map((l) => ({ lang: l, native: nativePlaceFor(place, l) }))
      .filter((x) => x.native);

    anchors.vernacularTerms.slice(0, 3).forEach((term, i) => {
      const np = nativePlaces[i % Math.max(nativePlaces.length, 1)];
      add(`${place} ${term}`, 3, `Regional press: ${term}`, ['news', 'web'], `vern-${i}`);
      if (np && np.native !== place) {
        add(`${np.native} ${term}`, 3, `Regional press, native script: ${term}`, ['news', 'web'], `vern-native-${i}`);
      }
    });
  }
  if (anchors.policeStation) {
    add(`${anchors.policeStation} ${place || ''} accident FIR`.trim(), 3, 'Police station blotter', ['news', 'web'], 'police');
  }

  // --- Tier 4: recall and video --------------------------------------------
  if (includeVideo) {
    if (anchors.plates[0]) add(`site:youtube.com ${phrase(anchors.plates[0])}`, 4, 'Video footage by registration plate', ['web'], 'video-plate');
    if (place) add(`site:youtube.com ${place} ${incident}`, 4, 'Video footage by location', ['web'], 'video-place');
  }
  if (anchors.hospital) add(`${anchors.hospital} ${incident} ${place}`.trim(), 4, 'Hospital admission report', ['news'], 'hospital');

  // Last-resort recall so a search never returns an empty plan.
  if (!plan.length && anchors.freeTokens.length) {
    add(`${anchors.freeTokens.slice(0, 5).join(' ')} accident`, 4, 'Keyword recall', ['news', 'web'], 'recall');
  }

  return selectAcrossTiers(plan, maxQueries);
}

// English words that describe a place rather than name it. Transliterating them
// letter by letter produces gibberish — "Ujjain-Indore highway" came out as
// "उज्जैन-इन्दोरे हिघ्वय", where the last word is not a Hindi word at all. The
// name is transliterated; the descriptor is translated, or dropped.
const ENGLISH_GEO_WORDS = [
  'highway', 'road', 'expressway', 'bypass', 'district', 'city', 'town',
  'village', 'chowk', 'circle', 'flyover', 'bridge', 'toll', 'plaza', 'nagar'
];

function nativePlaceFor(place, lang) {
  if (hasIndic(place)) return place;
  const script = scriptForLang(lang);

  const kept = String(place)
    .split(/[\s-]+/)
    .filter((w) => w && !ENGLISH_GEO_WORDS.includes(w.toLowerCase()));
  if (!kept.length) return '';

  const name = kept.map((w) => latinToIndic(w, script)).filter(Boolean).join(' ');
  if (!name) return '';

  // Re-attach the descriptor in the target language when we have one, so a
  // corridor still reads as a corridor to the regional index.
  const hadHighway = /(highway|expressway|road)/i.test(place);
  const descriptor = hadHighway ? (termsFor('highway', [lang])[0] || '') : '';
  return descriptor ? `${name} ${descriptor}` : name;
}

function scriptForLang(lang) {
  const map = {
    hi: 'deva', mr: 'deva', bn: 'beng', as: 'beng', pa: 'guru', gu: 'gujr',
    or: 'orya', ta: 'taml', te: 'telu', kn: 'knda', ml: 'mlym'
  };
  return map[lang] || 'deva';
}

/**
 * Build a deliberately broad plan for the widening pass, used when the precise
 * plan came back empty. Date and identity qualifiers are dropped and the
 * vernacular net is thrown as wide as the language list allows.
 */
export function buildWideningPlan(anchors, options = {}) {
  const { maxQueries = 8 } = options;
  if (!anchors || !anchors.sufficient) return [];
  const plan = [];
  const seen = new Set();
  const add = (query, intent, engines, cls) => {
    const q = scrubQuery(query);
    if (!q || q.length < 3 || seen.has(q.toLowerCase())) return;
    seen.add(q.toLowerCase());
    plan.push({ query: q, tier: 2, intent, cls, engines: engines || ['news', 'web'] });
  };

  const incident = 'accident';
  const places = anchors.places.slice(0, 3);
  const anchorSet = places.length ? places : [anchors.regionHint].filter(Boolean);

  anchorSet.forEach((place, i) => {
    add(`${place} ${incident}`, 'Widened: location + incident', ['news', 'web'], `wide-place-${i}`);
    anchors.vernacularTerms.slice(0, 4).forEach((term, j) => {
      add(`${place} ${term}`, `Widened vernacular: ${term}`, ['news', 'web'], `wide-vern-${i}-${j}`);
    });
    romanVariants(place).slice(1).forEach((v, j) => {
      add(`${v} ${incident}`, `Widened spelling variant: ${v}`, ['news', 'web'], `wide-var-${i}-${j}`);
    });
  });

  if (anchors.corridors[0]) add(`${anchors.corridors[0]} accident`, 'Widened: corridor only', ['news', 'web'], 'wide-corridor');
  if (!plan.length && anchors.freeTokens.length) {
    add(`${anchors.freeTokens.slice(0, 4).join(' ')}`, 'Widened: raw keyword recall', ['news', 'web'], 'wide-recall');
  }

  return plan.slice(0, maxQueries);
}

// Draw order across precision tiers. A plain sort-then-truncate lets a rich
// case fill the whole budget with tier-1 and tier-2 queries, which silently
// drops the vernacular tier — the highest-yield tier for Indian district road
// accidents, where the only report that exists is in the local daily. This
// interleave guarantees every tier gets dispatched.
// Tier 4 (video) appears twice so it is not starved by a case rich in tier-1
// anchors. `site:` queries go to the web engine only — an RSS news feed cannot
// honour a site: operator — so each costs one fetch rather than three.
const TIER_DRAW_ORDER = [1, 1, 2, 3, 4, 1, 2, 3, 4];

function selectAcrossTiers(plan, maxQueries) {
  const queues = new Map();
  plan.forEach((p) => {
    if (!queues.has(p.tier)) queues.set(p.tier, []);
    queues.get(p.tier).push(p);
  });

  const picked = [];
  const usedClasses = new Set();
  let cursor = 0;
  let stalled = 0;

  while (picked.length < maxQueries && stalled < TIER_DRAW_ORDER.length) {
    const tier = TIER_DRAW_ORDER[cursor % TIER_DRAW_ORDER.length];
    cursor += 1;
    const queue = queues.get(tier);
    if (queue && queue.length) {
      // Prefer an angle this plan has not covered yet. Without this a case
      // with a registration number spends its whole tier-1 budget on three
      // spellings of the same plate and never searches the claimant's name.
      let index = queue.findIndex((q) => !usedClasses.has(q.cls));
      if (index === -1) index = 0;
      const [chosen] = queue.splice(index, 1);
      usedClasses.add(chosen.cls);
      picked.push(chosen);
      stalled = 0;
    } else {
      stalled += 1;
    }
  }

  // Budget left over because some tiers ran dry: refill by strict precision.
  if (picked.length < maxQueries) {
    const remaining = [...queues.keys()].sort((a, b) => a - b).flatMap((t) => queues.get(t));
    picked.push(...remaining.slice(0, maxQueries - picked.length));
  }

  picked.sort((a, b) => a.tier - b.tier);
  return picked;
}

// ---------------------------------------------------------------------------
// 10. Relevance scoring
// ---------------------------------------------------------------------------

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// Aggregators serve articles from their own host (Google News RSS links stay on
// news.google.com and only redirect in the browser). Scoring those by URL host
// would rate a Dainik Bhaskar report as a low-trust aggregator page and would
// wipe the real byline off the record, so the publisher the engine reported
// wins whenever we have it.
const AGGREGATOR_HOSTS = ['news.google.com', 'bing.com', 'duckduckgo.com', 'news.yahoo.com'];

// Google News RSS links are opaque redirect IDs that only resolve in a browser.
// They work, but they are unreadable in a report and cannot be cited. When a
// second engine returned the same story as a direct publisher URL, we prefer
// that one for the link the investigator actually sees and copies.
function isAggregatorUrl(url) {
  const h = hostOf(url);
  return !!h && AGGREGATOR_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
}

function publisherOf(result) {
  const urlHost = hostOf(result.url);
  const reported = String(result.domain || '').replace(/^www\./, '').toLowerCase();
  if (reported && (!urlHost || AGGREGATOR_HOSTS.some((h) => urlHost === h || urlHost.endsWith(`.${h}`)))) {
    return reported;
  }
  return urlHost || reported;
}

function domainScore(host) {
  for (const tier of DOMAIN_TIERS) {
    if (tier.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return tier.score;
  }
  return host ? 12 : 0;
}

/**
 * Turn a URL into searchable words.
 *
 * Indian news URLs are Latin-slugged even when the article itself is in
 * Devanagari — bhaskar.com/rajasthan/jaipur/news/chomu-dumper-overturn-123 —
 * so the slug is often the only place a Latin-typed place anchor can match.
 * Leaving the URL out of the haystack, as the original scorer did, gave every
 * native-script report zero location credit.
 */
function urlWords(url) {
  try {
    const u = new URL(url);
    return `${u.hostname} ${u.pathname}`.replace(/[/\-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return String(url || '').replace(/[/\-_.]+/g, ' ');
  }
}

/**
 * A searchable view of one result, built ONCE and reused for every anchor.
 *
 * The phonetic index is the reason this exists. Comparing an anchor against
 * every word of an article is fine; doing it again for each of a dozen anchors,
 * across sixty results that now carry full body text, is not — measured at 26s
 * for a single ranking pass, and 68s with a dozen place anchors. Tokenising and
 * keying once turns that quadratic blow-up back into a linear scan.
 */
function buildHaystack(result) {
  const raw = `${result.title || ''} ${result.snippet || ''} ${result.full_article_text || ''} ${urlWords(result.url || '')}`;
  const lower = raw.toLowerCase();
  const roman = (hasIndic(raw) ? `${raw} ${indicToLatin(raw)}` : raw).toLowerCase();

  const words = new Set(roman.match(/[a-z]{4,}/g) || []);
  const keys = new Set();
  words.forEach((w) => {
    const k = phoneticKey(w);
    if (k.length >= 3) keys.add(k);
  });

  return {
    raw,
    lower,
    roman,
    keys,
    compact: raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  };
}

/** Does `needle` appear in the haystack, allowing for script and spelling drift? */
function matchesAnchor(needle, hay) {
  const n = String(needle || '').trim();
  if (n.length < 3) return false;
  if (hay.lower.includes(n.toLowerCase())) return true;

  const roman = hasIndic(n) ? indicToLatin(n).toLowerCase() : n.toLowerCase();
  if (roman.length >= 4 && hay.roman.includes(roman)) return true;

  // Last resort: compare phonetic keys. This is what lets a Devanagari report
  // on चौमू match an investigator who typed "Chomu".
  if (n.length >= 4 && !n.includes(' ')) {
    const key = phoneticKey(n);
    if (key.length < 4) return false;
    if (hay.keys.has(key)) return true;

    // Long keys tolerate a single edit, for names that schwa deletion cannot
    // fully regularise. Only reached when the exact lookup missed, and only
    // over the article's distinct keys, so it stays bounded.
    if (key.length >= 7) {
      for (const k of hay.keys) {
        if (k.length >= 7 && withinOneEdit(key, k)) return true;
      }
    }
  }
  return false;
}

export const BANDS = { CONFIRMED: 'CONFIRMED', STRONG: 'STRONG', BACKGROUND: 'BACKGROUND' };

/**
 * Score a single search result 0..100 against the anchors, and explain why.
 * Signals are additive and capped; conflicts subtract.
 *
 * Also assigns a confidence band. The band, not the score, is what an
 * investigator should act on: a high score built purely from location and
 * incident words is still not evidence that THIS claim's vehicle was involved.
 */
export function scoreResult(result, anchors) {
  const url = result.url || '';
  const host = publisherOf(result);
  const hay = buildHaystack(result);
  const haystack = hay.raw;
  const lower = hay.lower;
  const compact = hay.compact;

  const reasons = [];
  let score = 0;

  // -- structural rejection --------------------------------------------------
  if (NOISE_PATTERNS.some((re) => re.test(url))) {
    return { score: 0, reasons: ['Rejected: index or commercial page, not an incident report'], matched: [], rejected: true, band: null };
  }
  if (ENTERTAINMENT_NOISE.some((n) => lower.includes(n))) {
    return { score: 0, reasons: ['Rejected: entertainment or commercial content'], matched: [], rejected: true, band: null };
  }

  const matched = [];

  // -- 1. Exact vehicle registration (strongest single signal) --------------
  let plateHit = false;
  for (const p of anchors.plates) {
    const perms = platePermutations(p);
    const hit = perms.some((perm) => lower.includes(perm.toLowerCase())) || compact.includes(plateKey(p));
    if (hit) {
      plateHit = true;
      matched.push(p);
      reasons.push(`Vehicle registration ${p} appears in the source`);
      break;
    }
  }
  if (plateHit) score += 45;

  // -- 2. Named party -------------------------------------------------------
  let nameHit = false;
  for (const n of anchors.names) {
    const tokens = cleanPersonName(n).toLowerCase().split(' ').filter((t) => t.length > 2);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((t) => matchesAnchor(t, hay)).length;
    if (tokens.length >= 2 && hits >= 2) {
      nameHit = true;
      matched.push(n);
      reasons.push(`Named party "${n}" identified in the report`);
      break;
    }
    if (tokens.length === 1 && hits === 1 && anchors.places.some((pl) => matchesAnchor(pl, hay))) {
      nameHit = true;
      matched.push(n);
      reasons.push(`Name "${n}" corroborated alongside the accident location`);
      break;
    }
  }
  if (nameHit) score += 25;

  // -- 3. Organisation ------------------------------------------------------
  let orgHit = false;
  for (const o of anchors.orgs) {
    if (matchesAnchor(o, hay)) {
      orgHit = true;
      matched.push(o);
      reasons.push(`Transport operator "${o}" named in the report`);
      break;
    }
  }
  if (orgHit) score += 22;

  // -- 4. Location ----------------------------------------------------------
  let placeHits = 0;
  anchors.places.forEach((p) => {
    if (p.length >= 4 && matchesAnchor(p, hay)) {
      placeHits += 1;
      matched.push(p);
    }
  });
  if (placeHits) {
    score += Math.min(placeHits * 12, 24);
    reasons.push(`Accident location matched (${placeHits} place reference${placeHits > 1 ? 's' : ''})`);
  }

  // -- 5. Corridor ----------------------------------------------------------
  anchors.corridors.forEach((c) => {
    if (lower.includes(c.toLowerCase())) {
      score += 8;
      matched.push(c);
      reasons.push(`Highway corridor ${c} referenced`);
    }
  });

  // -- 6. Incident vocabulary (necessary, not sufficient) -------------------
  const incidentHit = /accident|crash|collision|overturn|mishap|killed|injured|हादसा|दुर्घटना|टक्कर|घायल|मौत|अपघात|जखमी|અકસ્માત|ઘાયલ|দুর্ঘটনা|আহত|விபத்து|காயம்|ప్రమాదం|గాయాల|ಅಪಘಾತ|ಗಾಯ|അപകടം|പരിക്ക്|ਹਾਦਸਾ|ਜ਼ਖ਼ਮੀ|ଦୁର୍ଘଟଣା|حادثہ|زخمی/i.test(haystack);
  if (incidentHit) {
    score += 10;
  } else {
    score -= 20;
    reasons.push('No road-incident vocabulary present');
  }

  // -- 7. Vehicle type ------------------------------------------------------
  anchors.vehicleTypes.forEach((v) => {
    if (v.length >= 3 && matchesAnchor(v, hay)) {
      score += 4;
      matched.push(v);
    }
  });

  // -- 8. Date proximity ----------------------------------------------------
  let dateHit = false;
  if (anchors.date) {
    const published = parseFlexibleDate(result.publish_date);
    if (published) {
      const days = Math.abs((published - anchors.date) / 86400000);
      if (days <= 2) { score += 18; dateHit = true; reasons.push('Published within 48 hours of the loss date'); }
      else if (days <= 7) { score += 10; dateHit = true; reasons.push('Published within a week of the loss date'); }
      else if (days <= 45) { score += 3; }
      else { score -= 12; reasons.push('Publication date far from the declared loss date'); }
    }
    if (anchors.dateWindow.some((d) => haystack.includes(d))) {
      score += 8;
      dateHit = true;
      reasons.push('Loss date appears verbatim in the source');
    }
  }

  // -- 9. Free-token overlap (what the investigator actually typed) ---------
  //
  // Saturating, not proportional. Under the old ratio a long narrative could
  // only ever lower a genuine article's score; now additional context can
  // help and can never hurt.
  const tokens = anchors.freeTokens.filter((t) => t.length >= 4);
  if (tokens.length) {
    const hits = tokens.filter((t) => matchesAnchor(t, hay)).length;
    score += Math.min(hits * 5, 18);
    if (hits >= 3) reasons.push(`Matches ${hits} of the searched keywords`);
  }

  // -- 10. Source credibility -----------------------------------------------
  const dScore = domainScore(host);
  score += dScore * 0.5;
  if (dScore >= 28) reasons.push('Published by a newspaper of record');
  else if (dScore >= 24) reasons.push('Published by a wire agency');

  // -- 11. Casualty conflict -------------------------------------------------
  if (anchors.casualties) {
    const figures = casualtyFigures(haystack);
    if (figures.size && !figures.has(anchors.casualties)) {
      score -= 30;
      reasons.push(`Casualty count conflicts with the searched figure (${[...figures].join(', ')} vs ${anchors.casualties})`);
    } else if (figures.has(anchors.casualties)) {
      score += 12;
      reasons.push(`Casualty count of ${anchors.casualties} corroborated`);
    }
  }

  const final = Math.max(0, Math.min(100, Math.round(score)));
  if (!reasons.length) reasons.push('Weak keyword overlap only');

  // Banding is about WHAT matched, not how high the total climbed. Location
  // and incident words alone can score well while proving nothing about this
  // particular claim, and presenting that as corroboration is the specific
  // failure this separation exists to prevent.
  //
  // The bar for STRONG depends on what the investigator actually gave us. With
  // a loss date supplied, a STRONG result has to line up with it. With no date
  // at all there is nothing to line up against, so demanding a date match would
  // make every result BACKGROUND however well it matched — the band has to
  // report how well a source fits the available evidence, not penalise the case
  // for what the claim form omitted. Without a date the bar becomes corroborating
  // detail instead: a second place reference, or the vehicle type as well.
  const caseSpecific = plateHit || nameHit || orgHit;
  const vehicleHit = anchors.vehicleTypes.some((v) => v.length >= 3 && matchesAnchor(v, hay));
  const corridorHit = anchors.corridors.some((c) => lower.includes(c.toLowerCase()));

  const strongWithDate = dateHit || corridorHit;
  const strongWithoutDate = !anchors.date && (placeHits >= 2 || vehicleHit);

  let band;
  if (caseSpecific) band = BANDS.CONFIRMED;
  else if (placeHits > 0 && incidentHit && (strongWithDate || strongWithoutDate)) band = BANDS.STRONG;
  else band = BANDS.BACKGROUND;

  return {
    score: final,
    reasons,
    matched: [...new Set(matched)],
    rejected: false,
    band,
    caseSpecific
  };
}

// ---------------------------------------------------------------------------
// 11. De-duplication + ranking
// ---------------------------------------------------------------------------

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'src', 'amp']
      .forEach((p) => u.searchParams.delete(p));
    const path = u.pathname.replace(/\/+$/, '').replace(/\/amp$/i, '');
    return `${u.hostname.replace(/^www\./, '')}${path}${u.search}`.toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

function titleShingles(title) {
  const words = String(title || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 2 < words.length; i += 1) out.add(words.slice(i, i + 3).join(' '));
  if (!out.size && words.length) out.add(words.join(' '));
  return out;
}

// Character trigrams, for titles that word shingles cannot handle.
function charTrigrams(title) {
  const s = String(title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const out = new Set();
  for (let i = 0; i + 3 <= s.length; i += 1) out.add(s.slice(i, i + 3));
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((v) => { if (b.has(v)) inter += 1; });
  return inter / (a.size + b.size - inter);
}

/**
 * How similar are two headlines?
 *
 * Word shingles need at least three words to produce anything, so short
 * Devanagari headlines ("डंपर पलटा तीन घायल") scored ~0.14 against genuinely
 * syndicated copies of themselves and never collapsed. Character trigrams have
 * no such floor, so short or non-Latin titles fall back to them.
 */
function titleSimilarity(a, b) {
  const wordsA = String(a || '').trim().split(/\s+/).filter(Boolean).length;
  const wordsB = String(b || '').trim().split(/\s+/).filter(Boolean).length;
  const shortOrNonLatin = wordsA < 6 || wordsB < 6 || hasIndic(a) || hasIndic(b);

  if (shortOrNonLatin) {
    return { value: jaccard(charTrigrams(a), charTrigrams(b)), threshold: 0.80 };
  }
  return { value: jaccard(titleShingles(a), titleShingles(b)), threshold: 0.72 };
}

/**
 * Are two same-headline results actually the same event?
 *
 * Generic headlines repeat: "Dumper overturns on Jaipur Sikar highway" fits
 * every dumper that ever overturned on that road. Merging on the headline alone
 * collapsed two distinct accidents — different town, different casualty count,
 * weeks apart — into one row and then awarded it a corroboration bonus for
 * being "carried by two outlets". A wrong merge is worse than a duplicate row,
 * so agreement on date and casualty figures is required as well.
 */
function sameIncident(a, b) {
  const da = parseFlexibleDate(a.publish_date);
  const db = parseFlexibleDate(b.publish_date);
  if (da && db && Math.abs((da - db) / 86400000) > 3) return false;

  const fa = casualtyFigures(`${a.title || ''} ${a.snippet || ''}`);
  const fb = casualtyFigures(`${b.title || ''} ${b.snippet || ''}`);
  if (fa.size && fb.size) {
    const shared = [...fa].some((n) => fb.has(n));
    if (!shared) return false;
  }
  return true;
}

/**
 * Score, de-duplicate (by canonical URL and by near-identical headline) and
 * rank results. Syndicated copies of the same story collapse into one row;
 * distinct incidents that happen to share a headline do not.
 */
export function rankAndDedupe(results, anchors, options = {}) {
  const { minScore = 20, limit = 60 } = options;
  const byUrl = new Map();

  (results || []).forEach((r) => {
    if (!r || !r.url) return;
    const key = canonicalUrl(r.url);
    const verdict = scoreResult(r, anchors);
    if (verdict.rejected) return;

    const publisher = publisherOf(r);
    const enriched = {
      ...r,
      domain: publisher,
      relevance_score: verdict.score,
      match_reasons: verdict.reasons,
      matched_keywords: verdict.matched,
      band: verdict.band,
      case_specific: verdict.caseSpecific,
      authoritative: domainScore(publisher) >= 24
    };

    const existing = byUrl.get(key);
    if (!existing || enriched.relevance_score > existing.relevance_score) {
      // Preserve the richest snippet across duplicates.
      if (existing && (existing.snippet || '').length > (enriched.snippet || '').length) {
        enriched.snippet = existing.snippet;
      }
      byUrl.set(key, enriched);
    }
  });

  // CONFIRMED and STRONG are never dropped by the numeric floor: an identifier
  // hit is the whole point of the search, and a short article can score low
  // while still naming the plate.
  //
  // BACKGROUND still has to clear the floor. Exempting it too — which an
  // earlier `|| keepBackground` default did — made the floor dead code and let
  // a zero-scoring air-fryer recipe, returned by an engine that ignored a
  // `site:` operator, sit in the evidence list. Showing every band is not the
  // same as showing every response.
  const unique = [...byUrl.values()].filter(
    (r) => r.band === BANDS.CONFIRMED || r.band === BANDS.STRONG || r.relevance_score >= minScore
  );
  unique.sort((a, b) => b.relevance_score - a.relevance_score);

  // Collapse near-identical headlines (syndication).
  const kept = [];
  const shingleCache = [];
  for (const r of unique) {
    let merged = false;

    for (let i = 0; i < kept.length; i += 1) {
      const primary = kept[i];
      const sim = titleSimilarity(r.title, primary.title);
      if (sim.value < sim.threshold) continue;

      if (!sameIncident(r, primary)) {
        // Same words, different event. Flag both so an investigator is not left
        // to assume two rows about "a dumper on the Jaipur Sikar highway" are
        // the same accident reported twice.
        primary.distinct_incident = true;
        r.distinct_incident = true;
        continue;
      }

      // Same story, better link: swap an opaque aggregator redirect for the
      // direct publisher URL so the record can be opened, cited and archived.
      if (isAggregatorUrl(primary.url) && !isAggregatorUrl(r.url)) {
        primary.aggregator_url = primary.url;
        primary.url = r.url;
        primary.domain = r.domain || primary.domain;
        if ((r.snippet || '').length > (primary.snippet || '').length) primary.snippet = r.snippet;
        if (!primary.publish_date && r.publish_date) primary.publish_date = r.publish_date;
        merged = true;
        break;
      }

      primary.also_reported_by = primary.also_reported_by || [];
      if (r.domain && r.domain !== primary.domain && !primary.also_reported_by.some((x) => x.domain === r.domain)) {
        primary.also_reported_by.push({ domain: r.domain, url: r.url, title: r.title });
      }
      merged = true;
      break;
    }

    if (merged) continue;
    shingleCache.push(titleShingles(r.title));
    kept.push(r);
    if (kept.length >= limit) break;
  }

  // Corroboration bonus: a story carried by several outlets is stronger.
  kept.forEach((r) => {
    const extra = (r.also_reported_by || []).length;
    if (extra >= 1) {
      r.relevance_score = Math.min(100, r.relevance_score + Math.min(extra * 4, 12));
      r.match_reasons = [...(r.match_reasons || []), `Corroborated by ${extra + 1} independent outlets`];
    }
  });

  const bandRank = { [BANDS.CONFIRMED]: 0, [BANDS.STRONG]: 1, [BANDS.BACKGROUND]: 2 };
  kept.sort((a, b) => (bandRank[a.band] - bandRank[b.band]) || (b.relevance_score - a.relevance_score));

  return kept;
}

export const __internals = {
  canonicalUrl, hostOf, domainScore, casualtyFigures, titleShingles, jaccard,
  charTrigrams, titleSimilarity, sameIncident, urlWords, rankFreeTokens,
  scorePlaceCandidate, findOrgs, matchesAnchor
};
