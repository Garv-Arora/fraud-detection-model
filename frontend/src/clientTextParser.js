// Client-Side Text and FIR Extractor for Universal Sompo 30-Header Ingestion

export function parseTextDocumentInBrowser(text, defaultClaimId = "") {
  if (!text || !text.trim()) return null;

  const facts = {
    claim_id: defaultClaimId || "",
    policy_information: "",
    supporting_information: "",
    insured_name: "",
    insured_address: "",
    insured_contact_no: "",
    vehicle_numbers: "",
    vehicle_make: "",
    vehicle_model: "",
    driver_name: "",
    driver_contact_no: "",
    accident_date_time: "",
    loss_location: "",
    accident_location_city: "",
    accident_location_state: "",
    accident_location_region: "North",
    vehicle_types: "Motorcycle, Truck",
    parties_involved: "",
    injury_or_death: "",
    FIR_cause_narrative: text.trim(),
    intimation_date: "",
    fir_date: "",
    fir_time: "",
    police_station: "",
    police_station_district: "",
    state: "",
    district_state: "",
    no_of_occupants: "1",
    news_check: "Pending verification",
    social_media_check: "Pending verification",
    past_record_vehicle: "No prior claims",
    call_112_check: "Pending log check",
    call_108_check: "Pending ambulance dispatch check",
    hospital_name: "District Hospital",
    crime_check: "Pending GD entry check",
    io_name: "Investigating Officer"
  };

  const confidences = {};
  Object.keys(facts).forEach(k => confidences[k] = 0.6);

  const lines = text.split('\n');
  lines.forEach(line => {
    const l = line.trim();
    if (!l) return;

    if (/claim\s*(?:id|no|number|#)?\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/claim\s*(?:id|no|number|#)?\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.claim_id = match[1].trim(); confidences.claim_id = 0.95; }
    } else if (/policy\s*(?:no|number|info|information)?\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/policy\s*(?:no|number|info|information)?\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.policy_information = match[1].trim(); confidences.policy_information = 0.95; }
    } else if (/insured\s*(?:name)?\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/insured\s*(?:name)?\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.insured_name = match[1].trim(); confidences.insured_name = 0.95; }
    } else if (/driver\s*(?:name)?\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/driver\s*(?:name)?\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.driver_name = match[1].trim(); confidences.driver_name = 0.95; }
    } else if (/(?:vehicle|registration|reg)\s*(?:no|number|numbers)?\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/(?:vehicle|registration|reg)\s*(?:no|number|numbers)?\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.vehicle_numbers = match[1].trim(); confidences.vehicle_numbers = 0.95; }
    } else if (/(?:date|loss date|accident date)\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/(?:date|loss date|accident date)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.accident_date_time = match[1].trim(); confidences.accident_date_time = 0.9; }
    } else if (/(?:location|spot|place of accident)\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/(?:location|spot|place of accident)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.loss_location = match[1].trim(); confidences.loss_location = 0.9; }
    } else if (/(?:police station|ps|thana)\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/(?:police station|ps|thana)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.police_station = match[1].trim(); confidences.police_station = 0.9; }
    } else if (/(?:district|district\/state)\s*[:=-]\s*(.+)/i.test(l)) {
      const match = l.match(/(?:district|district\/state)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) { facts.district_state = match[1].trim(); confidences.district_state = 0.9; }
    }
  });

  // Regex scan for Indian Vehicle Registration numbers (e.g. UP-85-AT-9988, DL-01-AB-1234, HR26Z1122)
  if (!facts.vehicle_numbers) {
    const regMatches = text.match(/[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4}/gi);
    if (regMatches && regMatches.length > 0) {
      facts.vehicle_numbers = Array.from(new Set(regMatches.map(v => v.toUpperCase().trim()))).join(', ');
      confidences.vehicle_numbers = 0.9;
    }
  }

  // Generate fallback claim ID if missing
  if (!facts.claim_id) {
    facts.claim_id = `USGI-CLAIM-${Date.now().toString().slice(-6)}`;
    confidences.claim_id = 0.85;
  }

  return { facts, confidence: confidences };
}
