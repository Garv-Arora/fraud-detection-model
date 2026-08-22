import { isMeaningful, calendarParts } from './lib/searchIntel.js';
import { ALL_FIELDS } from './lib/claimFactExtractor.js';

// xlsx is ~430 kB and is only needed when a workbook is actually read.
// Loading it on demand keeps it out of the initial page bundle.
let xlsxPromise = null;
function loadXLSX() {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
}

// 30 Core Headers defined by Universal Sompo Claim Investigation Standards
export const CANONICAL_30_HEADERS = [
  "claim_id", "policy_information", "supporting_information", "insured_name",
  "insured_address", "insured_contact_no", "vehicle_numbers", "vehicle_make",
  "vehicle_model", "driver_name", "driver_contact_no", "accident_date_time",
  "loss_location", "accident_location_city", "accident_location_state",
  "accident_location_region", "vehicle_types", "parties_involved",
  "injury_or_death", "FIR_cause_narrative", "intimation_date", "fir_date",
  "fir_time", "police_station", "police_station_district", "state",
  "district_state", "no_of_occupants", "news_check", "social_media_check",
  "past_record_vehicle", "call_112_check", "call_108_check", "hospital_name",
  "crime_check", "io_name"
];

const HEADER_SYNONYMS = {
  "claim_id": ["claim id", "claim no", "claim number", "claim_no", "claim_id", "claim #"],
  "policy_information": ["policy no", "policy number", "policy information", "policy_information", "policy_no", "policy"],
  "supporting_information": ["supporting information", "supporting info", "remarks", "investigation notes", "pre_existing_loss_check"],
  "insured_name": ["insured name", "customer name", "policyholder name", "insured", "claimant"],
  "insured_address": ["insured address", "customer address", "address", "residence address"],
  "insured_contact_no": ["insured contact", "contact number", "mobile number", "phone", "insured_phone"],
  "vehicle_numbers": ["vehicle registration", "vehicle number", "registration no", "reg no", "vehicle_numbers", "vehicle_no"],
  "vehicle_make": ["vehicle make", "make", "manufacturer", "brand"],
  "vehicle_model": ["vehicle model", "model", "variant"],
  "driver_name": ["driver name", "driver", "name of driver", "operator name"],
  // A driving licence number is not a telephone number and no longer shares
  // this column: a registry that carries both must land them in both fields.
  "driver_contact_no": ["driver contact", "driver contact no", "driver mobile", "driver phone"],
  "driver_licence_no": ["driver dl no", "dl number", "dl no", "driving license", "driving licence", "driver dl", "licence no", "license no"],
  "accident_date_time": ["date of accident", "accident date", "loss date", "date & time of accident", "accident_date_time", "date and time of accident"],
  // "accident location" is the single most common way a client spreadsheet
  // labels this column, and its absence here sent the whole value to
  // additional_details — leaving cases with no registration number with no
  // searchable anchor at all.
  "loss_location": ["loss location", "accident location", "spot of accident", "accident spot", "location of accident", "place of accident", "accident place", "place of loss", "loss place", "accident site", "site of accident"],
  "accident_location_city": ["city", "accident city", "accident location city", "town"],
  "accident_location_state": ["state", "accident state", "accident location state"],
  "accident_location_region": ["region", "zone", "accident location region"],
  "vehicle_types": ["vehicle type", "type of vehicle", "vehicle class", "vehicle_types"],
  "parties_involved": ["parties involved", "third party names", "passengers", "injured parties", "occupants"],
  "injury_or_death": ["injury / death", "injuries", "casualties", "fatalities", "injury_or_death", "death count"],
  "FIR_cause_narrative": ["fir narrative", "cause narrative", "brief facts", "accident details", "how accident occurred", "fir_cause_narrative", "cause of accident"],
  "intimation_date": ["intimation date", "claim intimation date", "date of intimation"],
  "fir_date": ["fir date", "date of fir", "police complaint date"],
  "fir_time": ["fir time", "time of fir"],
  "police_station": ["police station", "ps name", "jurisdiction police station", "thana"],
  "police_station_district": ["police station district", "district ps"],
  "state": ["state", "police station state"],
  "district_state": ["district / state", "district, state", "district state", "district"],
  "no_of_occupants": ["no. of occupants", "occupant count", "passengers count", "no_of_occupants"],
  "news_check": ["news check", "newspaper check", "epaper verification", "media report"],
  "social_media_check": ["social media check", "facebook / instagram verification", "social media findings"],
  "past_record_vehicle": ["past record of vehicle", "prior claims", "vehicle claim history"],
  "call_112_check": ["112 call check", "emergency 112 log", "call 112 verification"],
  "call_108_check": ["108 call check", "ambulance 108 log", "call 108 verification"],
  "hospital_name": ["hospital name", "treatment hospital", "medical facility"],
  "crime_check": ["crime check", "police gd entry", "ipc sections"],
  "io_name": ["investigating officer", "io name", "sub-inspector name"]
};

/**
 * Read one spreadsheet cell as a claim fact.
 *
 * Registries carry placeholders as often as they carry values — "NEW---" for a
 * vehicle awaiting registration, "NA", "-", "Pending". Storing those at full
 * confidence presents a placeholder to the reviewer as an established fact and
 * sends the evidence search hunting for a number plate spelt "NEW---". They are
 * reported as an absence with a note instead, which is how the PDF path already
 * treats them.
 */
function readCell(value) {
  if (value === undefined || value === null) return { text: '', placeholder: false };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { text: '', placeholder: false };
    // See calendarParts: a date cell is a calendar date, and xlsx delivers it
    // just short of local midnight. Formatting through toISOString() shifted
    // every Indian claim back a day.
    const [y, m, d] = calendarParts(value);
    return { text: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, placeholder: false };
  }
  const text = String(value).trim();
  if (!text) return { text: '', placeholder: false };
  if (!isMeaningful(text)) return { text: '', placeholder: true, raw: text };
  return { text, placeholder: false };
}

function normalizeText(text) {
  if (!text) return "";
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a spreadsheet header to a canonical field by BEST match, not by
 * first match.
 *
 * First-match-wins is wrong here because the synonym lists overlap: an
 * "Insured Address" column contains the substring "insured", so it used to be
 * captured by `insured_name` (declared earlier) and every claim ended up with
 * a postal address as the claimant's name — which then became the name the
 * evidence search looked for. Scoring by specificity fixes that: an exact
 * synonym beats a prefix, which beats a bare substring, and longer synonyms
 * outrank shorter ones.
 */
function matchHeader(cellText) {
  const norm = normalizeText(cellText);
  if (!norm) return null;

  let best = null;
  let bestScore = 0;

  for (const [canon, syns] of Object.entries(HEADER_SYNONYMS)) {
    for (const syn of syns) {
      const normSyn = normalizeText(syn);
      if (!normSyn) continue;

      let score = 0;
      if (norm === normSyn) score = 1000 + normSyn.length;
      else if (norm.startsWith(`${normSyn} `)) score = 600 + normSyn.length;
      else if (norm.endsWith(` ${normSyn}`)) score = 500 + normSyn.length;
      else if (norm.includes(` ${normSyn} `)) score = 400 + normSyn.length;
      // A bare substring is the weakest signal, and is only trustworthy for a
      // synonym long enough not to collide across fields.
      else if (normSyn.length >= 5 && norm.includes(normSyn)) score = 100 + normSyn.length;

      if (score > bestScore) {
        bestScore = score;
        best = canon;
      }
    }
  }

  return best;
}

export async function parseExcelWorkbookInBrowser(arrayBuffer) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const allParsedCases = [];

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rawData || rawData.length === 0) return;

    // Scan for Header Row
    let headerRowIdx = -1;
    let headerMapping = {}; // colIdx -> canonicalKey
    let extraMapping = {};  // colIdx -> original header text, for unknown columns

    for (let r = 0; r < Math.min(15, rawData.length); r++) {
      const row = rawData[r];
      let matches = 0;
      const currentMap = {};
      const currentExtras = {};
      row.forEach((cell, cIdx) => {
        if (cell) {
          const canon = matchHeader(String(cell));
          if (canon) {
            currentMap[cIdx] = canon;
            matches++;
          } else {
            // A column the schema does not know is still data on the registry.
            currentExtras[cIdx] = String(cell).trim();
          }
        }
      });
      if (matches >= 2 && matches > Object.keys(headerMapping).length) {
        headerRowIdx = r;
        headerMapping = currentMap;
        extraMapping = currentExtras;
      }
    }

    // If Horizontal Headers found
    if (headerRowIdx !== -1 && Object.keys(headerMapping).length >= 2) {
      for (let r = headerRowIdx + 1; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row || row.every(cell => !cell || String(cell).trim() === "")) continue;

        const caseFacts = {};
        const confidences = {};
        const notes = [];

        // An unpopulated field carries no confidence. It used to default to
        // 0.5, which drew a half-certain badge next to an empty cell.
        ALL_FIELDS.forEach(h => {
          caseFacts[h] = "";
          confidences[h] = 0;
        });

        Object.entries(headerMapping).forEach(([cIdx, canon]) => {
          const cell = readCell(row[cIdx]);
          if (cell.text) {
            caseFacts[canon] = cell.text;
            confidences[canon] = 1.0;
          } else if (cell.placeholder && canon === 'vehicle_numbers') {
            notes.push(`Registry records the vehicle number as "${cell.raw}" — there is no number plate to search.`);
          }
        });

        // Unknown columns are kept verbatim rather than dropped, so a registry
        // with extra columns loses nothing on import.
        caseFacts.additional_details = Object.entries(extraMapping)
          .map(([cIdx, label]) => ({ label, value: readCell(row[cIdx]).text }))
          .filter((d) => d.value);

        if (!caseFacts.claim_id) {
          caseFacts.claim_id = `EXCEL-${sheetName.replace(/\s+/g, '_')}-${r}`;
          confidences.claim_id = 0.2;
        }

        allParsedCases.push({
          facts: caseFacts,
          confidence: confidences,
          notes,
          sheetName: sheetName
        });
      }
    } else {
      // Check for Transposed Key-Value format (Column A = Key, Column B = Value)
      const caseFacts = {};
      const confidences = {};
      const notes = [];
      ALL_FIELDS.forEach(h => {
        caseFacts[h] = "";
        confidences[h] = 0;
      });

      let foundTransposed = 0;
      rawData.forEach(row => {
        if (row && row.length >= 2) {
          const k = row[0];
          const cell = readCell(row[1]);
          if (k && cell.text) {
            const canon = matchHeader(String(k));
            if (canon) {
              caseFacts[canon] = cell.text;
              confidences[canon] = 1.0;
              foundTransposed++;
            }
          }
        }
      });

      if (foundTransposed >= 2) {
        if (!caseFacts.claim_id) {
          caseFacts.claim_id = `EXCEL-${sheetName.replace(/\s+/g, '_')}-01`;
        }
        allParsedCases.push({
          facts: caseFacts,
          confidence: confidences,
          notes,
          sheetName: sheetName
        });
      }
    }
  });

  return allParsedCases;
}
