// ============================================================================
// vernacular.js — Indian-language search vocabulary
// ----------------------------------------------------------------------------
// Indian road accidents are reported in the local language, in the local
// script, by the local daily. An English-only query reaches the national
// press, which almost never covers a district road accident. This file is what
// lets the search speak the language the report was actually written in.
//
// Three tables:
//   VERNACULAR_TERMS   canonical English term -> native-script equivalents
//   NATIVE_TO_CANON    the inverse, so pasted native-script text yields anchors
//   ROMANISED_TERMS    the way Indians actually type on a Latin keyboard
//                      ("dumper palta", "teen ghayal")
//
// Plus LANGUAGES_FOR_STATE, which orders the sweep by the languages actually
// spoken where the accident happened. It orders; it never restricts.
// ============================================================================

// Canonical term -> { lang: [native terms] }. Only terms that genuinely change
// a query are listed — a longer table costs a real engine fetch per entry.
export const VERNACULAR_TERMS = {
  accident: {
    hi: ['सड़क हादसा', 'दुर्घटना', 'हादसा'],
    mr: ['रस्ते अपघात', 'अपघात'],
    gu: ['અકસ્માત', 'માર્ગ અકસ્માત'],
    bn: ['পথ দুর্ঘটনা', 'দুর্ঘটনা'],
    ta: ['சாலை விபத்து', 'விபத்து'],
    te: ['రోడ్డు ప్రమాదం', 'ప్రమాదం'],
    kn: ['ರಸ್ತೆ ಅಪಘಾತ', 'ಅಪಘಾತ'],
    ml: ['വാഹനാപകടം', 'അപകടം'],
    pa: ['ਸੜਕ ਹਾਦਸਾ', 'ਹਾਦਸਾ'],
    or: ['ସଡ଼କ ଦୁର୍ଘଟଣା', 'ଦୁର୍ଘଟଣା'],
    ur: ['ٹریفک حادثہ', 'حادثہ'],
    as: ['পথ দুৰ্ঘটনা', 'দুৰ্ঘটনা']
  },
  crash: {
    hi: ['टक्कर', 'भिड़ंत'], mr: ['धडक'], gu: ['અથડામણ'], bn: ['সংঘর্ষ'],
    ta: ['மோதல்'], te: ['ఢీ'], kn: ['ಡಿಕ್ಕಿ'], ml: ['കൂട്ടിയിടി'],
    pa: ['ਟੱਕਰ'], or: ['ଧକ୍କା'], ur: ['تصادم']
  },
  killed: {
    hi: ['मौत', 'मृत्यु'], mr: ['मृत्यू', 'ठार'], gu: ['મોત', 'મૃત્યુ'],
    bn: ['নিহত', 'মৃত্যু'], ta: ['உயிரிழப்பு', 'பலி'], te: ['మృతి', 'మరణం'],
    kn: ['ಸಾವು', 'ಮೃತ'], ml: ['മരണം', 'മരിച്ചു'], pa: ['ਮੌਤ'],
    or: ['ମୃତ୍ୟୁ'], ur: ['ہلاک'], as: ['মৃত্যু']
  },
  dead: {
    hi: ['मृतक'], mr: ['मृत'], gu: ['મૃતક'], bn: ['মৃত'], ta: ['இறந்த'],
    te: ['మృతుడు'], kn: ['ಮೃತದೇಹ'], ml: ['മൃതദേഹം'], pa: ['ਮ੍ਰਿਤਕ']
  },
  injured: {
    hi: ['घायल'], mr: ['जखमी'], gu: ['ઘાયલ', 'ઈજા'], bn: ['আহত'],
    ta: ['காயம்'], te: ['గాయాలు'], kn: ['ಗಾಯ'], ml: ['പരിക്ക്'],
    pa: ['ਜ਼ਖ਼ਮੀ'], or: ['ଆହତ'], ur: ['زخمی'], as: ['আহত']
  },
  overturned: {
    hi: ['पलटी', 'पलट', 'पलटा', 'पलटकर'], mr: ['उलटला', 'उलटली'], gu: ['પલટી'], bn: ['উল্টে'],
    ta: ['கவிழ்ந்து'], te: ['బోల్తా'], kn: ['ಪಲ್ಟಿ'], ml: ['മറിഞ്ഞു'],
    pa: ['ਪਲਟ'], or: ['ଓଲଟି']
  },
  truck: {
    hi: ['ट्रक'], mr: ['ट्रक'], gu: ['ટ્રક'], bn: ['ট্রাক'], ta: ['லாரி'],
    te: ['లారీ'], kn: ['ಲಾರಿ'], ml: ['ലോറി'], pa: ['ਟਰੱਕ'], or: ['ଟ୍ରକ'], ur: ['ٹرک']
  },
  bus: {
    hi: ['बस'], mr: ['बस'], gu: ['બસ'], bn: ['বাস'], ta: ['பேருந்து'],
    te: ['బస్సు'], kn: ['ಬಸ್'], ml: ['ബസ്'], pa: ['ਬੱਸ'], or: ['ବସ୍'], ur: ['بس']
  },
  car: {
    hi: ['कार'], mr: ['कार'], gu: ['કાર'], bn: ['গাড়ি'], ta: ['கார்'],
    te: ['కారు'], kn: ['ಕಾರು'], ml: ['കാർ'], pa: ['ਕਾਰ'], or: ['କାର'], ur: ['کار']
  },
  bike: {
    hi: ['बाइक', 'मोटरसाइकिल'], mr: ['दुचाकी'], gu: ['બાઇક'], bn: ['মোটরসাইকেল'],
    ta: ['இருசக்கர'], te: ['ద్విచక్ర'], kn: ['ಬೈಕ್'], ml: ['ബൈക്ക്'], pa: ['ਮੋਟਰਸਾਈਕਲ']
  },
  tractor: { hi: ['ट्रैक्टर'], mr: ['ट्रॅक्टर'], gu: ['ટ્રેક્ટર'], bn: ['ট্রাক্টর'], pa: ['ਟਰੈਕਟਰ'] },
  trailer: { hi: ['ट्रेलर'], mr: ['ट्रेलर'], gu: ['ટ્રેલર'] },
  dumper: { hi: ['डंपर'], mr: ['डंपर'], gu: ['ડમ્પર'] },
  tanker: { hi: ['टैंकर'], mr: ['टँकर'], gu: ['ટેન્કર'] },
  highway: {
    hi: ['हाईवे', 'राजमार्ग'], mr: ['महामार्ग'], gu: ['હાઈવે'], bn: ['মহাসড়ক'],
    ta: ['நெடுஞ்சாலை'], te: ['రహదారి'], kn: ['ಹೆದ್ದಾರಿ'], ml: ['ദേശീയപാത'],
    pa: ['ਹਾਈਵੇ'], or: ['ରାଜପଥ']
  },
  police: {
    hi: ['पुलिस'], mr: ['पोलीस'], gu: ['પોલીસ'], bn: ['পুলিশ'], ta: ['காவல்துறை'],
    te: ['పోలీసు'], kn: ['ಪೊಲೀಸ್'], ml: ['പോലീസ്'], pa: ['ਪੁਲਿਸ'], or: ['ପୋଲିସ'], ur: ['پولیس']
  },
  fir: { hi: ['एफआईआर', 'मुकदमा'], mr: ['गुन्हा'], gu: ['એફઆઈઆર'], bn: ['এফআইআর'], pa: ['ਐਫਆਈਆਰ'] },
  hospital: {
    hi: ['अस्पताल'], mr: ['रुग्णालय'], gu: ['હોસ્પિટલ'], bn: ['হাসপাতাল'],
    ta: ['மருத்துவமனை'], te: ['ఆసుపత్రి'], kn: ['ಆಸ್ಪತ್ರೆ'], ml: ['ആശുപത്രി'],
    pa: ['ਹਸਪਤਾਲ'], or: ['ଡାକ୍ତରଖାନା'], ur: ['ہسپتال']
  },
  driver: {
    hi: ['चालक', 'ड्राइवर'], mr: ['चालक'], gu: ['ડ્રાઈવર'], bn: ['চালক'],
    ta: ['ஓட்டுநர்'], te: ['డ్రైవర్'], kn: ['ಚಾಲಕ'], ml: ['ഡ്രൈവർ'],
    pa: ['ਡਰਾਈਵਰ'], or: ['ଚାଳକ'], ur: ['ڈرائیور']
  },
  fire: { hi: ['आग'], mr: ['आग'], gu: ['આગ'], bn: ['আগুন'], ta: ['தீ'], te: ['మంటలు'], pa: ['ਅੱਗ'] },
  theft: { hi: ['चोरी'], mr: ['चोरी'], gu: ['ચોરી'], bn: ['চুরি'], pa: ['ਚੋਰੀ'] }
};

// Backwards compatibility: the original Hindi-only shape, still consumed by the
// manual research-trail builder.
export const HINDI_TERMS = Object.fromEntries(
  Object.entries(VERNACULAR_TERMS)
    .filter(([, byLang]) => byLang.hi)
    .map(([canon, byLang]) => [canon, byLang.hi])
);

export const SUPPORTED_LANGS = ['hi', 'mr', 'gu', 'bn', 'ta', 'te', 'kn', 'ml', 'pa', 'or', 'ur', 'as'];

// Inverse index: native word -> canonical English term. This is what rescues a
// pasted Hindi FIR narrative, which otherwise yields no anchors at all because
// every vocabulary list in the search core is Latin-only.
export const NATIVE_TO_CANON = (() => {
  const map = new Map();
  Object.entries(VERNACULAR_TERMS).forEach(([canon, byLang]) => {
    Object.values(byLang).forEach((words) => {
      words.forEach((w) => {
        const key = String(w).trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, canon);
      });
    });
  });
  return map;
})();

// Which language a native term belongs to. Several scripts are shared — Hindi
// and Marathi are both Devanagari — so the script alone cannot tell us which
// edition of Google News to query. The vocabulary can: "अपघात" is Marathi,
// "हादसा" is Hindi, and a query built from the wrong one reaches the wrong
// regional press entirely.
export const NATIVE_TO_LANG = (() => {
  const map = new Map();
  Object.values(VERNACULAR_TERMS).forEach((byLang) => {
    Object.entries(byLang).forEach(([lang, words]) => {
      words.forEach((w) => {
        const key = String(w).trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, lang);
      });
    });
  });
  return map;
})();

// Number words in the native scripts, so a casualty count is parsed and a bare
// numeral is never mistaken for a place name.
export const NATIVE_NUMBERS = {
  'एक': 1, 'दो': 2, 'दोन': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5,
  'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12,
  'એક': 1, 'બે': 2, 'ત્રણ': 3, 'ચાર': 4,
  'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4,
  'ஒரு': 1, 'இரண்டு': 2, 'மூன்று': 3,
  'ఒక': 1, 'ఇద్దరు': 2, 'ముగ్గురు': 3,
  'ಒಂದು': 1, 'ಎರಡು': 2, 'ಮೂರು': 3,
  'ഒന്ന്': 1, 'രണ്ട്': 2, 'മൂന്ന്': 3,
  'ਇੱਕ': 1, 'ਦੋ': 2, 'ਤਿੰਨ': 3
};

// Which canonical terms describe a vehicle rather than an event. Used to route
// a recognised native word into the right anchor bucket.
export const VEHICLE_CANON = new Set(['truck', 'bus', 'car', 'bike', 'tractor', 'trailer', 'dumper', 'tanker']);

// How Indians actually type on a Latin keyboard. "Chomu ke paas dumper palta
// teen ghayal" is an entirely ordinary query, and without this table not one of
// palta / ghayal / teen registers as anything.
export const ROMANISED_TERMS = {
  // incident
  hadsa: 'accident', haadsa: 'accident', hadasa: 'accident',
  durghatna: 'accident', durghatana: 'accident', apghat: 'accident',
  apghaat: 'accident', akasmat: 'accident', apaghat: 'accident',
  vipathu: 'accident', vibathu: 'accident', pramadam: 'accident',
  apakadam: 'accident', sangharsh: 'crash',
  takkar: 'crash', takar: 'crash', bhidant: 'crash', dhadak: 'crash',
  palta: 'overturned', palti: 'overturned', paltee: 'overturned',
  palat: 'overturned', ulatla: 'overturned', bolta: 'overturned',
  ghayal: 'injured', ghaayal: 'injured', jakhmi: 'injured',
  zakhmi: 'injured', ahat: 'injured',
  maut: 'killed', maut_hui: 'killed', mrityu: 'killed', mritak: 'dead',
  nihat: 'killed', halak: 'killed', mrutyu: 'killed',
  // vehicles
  gaadi: 'car', gadi: 'car', gaddi: 'car', lari: 'truck', lorry: 'truck',
  dumpar: 'dumper', tempo: 'truck', duchaki: 'bike',
  // context
  sadak: 'highway', sadk: 'highway', haiwe: 'highway', mahamarg: 'highway',
  pulis: 'police', chalak: 'driver', aspatal: 'hospital',
  thana: 'police', mukadma: 'fir', mukadama: 'fir'
};

// Romanised number words, for casualty counts typed in Latin script.
export const ROMANISED_NUMBERS = {
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
  chhah: 6, chhe: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10,
  don: 2, tran: 3, teenu: 3
};

// RTO state code -> languages actually used by the press there, most likely
// first. English is appended by the caller and always runs.
export const LANGUAGES_FOR_STATE = {
  AP: ['te'], AR: ['hi', 'as'], AS: ['as', 'bn'], BR: ['hi'], CG: ['hi'],
  CH: ['pa', 'hi'], DD: ['gu'], DL: ['hi', 'ur'], DN: ['gu'], GA: ['kok', 'mr'],
  GJ: ['gu'], HP: ['hi'], HR: ['hi'], JH: ['hi'], JK: ['ur', 'hi'],
  KA: ['kn'], KL: ['ml'], LA: ['ur'], LD: ['ml'], MH: ['mr', 'hi'],
  ML: ['bn', 'as'], MN: ['bn'], MP: ['hi'], MZ: ['bn'], NL: ['as'],
  OD: ['or'], OR: ['or'], PB: ['pa'], PY: ['ta'], RJ: ['hi'], SK: ['bn', 'hi'],
  TN: ['ta'], TR: ['bn'], TS: ['te', 'ur'], UK: ['hi'], UA: ['hi'],
  UP: ['hi', 'ur'], WB: ['bn'], BH: ['hi']
};

// Google News edition codes. Verified against the IN: editions Google actually
// publishes; anything that stops resolving is reported as unavailable rather
// than silently treated as an empty result.
export const NEWS_EDITIONS = {
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

// State and union-territory names to the languages their press publishes in.
//
// LANGUAGES_FOR_STATE keys off the RTO code, which is only available when the
// case carries a registration number. Plenty do not: a spreadsheet of six real
// claims arrived with a location and a date and nothing else, and one of them
// was in Dakshina Kannada — a Kannada-speaking district whose edition sat
// eighth in the sweep because nothing had told the planner where the accident
// was. The written location is the other, often the only, signal.
export const STATE_LANGUAGES = {
  'andhra pradesh': ['te'], 'arunachal pradesh': ['hi', 'as'], assam: ['as', 'bn'],
  bihar: ['hi'], chhattisgarh: ['hi'], chandigarh: ['pa', 'hi'], delhi: ['hi', 'ur'],
  goa: ['mr'], gujarat: ['gu'], haryana: ['hi'], 'himachal pradesh': ['hi'],
  jharkhand: ['hi'], 'jammu and kashmir': ['ur', 'hi'], 'jammu kashmir': ['ur', 'hi'],
  karnataka: ['kn'], kerala: ['ml'], ladakh: ['ur'], lakshadweep: ['ml'],
  maharashtra: ['mr', 'hi'], meghalaya: ['bn', 'as'], manipur: ['bn'],
  'madhya pradesh': ['hi'], mizoram: ['bn'], nagaland: ['as'], odisha: ['or'],
  orissa: ['or'], punjab: ['pa'], puducherry: ['ta'], pondicherry: ['ta'],
  rajasthan: ['hi'], sikkim: ['bn', 'hi'], 'tamil nadu': ['ta'], tamilnadu: ['ta'],
  tripura: ['bn'], telangana: ['te', 'ur'], uttarakhand: ['hi'],
  'uttar pradesh': ['hi', 'ur'], 'west bengal': ['bn'], bengal: ['bn'],
  // District and city names distinctive enough to imply a language on their own.
  'dakshina kannada': ['kn'], mangalore: ['kn'], mangaluru: ['kn'], bengaluru: ['kn'],
  bangalore: ['kn'], mysuru: ['kn'], mysore: ['kn'], hubli: ['kn'], belgaum: ['kn'],
  puttur: ['kn'], udupi: ['kn'],
  mumbai: ['mr'], pune: ['mr'], nashik: ['mr'], nagpur: ['mr'], akola: ['mr'],
  amravati: ['mr'], dhule: ['mr'], aurangabad: ['mr'], solapur: ['mr'], thane: ['mr'],
  chennai: ['ta'], madurai: ['ta'], coimbatore: ['ta'], trichy: ['ta'],
  hyderabad: ['te', 'ur'], vijayawada: ['te'], visakhapatnam: ['te'], guntur: ['te'],
  kochi: ['ml'], thiruvananthapuram: ['ml'], kozhikode: ['ml'], thrissur: ['ml'],
  kolkata: ['bn'], howrah: ['bn'], siliguri: ['bn'],
  ahmedabad: ['gu'], surat: ['gu'], vadodara: ['gu'], rajkot: ['gu'],
  ludhiana: ['pa'], amritsar: ['pa'], jalandhar: ['pa'], patiala: ['pa'],
  bhubaneswar: ['or'], cuttack: ['or']
};

/**
 * Languages implied by the written location of the accident.
 *
 * @param {string[]} places Place anchors, most specific first.
 * @returns {string[]} language codes, most likely first.
 */
export function languagesForPlaces(places = []) {
  const out = [];
  (places || []).forEach((place) => {
    const norm = String(place || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm) return;
    Object.entries(STATE_LANGUAGES).forEach(([key, langs]) => {
      const hit = norm === key || norm.includes(` ${key} `) || norm.startsWith(`${key} `) || norm.endsWith(` ${key}`);
      if (hit) langs.forEach((l) => { if (!out.includes(l)) out.push(l); });
    });
  });
  return out;
}

/**
 * Order the language sweep for a case. Region-matched languages come first so
 * that if a later shard is slow or throttled, the edition most likely to carry
 * the report has already answered.
 *
 * @param {string[]} stateCodes RTO codes seen on the case (e.g. ['RJ']).
 * @returns {string[]} language codes, English first, no duplicates.
 */
export function orderLanguages(stateCodes = []) {
  const out = ['en'];
  const push = (l) => { if (l && !out.includes(l) && NEWS_EDITIONS[l]) out.push(l); };

  (stateCodes || []).forEach((code) => {
    (LANGUAGES_FOR_STATE[String(code || '').toUpperCase()] || []).forEach(push);
  });

  push('hi'); // the widest-reach Indian edition, always worth running
  SUPPORTED_LANGS.forEach(push);
  return out;
}

/** Native-script and romanised terms for a canonical word, across languages. */
export function termsFor(canon, langs = SUPPORTED_LANGS) {
  const byLang = VERNACULAR_TERMS[canon];
  if (!byLang) return [];
  const out = [];
  langs.forEach((l) => (byLang[l] || []).forEach((w) => { if (!out.includes(w)) out.push(w); }));
  return out;
}
