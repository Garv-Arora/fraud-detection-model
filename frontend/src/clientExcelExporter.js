import * as XLSX from 'xlsx';

export function exportCaseToExcelInBrowser(caseObj) {
  if (!caseObj) return;

  const claimId = caseObj.claim_id || 'CLAIM_EXPORT';
  
  // Sheet 1: 30-Fact Claim Investigation Matrix
  const headers30 = [
    { key: "claim_id", label: "1. Claim ID", val: caseObj.claim_id },
    { key: "policy_information", label: "2. Policy Information", val: caseObj.policy_information },
    { key: "supporting_information", label: "3. Supporting Information", val: caseObj.supporting_information },
    { key: "insured_name", label: "4. Insured Name", val: caseObj.insured_name },
    { key: "insured_address", label: "5. Insured Address", val: caseObj.insured_address },
    { key: "insured_contact_no", label: "6. Insured Contact No.", val: caseObj.insured_contact_no },
    { key: "vehicle_numbers", label: "7. Vehicle Numbers", val: Array.isArray(caseObj.vehicle_numbers) ? caseObj.vehicle_numbers.join(', ') : caseObj.vehicle_numbers },
    { key: "vehicle_make", label: "8. Vehicle Make", val: caseObj.vehicle_make },
    { key: "vehicle_model", label: "9. Vehicle Model", val: caseObj.vehicle_model },
    { key: "driver_name", label: "10. Driver Name", val: caseObj.driver_name },
    { key: "driver_contact_no", label: "11. Driver Contact No / DL", val: caseObj.driver_contact_no },
    { key: "loss_location", label: "12. Spot of Accident", val: caseObj.loss_location },
    { key: "accident_location_city", label: "13. Accident Location City", val: caseObj.accident_location_city },
    { key: "accident_location_state", label: "14. Accident Location State", val: caseObj.accident_location_state },
    { key: "accident_location_region", label: "15. Accident Location Region", val: caseObj.accident_location_region },
    { key: "accident_date_time", label: "16. Date & Time of Accident", val: caseObj.accident_date_time },
    { key: "intimation_date", label: "17. Claim Intimation Date", val: caseObj.intimation_date },
    { key: "fir_date", label: "18. FIR Date", val: caseObj.fir_date },
    { key: "fir_time", label: "19. FIR Time", val: caseObj.fir_time },
    { key: "police_station", label: "20. Jurisdiction Police Station", val: caseObj.police_station },
    { key: "police_station_district", label: "21. Police Station District", val: caseObj.police_station_district },
    { key: "state", label: "22. Police Station State", val: caseObj.state },
    { key: "district_state", label: "23. District / State", val: caseObj.district_state },
    { key: "vehicle_types", label: "24. Vehicle Type(s)", val: Array.isArray(caseObj.vehicle_types) ? caseObj.vehicle_types.join(', ') : caseObj.vehicle_types },
    { key: "parties_involved", label: "25. Parties / Occupants Involved", val: Array.isArray(caseObj.parties_involved) ? caseObj.parties_involved.join(', ') : caseObj.parties_involved },
    { key: "no_of_occupants", label: "26. No. of Occupants", val: caseObj.no_of_occupants },
    { key: "injury_or_death", label: "27. Injuries / Fatalities", val: caseObj.injury_or_death },
    { key: "FIR_cause_narrative", label: "28. FIR Accident Narrative", val: caseObj.FIR_cause_narrative },
    { key: "news_check", label: "29. Regional Media / News Verification", val: caseObj.news_check },
    { key: "social_media_check", label: "30. Social Media Forensics Check", val: caseObj.social_media_check }
  ];

  const wsData = [
    ["UNIVERSAL SOMPO GENERAL INSURANCE - CLAIM INVESTIGATION MATRIX", ""],
    ["Claim ID:", claimId],
    ["Status:", caseObj.status || "Completed"],
    ["Risk Level:", caseObj.risk_level || "LOW RISK"],
    ["", ""],
    ["Parameter #", "Standard Field Name", "Extracted / Confirmed Value"]
  ];

  headers30.forEach((h, idx) => {
    wsData.push([idx + 1, h.label, h.val || "N/A"]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(wsData);

  // Sheet 2: Discovered Evidence Items
  const evHeaders = ["#", "Source Channel", "Evidence Title", "Relevance Score", "Publish Date", "Direct Web / Media URL", "Snippet / Incident Analysis"];
  const evRows = [evHeaders];

  if (caseObj.evidences && caseObj.evidences.length > 0) {
    caseObj.evidences.forEach((ev, idx) => {
      evRows.push([
        idx + 1,
        ev.source || "Web",
        ev.title || "Discovered Incident Record",
        `${((ev.score || 0.8) * 100).toFixed(0)}%`,
        ev.published_date || ev.publish_date || "N/A",
        ev.url || "",
        ev.snippet || ""
      ]);
    });
  } else {
    evRows.push([1, "RCU Verification", "Zero online media records found. Standard private road incident.", "N/A", "N/A", "N/A", "Physical field investigation recommended."]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(evRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "30-Fact Matrix");
  XLSX.utils.book_append_sheet(wb, ws2, "Public Evidence");

  XLSX.writeFile(wb, `UniversalSompo_Claim_${claimId}.xlsx`);
}

export function downloadExcelTemplateInBrowser() {
  const headers = [
    "Claim ID", "Policy Information", "Supporting Information", "Insured Name",
    "Insured Address", "Insured Contact No", "Vehicle Registration No", "Vehicle Make",
    "Vehicle Model", "Driver Name", "Driver Contact / DL", "Date of Accident",
    "Spot of Accident", "Accident City", "Accident State", "Accident Region",
    "Vehicle Types", "Parties Involved", "Injuries / Death", "FIR Cause Narrative",
    "Claim Intimation Date", "FIR Date", "FIR Time", "Police Station",
    "Police Station District", "State", "District State", "No of Occupants",
    "News Check", "Social Media Check"
  ];

  const sampleRow = [
    "TP-RCU-UP-00517/2025", "POL-998877-2025", "Minor prior bumper claim in 2023",
    "Ramesh Kumar", "Kosi Kalan, Mathura, Uttar Pradesh", "9876543210",
    "UP-85-AT-9988, HR-26-Z-1122", "Honda", "CB Shine", "Ramesh Kumar",
    "DL-UP85-2020-001928", "2025-05-12 14:30", "near Kosi Kalan flyover, NH-2",
    "Mathura", "Uttar Pradesh", "North", "Motorcycle, Truck",
    "Ramesh Kumar (Rider), Suresh Singh (Driver)", "Ramesh Kumar suffered fatal injuries",
    "Motorcycle hit from behind by speeding truck on NH-2 near Kosi Kalan flyover.",
    "2025-05-13", "2025-05-12", "17:00", "Kosi Kalan PS",
    "Mathura", "Uttar Pradesh", "Mathura, Uttar Pradesh", "1",
    "Verified e-Paper records", "Social media check completed"
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  XLSX.utils.book_append_sheet(wb, ws, "Claims Ingestion Template");
  XLSX.writeFile(wb, "UniversalSompo_Claims_Upload_Template.xlsx");
}
