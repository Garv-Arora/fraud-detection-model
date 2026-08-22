// ============================================================================
// googleDeepLinks.js — "Type it into Google yourself" query console
// ----------------------------------------------------------------------------
// Builds the exact, clickable search URLs an investigator would type by hand,
// derived entirely from the anchors of the case / keywords being searched.
//
// These are deterministic and always available (no network, no API key), so
// the Search Lab can hand the investigator a working research trail even when
// a live engine is rate-limited or the case has no digital footprint at all.
// ============================================================================

import {
  platePermutations, RTO_STATE_CODES, isDistinctiveName, cleanPersonName,
  toISO, shiftDays, formatLongDate
} from './searchIntel.js';
import { VERNACULAR_TERMS } from './vernacular.js';

const enc = encodeURIComponent;

// Regional and national outlets that actually carry district road-accident
// reporting in India. `site:` restricting to these is the single highest-yield
// manual technique an RCU investigator has.
export const PRESS_DOMAINS = [
  // Hindi belt
  { domain: 'bhaskar.com', label: 'Dainik Bhaskar', lang: 'hi', epaper: 'https://epaper.bhaskar.com/' },
  { domain: 'jagran.com', label: 'Dainik Jagran', lang: 'hi', epaper: 'https://epaper.jagran.com/' },
  { domain: 'amarujala.com', label: 'Amar Ujala', lang: 'hi', epaper: 'https://epaper.amarujala.com/' },
  { domain: 'patrika.com', label: 'Rajasthan Patrika', lang: 'hi', epaper: 'https://epaper.patrika.com/' },
  { domain: 'livehindustan.com', label: 'Hindustan (Hindi)', lang: 'hi', epaper: 'https://epaper.livehindustan.com/' },
  { domain: 'navbharattimes.indiatimes.com', label: 'Navbharat Times', lang: 'hi', epaper: null },
  { domain: 'aajtak.in', label: 'Aaj Tak', lang: 'hi', epaper: null },
  // Regional-language dailies. These carry the district road-accident report
  // that no national outlet ever files, and outside the Hindi belt they are the
  // only place it exists.
  { domain: 'lokmat.com', label: 'Lokmat (Marathi)', lang: 'mr', epaper: 'https://epaper.lokmat.com/' },
  { domain: 'esakal.com', label: 'Sakal (Marathi)', lang: 'mr', epaper: 'https://epaper.esakal.com/' },
  { domain: 'maharashtratimes.com', label: 'Maharashtra Times', lang: 'mr', epaper: null },
  { domain: 'sandesh.com', label: 'Sandesh (Gujarati)', lang: 'gu', epaper: 'https://epaper.sandesh.com/' },
  { domain: 'divyabhaskar.co.in', label: 'Divya Bhaskar (Gujarati)', lang: 'gu', epaper: 'https://epaper.divyabhaskar.co.in/' },
  { domain: 'dinamalar.com', label: 'Dinamalar (Tamil)', lang: 'ta', epaper: 'https://epaper.dinamalar.com/' },
  { domain: 'dailythanthi.com', label: 'Daily Thanthi (Tamil)', lang: 'ta', epaper: null },
  { domain: 'eenadu.net', label: 'Eenadu (Telugu)', lang: 'te', epaper: 'https://epaper.eenadu.net/' },
  { domain: 'sakshi.com', label: 'Sakshi (Telugu)', lang: 'te', epaper: 'https://epaper.sakshi.com/' },
  { domain: 'prajavani.net', label: 'Prajavani (Kannada)', lang: 'kn', epaper: 'https://epaper.prajavani.net/' },
  { domain: 'mathrubhumi.com', label: 'Mathrubhumi (Malayalam)', lang: 'ml', epaper: 'https://epaper.mathrubhumi.com/' },
  { domain: 'manoramaonline.com', label: 'Malayala Manorama', lang: 'ml', epaper: null },
  { domain: 'anandabazar.com', label: 'Anandabazar Patrika (Bengali)', lang: 'bn', epaper: 'https://epaper.anandabazar.com/' },
  { domain: 'bartamanpatrika.com', label: 'Bartaman (Bengali)', lang: 'bn', epaper: null },
  { domain: 'ajitjalandhar.com', label: 'Ajit (Punjabi)', lang: 'pa', epaper: 'https://epaper.ajitjalandhar.com/' },
  { domain: 'sambadepaper.com', label: 'Sambad (Odia)', lang: 'or', epaper: 'https://epaper.sambadepaper.com/' },
  // National English
  { domain: 'timesofindia.indiatimes.com', label: 'Times of India', lang: 'en', epaper: 'https://epaper.indiatimes.com/' },
  { domain: 'hindustantimes.com', label: 'Hindustan Times', lang: 'en', epaper: 'https://epaper.hindustantimes.com/' },
  { domain: 'indianexpress.com', label: 'Indian Express', lang: 'en', epaper: 'https://epaper.indianexpress.com/' },
  { domain: 'ndtv.com', label: 'NDTV', lang: 'en', epaper: null },
  { domain: 'news18.com', label: 'News18', lang: 'en', epaper: null }
];

/**
 * The mastheads worth checking by hand for a given case, most relevant first.
 * With twenty-eight outlets in the table, showing all of them for every case
 * buries the two that matter; the language the case is actually in decides.
 */
export function pressForLanguages(languages = []) {
  const langs = languages.length ? languages : ['en', 'hi'];
  // English is always in the sweep, but it must not lead the manual trail: the
  // national English papers are the ones an investigator would check anyway,
  // while the regional daily is the one that actually carries the district
  // report and the one they are least likely to think of.
  const regional = langs.filter((l) => l !== 'en');

  const rank = (d) => {
    if (d.lang === 'en') return regional.length ? 50 : 0;
    const i = regional.indexOf(d.lang);
    return i === -1 ? 99 : i;
  };
  return [...PRESS_DOMAINS].sort((a, b) => rank(a) - rank(b));
}

function googleUrl(query, extra = '') {
  return `https://www.google.com/search?q=${enc(query)}&hl=en&gl=in${extra}`;
}

function googleNewsUrl(query) {
  return `https://www.google.com/search?q=${enc(query)}&tbm=nws&hl=en&gl=in`;
}

// Google's custom-date-range operator, so the investigator lands directly on
// the T-1 .. T+3 publication window around the declared loss date.
function googleDateRangeUrl(query, from, to) {
  const fmt = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  const tbs = `cdr:1,cd_min:${fmt(from)},cd_max:${fmt(to)}`;
  return `https://www.google.com/search?q=${enc(query)}&tbs=${enc(tbs)}&hl=en&gl=in`;
}

/**
 * Build the full manual-research link set for a set of anchors.
 *
 * @param {object} anchors  Output of extractAnchors().
 * @returns {Array<{group:string, links:Array}>}
 */
export function buildGoogleDeepLinks(anchors) {
  if (!anchors) return [];

  const place = anchors.places[0] || '';
  const place2 = anchors.places[1] || '';
  const plate = anchors.plates[0] || '';
  const name = anchors.names.find(isDistinctiveName) || anchors.names[0] || '';
  const vtype = anchors.vehicleTypes[0] || '';
  const incident = anchors.incidentTerms.find((t) => t !== 'police' && t !== 'fir') || 'accident';
  const hindi = anchors.hindiTerms[0] || 'सड़क हादसा';
  // The word for "road accident" in a given masthead's language, or null for
  // English outlets, which take the plain incident term.
  const vernacularFor = (lang) => {
    if (!lang || lang === 'en') return null;
    const byLang = VERNACULAR_TERMS.accident || {};
    return (byLang[lang] || [])[0] || null;
  };
  const date = anchors.date;
  const dateISO = anchors.dateISO;
  const literal = (anchors.raw || '').trim();

  // The single query that best represents this case in plain Google. Anchor
  // terms the investigator already typed are not appended again — repeating
  // them ("Chittorgarh truck accident Chittorgarh truck accident") narrows
  // Google's results for no benefit and looks broken in the UI.
  const primary = (() => {
    const parts = [];
    const seen = new Set();
    const push = (value) => {
      const v = String(value || '').trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      // Skip anything already present as a whole word in what we have so far.
      const soFar = parts.join(' ').toLowerCase();
      if (soFar && new RegExp(`(?:^|\\W)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\W|$)`).test(soFar)) return;
      seen.add(key);
      parts.push(v);
    };
    push(literal);
    [plate, place, vtype, incident].forEach(push);
    return parts.join(' ').replace(/\s+/g, ' ').trim() || literal || place || 'road accident';
  })();

  const groups = [];

  // ---------------------------------------------------------------- Google --
  const core = [];
  core.push({
    label: 'Google Web Search',
    sub: primary,
    url: googleUrl(primary),
    why: 'Exactly what a plain Google search of these keywords returns.'
  });
  core.push({
    label: 'Google News',
    sub: primary,
    url: googleNewsUrl(primary),
    why: 'Restricts to indexed news outlets only — filters out forums and listings.'
  });
  core.push({
    label: 'Google Verbatim (no synonym expansion)',
    sub: primary,
    url: googleUrl(primary, `&tbs=${enc('li:1')}`),
    why: 'Forces Google to match your terms literally; essential for plates and rare place names.'
  });

  if (plate) {
    const perms = platePermutations(plate);
    core.push({
      label: 'Registration plate — all written forms',
      sub: perms.map((p) => `"${p}"`).join(' OR '),
      url: googleUrl(`${perms.map((p) => `"${p}"`).join(' OR ')} accident`),
      why: 'Press and police write the same plate five different ways; this covers every form at once.'
    });
  }
  if (name && isDistinctiveName(name)) {
    core.push({
      label: 'Named party + incident',
      sub: `"${cleanPersonName(name)}" ${place} accident FIR`,
      url: googleUrl(`"${cleanPersonName(name)}" ${place} accident FIR`.trim()),
      why: 'Finds the claimant or driver named in a news report or police bulletin.'
    });
  }
  if (date) {
    const from = shiftDays(date, -1);
    const to = shiftDays(date, 3);
    core.push({
      label: `Date-locked window (${toISO(from)} → ${toISO(to)})`,
      sub: `${primary} — published T-1 to T+3`,
      url: googleDateRangeUrl(primary, from, to),
      why: `Regional dailies publish the morning after the incident. This is the ${formatLongDate(date)} publication window.`
    });
  }
  if (place) {
    core.push({
      label: 'Hindi vernacular search',
      sub: `${place} ${hindi}`,
      url: googleUrl(`${place} ${hindi}`),
      why: 'District road accidents are reported in Hindi first, in English rarely or never.'
    });
  }
  groups.push({ group: 'Google — primary research', icon: 'search', links: core });

  // ---------------------------------------------------- Press site: queries --
  // Ordered by the languages this case actually points at, and each masthead
  // is queried in its OWN language: a site:lokmat.com search phrased in Hindi
  // reaches almost nothing, because Lokmat publishes in Marathi.
  const relevantPress = pressForLanguages(anchors.languages);
  const pressLinks = relevantPress.map((p) => {
    const native = vernacularFor(p.lang);
    const terms = native
      ? `${place || literal} ${native}`.trim()
      : `${place || literal} ${incident}`.trim();
    const q = `site:${p.domain} ${terms}${dateISO ? ` ${dateISO}` : ''}`.trim();
    return {
      label: p.label,
      sub: q,
      url: googleUrl(q),
      why: `Searches only ${p.label}'s own archive for this district and incident.`
    };
  });
  groups.push({ group: 'Newspaper archives (site: restricted)', icon: 'newspaper', links: pressLinks });

  // ------------------------------------------------------------- ePapers ----
  if (date) {
    const nextDay = shiftDays(date, 1);
    const epaperLinks = relevantPress.filter((p) => p.epaper).map((p) => ({
      label: `${p.label} ePaper`,
      sub: `${place || 'District'} edition — ${toISO(nextDay)} (T+1 print run)`,
      url: p.epaper,
      why: 'Print-only district crime pages are frequently absent from the web edition. Check the T+1 morning scan.'
    }));
    groups.push({ group: `ePaper archives — ${formatLongDate(nextDay)} edition`, icon: 'book', links: epaperLinks });
  }

  // -------------------------------------------------------- Video & image ---
  const videoLinks = [];
  const ytQuery = [place, vtype, incident, dateISO ? dateISO.slice(0, 4) : ''].filter(Boolean).join(' ');
  videoLinks.push({
    label: 'YouTube — incident footage',
    sub: ytQuery,
    url: `https://www.youtube.com/results?search_query=${enc(ytQuery)}`,
    why: 'Local news channels and bystanders post spot footage within hours.'
  });
  if (plate) {
    videoLinks.push({
      label: 'YouTube — by registration plate',
      sub: plate,
      url: `https://www.youtube.com/results?search_query=${enc(plate)}`,
      why: 'Catches dashcam and bystander clips that name the vehicle.'
    });
  }
  videoLinks.push({
    label: 'Google Videos',
    sub: primary,
    url: googleUrl(primary, '&tbm=vid'),
    why: 'Indexes video across YouTube, news sites and regional platforms at once.'
  });
  videoLinks.push({
    label: 'Google Images — spot and damage photos',
    sub: primary,
    url: googleUrl(primary, '&tbm=isch'),
    why: 'Wreckage photos often surface before any article text is indexed.'
  });
  groups.push({ group: 'Video & image evidence', icon: 'video', links: videoLinks });


  // --------------------------------------------------- Location & registry --
  const registryLinks = [];
  if (place) {
    const spot = [place, place2, anchors.corridors[0]].filter(Boolean).join(' ');
    registryLinks.push({
      label: 'Google Maps — accident spot',
      sub: spot,
      url: `https://www.google.com/maps/search/${enc(spot)}`,
      why: 'Confirms the declared spot exists, and whether the road geometry matches the narrative.'
    });
    registryLinks.push({
      label: 'Street View / imagery check',
      sub: spot,
      url: `https://www.google.com/maps/search/${enc(spot)}/data=!3m1!1e3`,
      why: 'Satellite view verifies divider, flyover or bend claimed in the FIR narrative.'
    });
  }
  if (anchors.policeStation) {
    registryLinks.push({
      label: 'Police station bulletin',
      sub: `${anchors.policeStation} ${place} FIR accident`,
      url: googleUrl(`${anchors.policeStation} ${place} FIR accident ${dateISO}`.trim()),
      why: 'Some state police units publish daily FIR digests that are web-indexed.'
    });
  }
  if (anchors.hospital) {
    registryLinks.push({
      label: 'Hospital / MLC reference',
      sub: `${anchors.hospital} ${incident} ${place}`,
      url: googleUrl(`${anchors.hospital} ${incident} ${place}`.trim()),
      why: 'Cross-checks the admission claim against any press mention of casualty transfers.'
    });
  }
  if (plate) {
    const st = RTO_STATE_CODES[plate.slice(0, 2)];
    registryLinks.push({
      label: 'Vahan public registration lookup',
      sub: `${plate}${st ? ` — ${st} RTO` : ''}`,
      url: 'https://vahan.parivahan.gov.in/vahan4dashboard/',
      why: 'Government registry: confirms make, model and registration date against the claim.'
    });
    registryLinks.push({
      label: 'mParivahan / RTO detail search',
      sub: plate,
      url: googleUrl(`${plate} RTO registration details owner`),
      why: 'Public aggregators surface registration year and RTO office for the plate.'
    });
  }
  if (registryLinks.length) {
    groups.push({ group: 'Location & public registry checks', icon: 'map', links: registryLinks });
  }

  // ------------------------------------------------------- Other engines ----
  const otherLinks = [
    {
      label: 'Bing',
      sub: primary,
      url: `https://www.bing.com/search?q=${enc(primary)}&cc=IN`,
      why: 'Indexes some regional sites Google drops; worth a second pass.'
    },
    {
      label: 'DuckDuckGo',
      sub: primary,
      url: `https://duckduckgo.com/?q=${enc(primary)}&kl=in-en`,
      why: 'No personalisation — returns the unfiltered baseline result set.'
    },
    {
      label: 'X / Twitter',
      sub: `${place} ${incident}`,
      url: `https://x.com/search?q=${enc(`${place} ${incident}`.trim())}&f=live`,
      why: 'District police handles and local reporters post before articles are filed.'
    }
  ];
  if (date) {
    otherLinks.push({
      label: 'Google cached / archived copies',
      sub: primary,
      url: `https://web.archive.org/web/*/${enc(primary)}`,
      why: 'Recovers reports that were published then pulled down.'
    });
  }
  groups.push({ group: 'Alternate engines & archives', icon: 'globe', links: otherLinks });

  return groups;
}

/**
 * Flatten the grouped deep links into a single list — used for CSV/JSON export
 * and for the "open all" action.
 */
export function flattenDeepLinks(groups) {
  const out = [];
  (groups || []).forEach((g) => {
    (g.links || []).forEach((l) => out.push({ group: g.group, ...l }));
  });
  return out;
}
