import * as XLSX from 'xlsx';

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
  "driver_contact_no": ["driver contact", "driver dl no", "driving license", "dl number", "driver dl"],
  "accident_date_time": ["date of accident", "accident date", "loss date", "date & time of accident", "accident_date_time", "date and time of accident"],
  "loss_location": ["loss location", "spot of accident", "accident spot", "location of accident", "place of accident"],
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

function normalizeText(text) {
  if (!text) return "";
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchHeader(cellText) {
  const norm = normalizeText(cellText);
  if (!norm) return null;
  for (const [canon, syns] of Object.entries(HEADER_SYNONYMS)) {
    for (const syn of syns) {
      const normSyn = normalizeText(syn);
      if (norm === normSyn || norm.startsWith(normSyn) || norm.includes(normSyn)) {
        return canon;
      }
    }
  }
  return null;
}

export function parseExcelWorkbookInBrowser(arrayBuffer) {
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

    for (let r = 0; r < Math.min(15, rawData.length); r++) {
      const row = rawData[r];
      let matches = 0;
      const currentMap = {};
      row.forEach((cell, cIdx) => {
        if (cell) {
          const canon = matchHeader(String(cell));
          if (canon) {
            currentMap[cIdx] = canon;
            matches++;
          }
        }
      });
      if (matches >= 2 && matches > Object.keys(headerMapping).length) {
        headerRowIdx = r;
        headerMapping = currentMap;
      }
    }

    // If Horizontal Headers found
    if (headerRowIdx !== -1 && Object.keys(headerMapping).length >= 2) {
      for (let r = headerRowIdx + 1; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row || row.every(cell => !cell || String(cell).trim() === "")) continue;

        const caseFacts = {};
        const confidences = {};

        CANONICAL_30_HEADERS.forEach(h => {
          caseFacts[h] = "";
          confidences[h] = 0.5;
        });

        Object.entries(headerMapping).forEach(([cIdx, canon]) => {
          const val = row[cIdx];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            caseFacts[canon] = typeof val === 'object' && val instanceof Date ? val.toISOString().split('T')[0] : String(val).trim();
            confidences[canon] = 1.0;
          }
        });

        if (!caseFacts.claim_id) {
          caseFacts.claim_id = `EXCEL-${sheetName.replace(/\s+/g, '_')}-${r}`;
        }

        allParsedCases.push({
          facts: caseFacts,
          confidence: confidences,
          sheetName: sheetName
        });
      }
    } else {
      // Check for Transposed Key-Value format (Column A = Key, Column B = Value)
      const caseFacts = {};
      const confidences = {};
      CANONICAL_30_HEADERS.forEach(h => {
        caseFacts[h] = "";
        confidences[h] = 0.5;
      });

      let foundTransposed = 0;
      rawData.forEach(row => {
        if (row && row.length >= 2) {
          const k = row[0];
          const v = row[1];
          if (k && v !== undefined && v !== null && String(v).trim() !== "") {
            const canon = matchHeader(String(k));
            if (canon) {
              caseFacts[canon] = typeof v === 'object' && v instanceof Date ? v.toISOString().split('T')[0] : String(v).trim();
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
          sheetName: sheetName
        });
      }
    }
  });

  return allParsedCases;
}
