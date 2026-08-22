// ============================================================================
// transliterate.js — Indic <-> Latin script bridge
// ----------------------------------------------------------------------------
// Indian accident reporting is written in the local script, but claim documents
// are filled in Latin. Without a bridge, a Dainik Bhaskar report on चौमू can
// never match an investigator who typed "Chomu", and the whole vernacular tier
// is dead weight.
//
// Two directions, with different jobs:
//
//   indicToLatin()  — LOAD-BEARING. Deterministic: every Indic codepoint has
//                     exactly one romanisation, so romanising the ARTICLE and
//                     comparing against the Latin anchor is reliable. This is
//                     what scoring uses.
//   latinToIndic()  — best-effort. Latin romanisation of Indian names is not
//                     standardised ("Chomu" / "Chaumu" / "Chaumun"), so this
//                     produces a plausible native form for QUERY generation
//                     only. Never used to reject a match.
//
// Pure and deterministic — no network, no dependencies — matching the rest of
// the search core.
// ============================================================================

// Unicode lays the Indic scripts out on a shared ISCII-derived grid: the same
// relative offset means the same letter in every script. So one Devanagari
// table plus a base offset transcodes all of them.
export const SCRIPT_BASE = {
  deva: 0x0900, // Hindi, Marathi, Nepali, Konkani
  beng: 0x0980, // Bengali, Assamese
  guru: 0x0A00, // Punjabi (Gurmukhi)
  gujr: 0x0A80, // Gujarati
  orya: 0x0B00, // Odia
  taml: 0x0B80, // Tamil
  telu: 0x0C00, // Telugu
  knda: 0x0C80, // Kannada
  mlym: 0x0D00  // Malayalam
};

// Which script each language is written in.
export const LANG_SCRIPT = {
  hi: 'deva', mr: 'deva', ne: 'deva', kok: 'deva',
  bn: 'beng', as: 'beng',
  pa: 'guru', gu: 'gujr', or: 'orya',
  ta: 'taml', te: 'telu', kn: 'knda', ml: 'mlym'
};

// Devanagari -> Latin. The canonical table; every other script is folded onto
// this grid by offset before lookup.
const DEVA_TO_LATIN = {
  // independent vowels
  0x05: 'a', 0x06: 'aa', 0x07: 'i', 0x08: 'ii', 0x09: 'u', 0x0A: 'uu',
  0x0B: 'ri', 0x0C: 'li', 0x0F: 'e', 0x10: 'ai', 0x13: 'o', 0x14: 'au',
  0x0D: 'e', 0x11: 'o', 0x0E: 'e', 0x12: 'o',
  // consonants
  0x15: 'k', 0x16: 'kh', 0x17: 'g', 0x18: 'gh', 0x19: 'ng',
  0x1A: 'ch', 0x1B: 'chh', 0x1C: 'j', 0x1D: 'jh', 0x1E: 'ny',
  0x1F: 't', 0x20: 'th', 0x21: 'd', 0x22: 'dh', 0x23: 'n',
  0x24: 't', 0x25: 'th', 0x26: 'd', 0x27: 'dh', 0x28: 'n', 0x29: 'n',
  0x2A: 'p', 0x2B: 'ph', 0x2C: 'b', 0x2D: 'bh', 0x2E: 'm',
  0x2F: 'y', 0x30: 'r', 0x31: 'r', 0x32: 'l', 0x33: 'l', 0x34: 'l',
  0x35: 'v', 0x36: 'sh', 0x37: 'sh', 0x38: 's', 0x39: 'h',
  // dependent vowel signs (matras)
  0x3E: 'aa', 0x3F: 'i', 0x40: 'ii', 0x41: 'u', 0x42: 'uu',
  0x43: 'ri', 0x47: 'e', 0x48: 'ai', 0x4B: 'o', 0x4C: 'au',
  0x45: 'e', 0x49: 'o', 0x46: 'e', 0x4A: 'o',
  // signs
  0x01: 'n', 0x02: 'n', 0x03: 'h', 0x3C: '', 0x4D: '',
  // Nukta consonants. ड़ and ढ़ are retroflex flaps: Indian place names romanise
  // them as r, which is why चित्तौड़गढ़ is written "Chittorgarh" and not
  // "Chittodgadh". Mapping them to d loses every "-garh" and "-gadh" town.
  0x58: 'k', 0x59: 'kh', 0x5A: 'g', 0x5B: 'j', 0x5C: 'r', 0x5D: 'rh',
  0x5E: 'f', 0x5F: 'y'
};

// Consonant range on the shared grid — used to decide where an implicit 'a'
// belongs. Without this every word romanises as a consonant pile ("chm" not
// "chomu") and nothing matches.
// A nukta under a base consonant makes a different sound. Devanagari encodes
// these both ways — precomposed (U+095C) and decomposed (U+0921 U+093C) — so
// the decomposed form has to be remapped here or half the corpus romanises
// wrongly.
const NUKTA_MAP = {
  0x15: 'k', 0x16: 'kh', 0x17: 'g', 0x1C: 'z',
  0x21: 'r', 0x22: 'rh', 0x2B: 'f', 0x2F: 'y'
};

const CONS_MIN = 0x15;
const CONS_MAX = 0x39;
const VIRAMA = 0x4D;
const NUKTA = 0x3C;
const MATRA_MIN = 0x3E;
const MATRA_MAX = 0x4C;

// Indic digits sit at offset 0x66..0x6F in every script.
const DIGIT_MIN = 0x66;
const DIGIT_MAX = 0x6F;

/** Which script (if any) a codepoint belongs to. */
function scriptOf(code) {
  for (const [name, base] of Object.entries(SCRIPT_BASE)) {
    if (code >= base && code <= base + 0x7F) return { name, base };
  }
  return null;
}

// One native regex pass rather than a per-character loop: this is called on
// every result and on whole documents, where the loop cost 81ms per 96KB.
const INDIC_RANGE = /[ऀ-ൿ]/;

export function hasIndic(text) {
  return INDIC_RANGE.test(String(text || ''));
}

function isMatra(offset) {
  return (offset >= MATRA_MIN && offset <= MATRA_MAX)
    || offset === 0x45 || offset === 0x46 || offset === 0x49 || offset === 0x4A;
}

/**
 * Break one Indic word into syllables: { c, v, inherent }.
 * `inherent` marks a vowel the writing system implies rather than spells — the
 * schwa, which is the whole difficulty of romanising Hindi.
 */
function syllabify(word) {
  const out = [];
  for (let i = 0; i < word.length; i += 1) {
    const code = word.charCodeAt(i);
    const script = scriptOf(code);
    if (!script) {
      out.push({ c: word[i], v: '', inherent: false, literal: true });
      continue;
    }

    const offset = code - script.base;

    if (offset >= DIGIT_MIN && offset <= DIGIT_MAX) {
      out.push({ c: String(offset - DIGIT_MIN), v: '', inherent: false, literal: true });
      continue;
    }

    const latin = DEVA_TO_LATIN[offset];
    if (latin === undefined) continue;

    if (offset >= CONS_MIN && offset <= CONS_MAX) {
      // Look past a nukta: it modifies the consonant, it does not kill the
      // vowel. The modified sound differs from the base — ड + nukta is the
      // flap in "Chittorgarh", not a d — so remap rather than ignore.
      let j = i + 1;
      let sound = latin;
      while (j < word.length) {
        const nx = word.charCodeAt(j);
        const nsc = scriptOf(nx);
        if (nsc && nx - nsc.base === NUKTA) {
          sound = NUKTA_MAP[offset] || sound;
          j += 1;
          continue;
        }
        break;
      }
      const next = j < word.length ? word.charCodeAt(j) : -1;
      const nsc = next >= 0 ? scriptOf(next) : null;
      const nOffset = nsc ? next - nsc.base : -1;

      if (nOffset === VIRAMA) {
        out.push({ c: sound, v: '', inherent: false });
      } else if (isMatra(nOffset)) {
        out.push({ c: sound, v: DEVA_TO_LATIN[nOffset] || '', inherent: false });
      } else {
        out.push({ c: sound, v: 'a', inherent: true });
      }
    } else if (isMatra(offset) || offset === VIRAMA || offset === NUKTA) {
      // consumed by the consonant above
    } else {
      // independent vowel or sign
      out.push({ c: '', v: latin, inherent: false });
    }
  }
  return out;
}

/**
 * Hindi and its neighbours write the inherent schwa but do not pronounce it:
 * जयपुर is "Jaipur", not "jayapura", and कोलकाता is "Kolkata", not "kolakaataa".
 * Romanising literally therefore produces a form no investigator would ever
 * type, and every cross-script comparison fails on the spurious vowels.
 *
 * Two standard deletion rules cover almost all real place and person names:
 *   1. a word-final inherent schwa is always dropped;
 *   2. an inherent schwa is dropped in V-C-_-C-V context — that is, when the
 *      syllable before it and the syllable after it both still carry a vowel.
 *
 * This is Ohala's rule, and it must be applied right-to-left over the CURRENT
 * state, because the deletions cascade: in भरतपुर the final schwa goes first,
 * which removes the right-hand vowel that would otherwise have licensed
 * deleting the next one along — giving "Bharatpur" rather than "Bharatpr".
 * Applying it against a frozen snapshot instead gets those words wrong.
 *
 * Word-initial schwa is never deleted: there is no preceding vowel to satisfy
 * the context, and dropping it would turn अलवर into "lwar".
 */
function deleteSchwa(syllables) {
  const out = syllables.map((s) => ({ ...s }));

  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (!out[i].inherent || out[i].literal || !out[i].v) continue;

    if (i === out.length - 1) { out[i].v = ''; continue; }

    const prevHasVowel = i > 0 && !!out[i - 1].v;
    const nextHasVowel = !!out[i + 1].v;
    if (prevHasVowel && nextHasVowel) out[i].v = '';
  }
  return out;
}

/**
 * Romanise Indic text. Deterministic and stable: the same word always produces
 * the same Latin form, which is what matching requires.
 */
export function indicToLatin(text) {
  return String(text || '')
    .split(/(\s+)/)
    .map((chunk) => (/\s/.test(chunk) ? chunk : deleteSchwa(syllabify(chunk)).map((s) => s.c + s.v).join('')))
    .join('');
}

// ---------------------------------------------------------------------------
// Latin -> Indic (query generation only)
// ---------------------------------------------------------------------------

// Longest-match-first, so "chh" wins over "ch" and "ch" over "c".
const LATIN_CONS = [
  ['kshh', 0x15], ['ksh', 0x15], ['chh', 0x1A], ['sh', 0x36], ['ch', 0x1A],
  ['kh', 0x16], ['gh', 0x18], ['jh', 0x1D], ['th', 0x25], ['dh', 0x27],
  ['ph', 0x2B], ['bh', 0x2D], ['ng', 0x19], ['ny', 0x1E],
  ['k', 0x15], ['q', 0x15], ['g', 0x17], ['c', 0x15], ['j', 0x1C], ['z', 0x1C],
  ['t', 0x24], ['d', 0x26], ['n', 0x28], ['p', 0x2A], ['f', 0x2B], ['b', 0x2C],
  ['m', 0x2E], ['y', 0x2F], ['r', 0x30], ['l', 0x32], ['v', 0x35], ['w', 0x35],
  ['s', 0x38], ['h', 0x39], ['x', 0x15]
];

// [latin, independent vowel offset, matra offset]
const LATIN_VOWELS = [
  ['aa', 0x06, 0x3E], ['ai', 0x10, 0x48], ['au', 0x14, 0x4C],
  ['ee', 0x08, 0x40], ['ii', 0x08, 0x40], ['oo', 0x0A, 0x42], ['uu', 0x0A, 0x42],
  ['a', 0x05, null], ['i', 0x07, 0x3F], ['u', 0x09, 0x41],
  ['e', 0x0F, 0x47], ['o', 0x13, 0x4B]
];

/**
 * Produce a plausible native-script form of a Latin word. Best-effort by
 * design — used to widen a query, never to reject a result.
 */
export function latinToIndic(text, script = 'deva') {
  const base = SCRIPT_BASE[script];
  if (!base) return '';
  const ch = (offset) => String.fromCharCode(base + offset);

  const s = String(text || '').toLowerCase();
  let out = '';
  let i = 0;
  let lastWasConsonant = false;

  while (i < s.length) {
    if (!/[a-z]/.test(s[i])) {
      out += s[i];
      lastWasConsonant = false;
      i += 1;
      continue;
    }

    const cons = LATIN_CONS.find((c) => s.startsWith(c[0], i));
    if (cons) {
      // A consonant directly after another needs an explicit virama, or the
      // reader gets a spurious inherent 'a' between them.
      if (lastWasConsonant) out += ch(VIRAMA);
      out += ch(cons[1]);
      lastWasConsonant = true;
      i += cons[0].length;
      continue;
    }

    const vow = LATIN_VOWELS.find((v) => s.startsWith(v[0], i));
    if (vow) {
      if (lastWasConsonant) {
        if (vow[2] !== null) out += ch(vow[2]); // 'a' is inherent — no matra
      } else {
        out += ch(vow[1]);
      }
      lastWasConsonant = false;
      i += vow[0].length;
      continue;
    }

    i += 1;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Phonetic matching
// ---------------------------------------------------------------------------

// Collapses the ways one Indian name gets romanised, so that "Chomu",
// "Chaumu", "Chaumoo" and चौमू all land on a single key.
//
// Schwa deletion happens upstream in indicToLatin(), so by the time a word
// reaches here both sides are already spelled the way a person would say them.
// What remains is ordinary romanisation drift: aspirates written with or
// without the h, ee/ii, oo/uu, au/o, ai/e, v/w, and unstable trailing vowels.
// The rules stay deliberately mild — flattening every vowel would merge Chomu
// with Chennai, and a wrong place match in a fraud file is worse than a miss.
const PHONETIC_RULES = [
  [/[^a-z]/g, ''],
  [/ck/g, 'k'], [/q/g, 'k'], [/x/g, 'ks'],
  [/chh/g, 'c'], [/ch/g, 'c'], [/sh/g, 's'],
  [/ph/g, 'f'], [/gh/g, 'g'], [/kh/g, 'k'], [/bh/g, 'b'],
  [/dh/g, 'd'], [/th/g, 't'], [/jh/g, 'j'],
  [/z/g, 's'], [/w/g, 'v'],
  [/ee/g, 'i'], [/ii/g, 'i'], [/oo/g, 'u'], [/uu/g, 'u'], [/aa/g, 'a'],
  [/au/g, 'o'], [/ou/g, 'o'], [/ow/g, 'o'],
  [/ai/g, 'e'], [/ay/g, 'e'], [/ey/g, 'e'], [/y/g, 'i'],
  [/(.)\1+/g, '$1'],    // doubled letters carry no distinction
  [/[mn]+/g, 'n'],      // anusvara is m before labials, n elsewhere
  [/[aeiou]+$/g, '']    // trailing vowel is the least stable part of all
];

// Keying is pure and gets called with the same words over and over — once per
// anchor per result, across sixty results. Memoising turns the scoring pass
// from quadratic in article length into linear.
const keyCache = new Map();
const KEY_CACHE_MAX = 20000;

/**
 * A romanisation-invariant key for one word. Indic input is romanised first, so
 * a Devanagari word and its Latin spelling produce the same key.
 */
export function phoneticKey(word) {
  const input = String(word || '');
  if (input.length > 64) return rawPhoneticKey(input);

  const hit = keyCache.get(input);
  if (hit !== undefined) return hit;

  const value = rawPhoneticKey(input);
  if (keyCache.size >= KEY_CACHE_MAX) keyCache.clear();
  keyCache.set(input, value);
  return value;
}

function rawPhoneticKey(word) {
  let s = String(word || '');
  if (hasIndic(s)) s = indicToLatin(s);
  s = s.toLowerCase();
  PHONETIC_RULES.forEach(([re, to]) => { s = s.replace(re, to); });
  return s;
}

/**
 * Levenshtein distance, capped — we only ever care whether it is 0 or 1.
 * Exported so callers holding pre-computed keys can compare them directly
 * rather than re-keying through phoneticEquals.
 */
export function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Do two words match once romanisation differences are collapsed?
 *
 * Guarded on source length and key length: normalisation leaves short words
 * with almost no signal, and "Ram" matching "Rana" in a fraud file is a worse
 * outcome than missing a match.
 *
 * Long keys are allowed a single edit. Schwa deletion is a two-rule heuristic
 * and genuinely irregular names slip through it — चित्तौड़गढ़ romanises one
 * vowel away from "Chittorgarh". At seven characters or more the consonant
 * skeleton is distinctive enough that one character of slack cannot collide two
 * different towns, while below that it easily could.
 */
export function phoneticEquals(a, b) {
  const wa = String(a || '').trim();
  const wb = String(b || '').trim();
  if (wa.length < 4 || wb.length < 4) return false;
  const ka = phoneticKey(wa);
  const kb = phoneticKey(wb);
  if (!ka || ka.length < 3) return false;
  if (ka === kb) return true;
  return ka.length >= 7 && kb.length >= 7 && withinOneEdit(ka, kb);
}

/**
 * Plausible alternate romanisations of a Latin name, for widening a query.
 * Deliberately small — every variant costs a real engine fetch.
 */
export function romanVariants(word) {
  const w = String(word || '').trim();
  // Only single tokens. Applied to a phrase the swaps mangle the ordinary
  // English words in it too — "Ujjain-Indore highway" came back as
  // "oojjain-Indore highway", which is not a spelling anyone uses.
  if (w.length < 4 || /[\s-]/.test(w) || hasIndic(w)) return [w].filter(Boolean);

  const out = new Set([w]);
  // The first letter is never swapped: it carries most of a name's
  // recognisability, and altering it is what turned Ujjain into "oojjain".
  const head = w[0];
  const tail = w.slice(1);
  const swaps = [
    [/oo/gi, 'u'], [/u/gi, 'oo'], [/ee/gi, 'i'], [/i$/i, 'ee'],
    [/au/gi, 'o'], [/v/gi, 'w'], [/w/gi, 'v'], [/ck/gi, 'k'], [/ph/gi, 'f']
  ];
  swaps.forEach(([re, to]) => {
    const v = head + tail.replace(re, to);
    if (v !== w && v.length >= 3) out.add(v);
  });

  return [...out].slice(0, 3);
}

/** Romanise an entire haystack once, for anchor matching during scoring. */
export function romanisedHaystack(text) {
  const s = String(text || '');
  return hasIndic(s) ? `${s} ${indicToLatin(s)}` : s;
}

export const __test = { scriptOf, DEVA_TO_LATIN };
