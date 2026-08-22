// ============================================================================
// claimFactExtractor.js — full-coverage field extraction from claim documents
// ----------------------------------------------------------------------------
// Handles the shapes that real Universal Sompo documents arrive in:
//   "Claim No : CL26140317"                (colon-delimited)
//   "Insurer Claim No  |  CL26140317  |  Child Claim No  |  CL26140317/00001"
//                                          (grid, from the PDF layout engine)
//   "Claim No"  / next line "CL26140317"   (label above value)
//   free-running FIR narrative with no labels at all
//
// Resolution runs in three tiers, strongest first:
//
//   1. FIELD_BY_LABEL — an exact dictionary of every label that appears on a
//      USGI intimation sheet or certificate cum policy schedule. Exact lookup
//      is what makes the result deterministic: scoring alone routed "Insured
//      State & Code" to the claimant's NAME, because the label begins with
//      "insured".
//   2. scored synonyms — for documents the dictionary was not built against
//      (FIR copies, other insurers' formats, pasted text).
//   3. additional_details — anything still unrecognised is kept verbatim with
//      its original label rather than discarded, so no value on the page is
//      silently lost and the coverage figure in `quality` is auditable.
//
// A value is only stored when it has the right SHAPE for the field
// (VALUE_RULES). A registration number that parses as a date, or a contact
// number with no ten-digit run in it, is rejected rather than stored.
//
// Every field carries a confidence so the human-in-the-loop review screen can
// highlight what needs checking, instead of presenting guesses as facts.
// ============================================================================

import { normalisePlate, parseFlexibleDate, toISO, isMeaningful, cleanPersonName } from './searchIntel.js';

// The 30-header client contract. This list is the export schema and must not
// be reordered or renamed without the client's sign-off.
export const CANONICAL_FIELDS = [
  'claim_id', 'policy_information', 'supporting_information', 'insured_name',
  'insured_address', 'insured_contact_no', 'vehicle_numbers', 'vehicle_make',
  'vehicle_model', 'driver_name', 'driver_contact_no', 'accident_date_time',
  'loss_location', 'spot_of_accident', 'accident_location_city',
  'accident_location_state', 'accident_location_region', 'vehicle_types',
  'parties_involved', 'injury_or_death', 'FIR_cause_narrative',
  'intimation_date', 'fir_date', 'fir_time', 'police_station',
  'police_station_district', 'state', 'district_state', 'no_of_occupants',
  'news_check', 'social_media_check', 'past_record_vehicle', 'call_112_check',
  'call_108_check', 'hospital_name', 'crime_check', 'io_name'
];

// Everything else the source documents carry. These are captured in full and
// shown alongside the 30 headers; they are not part of the export contract.
//
// driver_licence_no is deliberately its own field. A driving licence number is
// not a telephone number, and storing "RJ08 20190004935" in driver_contact_no
// put an un-callable string in a field investigators dial.
export const EXTENDED_FIELDS = [
  // -- claim / policy administration
  'child_claim_no', 'claim_type', 'claim_manager', 'request_id',
  'intimation_time', 'loss_zone', 'policy_start_date', 'policy_end_date',
  'product_type', 'product_code', 'internal_policy_no', 'internal_policy_flag',
  'proximity_days', 'survey_place', 'intimated_by', 'towing_date',
  // -- people
  'insured_email', 'insured_alternate_contact_no', 'driver_licence_no',
  'nominee_name', 'nominee_age', 'nominee_relation',
  // -- vehicle
  'engine_number', 'chassis_number', 'vehicle_registration_date',
  'manufacturing_year', 'engine_cc', 'seating_capacity', 'fuel_type',
  'vehicle_body_type', 'vehicle_colour', 'rto_location', 'fastag_id',
  'vehicle_identification_no',
  // -- garage / repair
  'garage_id', 'garage_name', 'garage_contact_no', 'garage_manager_name',
  // -- money
  'estimated_loss_amount', 'total_idv', 'vehicle_idv', 'accessories_idv',
  'ncb_amount', 'ncb_percentage', 'premium_amount',
  // -- distribution
  'intermediary_branch', 'intermediary_code', 'intermediary_category', 'channel',
  // -- policy schedule only
  'policy_type_uin', 'proposal_no_date', 'period_of_insurance',
  'policy_issued_on', 'geographical_area', 'invoice_no', 'gst_no_state',
  'accounting_code', 'insured_state_code', 'place_of_supply',
  'gstin_of_customer', 'policy_zone', 'engine_chassis_no',
  'financier_type', 'financier_name', 'financier_branch',
  'payment_mode', 'payment_transaction_no', 'payment_bank',
  // -- assignment e-mail provenance
  'case_assigned_date', 'investigation_agency', 'intimation_email_from',
  'intimation_email_cc', 'intimation_email_subject', 'attachments_listed'
];

export const ALL_FIELDS = [...CANONICAL_FIELDS, ...EXTENDED_FIELDS];

// The 30 numbered headers of the client's export, in export order. The numbers
// shown against these fields in the review matrix are these positions, so the
// screen and the spreadsheet always agree on what "header 11" means.
export const CONTRACT_FIELDS = [
  'claim_id', 'policy_information', 'supporting_information', 'insured_name',
  'insured_address', 'insured_contact_no', 'vehicle_numbers', 'vehicle_make',
  'vehicle_model', 'driver_name', 'driver_contact_no', 'loss_location',
  'accident_location_city', 'accident_location_state', 'accident_location_region',
  'accident_date_time', 'intimation_date', 'fir_date', 'fir_time',
  'police_station', 'police_station_district', 'state', 'district_state',
  'vehicle_types', 'parties_involved', 'no_of_occupants', 'injury_or_death',
  'FIR_cause_narrative', 'news_check', 'social_media_check'
];

export const CONTRACT_POSITION = new Map(CONTRACT_FIELDS.map((f, i) => [f, i + 1]));

/**
 * Every field grouped for display, in reading order.
 *
 * The review screen is driven by this rather than by a hand-written list of
 * thirty, so a field added to the schema appears on screen and in the export
 * without a second edit. COVERAGE below fails loudly if a field is ever left
 * out of a group or listed in two.
 */
export const FIELD_GROUPS = [
  { title: 'Claim & Intimation', colour: '#DC2626', fields: [
    'claim_id', 'child_claim_no', 'claim_type', 'intimation_date',
    'intimation_time', 'claim_manager', 'request_id', 'proximity_days',
    'loss_zone', 'supporting_information'
  ] },
  { title: 'Accident & Location', colour: '#D97706', fields: [
    'accident_date_time', 'FIR_cause_narrative', 'spot_of_accident',
    'loss_location', 'accident_location_city', 'accident_location_state',
    'accident_location_region', 'district_state', 'state', 'no_of_occupants',
    'parties_involved', 'injury_or_death'
  ] },
  { title: 'Insured', colour: '#2563EB', fields: [
    'insured_name', 'insured_address', 'insured_contact_no',
    'insured_alternate_contact_no', 'insured_email', 'insured_state_code'
  ] },
  { title: 'Driver', colour: '#0891B2', fields: [
    'driver_name', 'driver_contact_no', 'driver_licence_no'
  ] },
  { title: 'Vehicle', colour: '#059669', fields: [
    'vehicle_numbers', 'vehicle_make', 'vehicle_model', 'vehicle_types',
    'vehicle_body_type', 'vehicle_colour', 'engine_number', 'chassis_number',
    'vehicle_identification_no', 'engine_chassis_no', 'vehicle_registration_date',
    'manufacturing_year', 'engine_cc', 'seating_capacity', 'fuel_type',
    'rto_location', 'fastag_id', 'past_record_vehicle'
  ] },
  { title: 'Police, Legal & Emergency', colour: '#7C3AED', fields: [
    'fir_date', 'fir_time', 'police_station', 'police_station_district',
    'crime_check', 'io_name', 'call_112_check', 'call_108_check', 'hospital_name'
  ] },
  { title: 'Public-Record Checks', colour: '#BE185D', fields: [
    'news_check', 'social_media_check'
  ] },
  { title: 'Policy', colour: '#475569', fields: [
    'policy_information', 'policy_start_date', 'policy_end_date', 'product_type',
    'product_code', 'internal_policy_no', 'internal_policy_flag',
    'policy_type_uin', 'proposal_no_date', 'period_of_insurance',
    'policy_issued_on', 'geographical_area', 'invoice_no', 'gst_no_state',
    'accounting_code', 'place_of_supply', 'gstin_of_customer', 'policy_zone'
  ] },
  { title: 'Valuation & Payment', colour: '#0F766E', fields: [
    'estimated_loss_amount', 'total_idv', 'vehicle_idv', 'accessories_idv',
    'ncb_amount', 'ncb_percentage', 'premium_amount', 'payment_mode',
    'payment_transaction_no', 'payment_bank', 'financier_type', 'financier_name',
    'financier_branch'
  ] },
  { title: 'Garage & Survey', colour: '#B45309', fields: [
    'garage_id', 'garage_name', 'garage_contact_no', 'garage_manager_name',
    'survey_place', 'towing_date'
  ] },
  { title: 'Distribution', colour: '#6D28D9', fields: [
    'intermediary_branch', 'intermediary_code', 'intermediary_category',
    'channel', 'intimated_by'
  ] },
  { title: 'Nominee', colour: '#9D174D', fields: [
    'nominee_name', 'nominee_age', 'nominee_relation'
  ] },
  { title: 'Case Assignment', colour: '#334155', fields: [
    'case_assigned_date', 'investigation_agency', 'intimation_email_from',
    'intimation_email_cc', 'intimation_email_subject', 'attachments_listed'
  ] }
];

// Guard: every field must appear in exactly one group. A field missing here is
// a field the reviewer never sees, which is the failure this whole module
// exists to prevent.
const GROUPED = FIELD_GROUPS.flatMap((g) => g.fields);
export const FIELD_GROUP_COVERAGE = {
  missing: ALL_FIELDS.filter((f) => !GROUPED.includes(f)),
  duplicated: GROUPED.filter((f, i) => GROUPED.indexOf(f) !== i),
  unknown: GROUPED.filter((f) => !ALL_FIELDS.includes(f))
};

// Acronyms that must stay upper-case when a field key is shown to a human.
const FIELD_ACRONYMS = new Set([
  'idv', 'ncb', 'dl', 'gst', 'gstin', 'rto', 'uin', 'cc', 'id', 'iv', 'fir'
]);

// "no" is an abbreviation of "number", not an acronym: "Claim NO" reads as
// shouting, "Claim No." reads as a column heading.
const FIELD_ABBREVIATIONS = { no: 'No.' };

// Kept lower-case inside a heading, capitalised when they lead one.
const FIELD_MINOR_WORDS = new Set(['of', 'and', 'or', 'to', 'in', 'for', 'by']);

/**
 * Turn a field key into a column heading: "driver_licence_no" -> "Driver
 * Licence No", "total_idv" -> "Total IDV". Shared by the review screen, the
 * batch workspace and the Excel export so one field never appears under three
 * different names.
 */
export function humaniseFieldName(key) {
  return String(key)
    .split('_')
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (FIELD_ACRONYMS.has(lower)) return word.toUpperCase();
      if (FIELD_ABBREVIATIONS[lower]) return FIELD_ABBREVIATIONS[lower];
      if (i > 0 && FIELD_MINOR_WORDS.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Labels that carry no claim information at all and must be dropped rather
// than kept as an unrecognised detail.
const IGNORE = '__ignore__';

/**
 * Exact label dictionary.
 *
 * Every entry was taken from a real document rather than guessed: the keys are
 * the complete recurring label vocabulary of the USGI intimation sheet and of
 * the certificate cum policy schedule, harvested from the sample corpus.
 * Anything not in here still gets captured — see additional_details — but
 * anything in here is resolved exactly, with no scoring and no ambiguity.
 */
const LABEL_DICTIONARY = {
  // ---- intimation sheet: claim identity ----------------------------------
  'insurer claim no': 'claim_id',
  'child claim no': 'child_claim_no',
  'claim type': 'claim_type',
  'claim manager': 'claim_manager',
  'request id': 'request_id',
  'claim intimation date': 'intimation_date',
  'claim intimation time': 'intimation_time',
  'loss zone': 'loss_zone',
  'proximity days': 'proximity_days',
  'survey place': 'survey_place',
  'intimated by': 'intimated_by',
  'towing date': 'towing_date',
  'remarks': 'supporting_information',

  // ---- policy ------------------------------------------------------------
  'policy no': 'policy_information',
  'policy start date': 'policy_start_date',
  'policy end date': 'policy_end_date',
  'product type': 'product_type',
  'product code': 'product_code',
  'internal policy no': 'internal_policy_no',
  'internal policy flag': 'internal_policy_flag',

  // ---- insured -----------------------------------------------------------
  'insured name': 'insured_name',
  'insured address': 'insured_address',
  'insured email': 'insured_email',
  'contact number': 'insured_contact_no',
  'mobile number': 'insured_alternate_contact_no',

  // ---- incident ----------------------------------------------------------
  'accident date time': 'accident_date_time',
  'cause of accident': 'FIR_cause_narrative',
  'loss city': 'accident_location_city',
  'loss state': 'accident_location_state',

  // ---- driver ------------------------------------------------------------
  'name of iv driver': 'driver_name',
  'dl number': 'driver_licence_no',

  // ---- vehicle -----------------------------------------------------------
  'registration number': 'vehicle_numbers',
  'registration no': 'vehicle_numbers',
  'engine number': 'engine_number',
  'chassis number': 'chassis_number',
  'vehicle registration date': 'vehicle_registration_date',
  'manufacturing year': 'manufacturing_year',
  'year of manufacture': 'manufacturing_year',
  'make': 'vehicle_make',
  'model': 'vehicle_model',
  'model variant': 'vehicle_model',
  'engine cc': 'engine_cc',
  'cubic capacity': 'engine_cc',
  'seating capacity': 'seating_capacity',
  'vehicle sub class': 'vehicle_types',
  'fuel type': 'fuel_type',
  'type of body': 'vehicle_body_type',
  'color': 'vehicle_colour',
  'colour': 'vehicle_colour',
  'rto location': 'rto_location',
  'fastag id': 'fastag_id',
  'vehicle identification no': 'vehicle_identification_no',
  'engine chassis no': 'engine_chassis_no',

  // ---- garage ------------------------------------------------------------
  'garage id': 'garage_id',
  'garage name': 'garage_name',
  'garage contact number': 'garage_contact_no',
  'garage manager name': 'garage_manager_name',

  // ---- money -------------------------------------------------------------
  'estimated amount': 'estimated_loss_amount',
  'total idv': 'total_idv',
  'vehicle idv': 'vehicle_idv',
  'accessories idv': 'accessories_idv',
  'ncb amount': 'ncb_amount',
  'ncb percentage': 'ncb_percentage',
  'amount': 'premium_amount',

  // ---- distribution ------------------------------------------------------
  'intermediary branch': 'intermediary_branch',
  'intermediary code': 'intermediary_code',
  'intermediary category name': 'intermediary_category',
  'channel': 'channel',

  // ---- certificate cum policy schedule -----------------------------------
  'policy type uin': 'policy_type_uin',
  'proposal no date': 'proposal_no_date',
  'period of insurance': 'period_of_insurance',
  'policy issued on': 'policy_issued_on',
  'geographical area': 'geographical_area',
  'invoice no': 'invoice_no',
  'gst no state': 'gst_no_state',
  'accounting code of service': 'accounting_code',
  'insured state code': 'insured_state_code',
  'place of supply': 'place_of_supply',
  'gstin of customer': 'gstin_of_customer',
  'zone': 'policy_zone',
  'nominee name': 'nominee_name',
  'age': 'nominee_age',
  'relation': 'nominee_relation',
  'financier type': 'financier_type',
  'financier name': 'financier_name',
  'financier branch': 'financier_branch',
  'payment mode': 'payment_mode',
  'cheque no transaction no': 'payment_transaction_no',
  'bank name': 'payment_bank',

  // ---- covering e-mail provenance ----------------------------------------
  'from': 'intimation_email_from',
  'sent': 'case_assigned_date',
  'to': 'investigation_agency',
  'cc': 'intimation_email_cc',
  'subject': 'intimation_email_subject',
  'attachments': 'attachments_listed',
  'caution': IGNORE
};

const FIELD_BY_LABEL = new Map(
  Object.entries(LABEL_DICTIONARY).map(([label, field]) => [normLabel(label), field])
);

// Scored synonyms — tier 2, for documents the dictionary was not built against.
// Longest/most-specific first within each field so that "Driver Contact No"
// never gets swallowed by "Driver Name".
const LABELS = [
  ['claim_id', ['claim no', 'claim number', 'claim id', 'claim ref', 'claim reference', 'intimation no', 'intimation number', 'cl no']],
  ['policy_information', ['policy number', 'policy information', 'policy details', 'certificate no', 'cover note']],
  ['insured_contact_no', ['insured contact no', 'insured contact', 'insured mobile', 'insured phone', 'customer contact', 'contact no of insured']],
  ['insured_address', ['address of insured', 'customer address', 'communication address', 'permanent address', 'residence address']],
  ['insured_name', ['name of insured', 'name of the insured', 'customer name', 'policyholder name', 'policy holder', 'claimant name', 'owner name']],
  ['driver_licence_no', ['driving licence no', 'driving license no', 'licence no', 'license no', 'dl no']],
  ['driver_contact_no', ['driver contact no', 'driver contact', 'driver mobile', 'driver phone']],
  ['driver_name', ['driver name', 'name of driver', 'name of the driver', 'driven by', 'operator name']],
  ['vehicle_numbers', ['vehicle no', 'vehicle number', 'reg no', 'regn no', 'veh no']],
  ['vehicle_make', ['vehicle make', 'manufacturer', 'make of vehicle']],
  ['vehicle_model', ['vehicle model', 'variant', 'model of vehicle']],
  ['vehicle_types', ['vehicle type', 'type of vehicle', 'vehicle class', 'class of vehicle', 'body type']],
  ['accident_date_time', ['date and time of accident', 'date & time of accident', 'date of accident', 'accident date', 'date of loss', 'loss date', 'date of incident', 'incident date', 'dol']],
  ['intimation_date', ['intimation date', 'date of intimation', 'intimated on', 'reported on']],
  ['fir_date', ['fir date', 'date of fir', 'fir registered on', 'complaint date']],
  ['fir_time', ['fir time', 'time of fir']],
  ['spot_of_accident', ['spot of accident', 'accident spot', 'place of accident', 'spot', 'exact spot']],
  ['loss_location', ['loss location', 'location of accident', 'location of loss', 'accident location', 'place of loss', 'loss place']],
  ['accident_location_city', ['accident location city', 'accident city', 'city', 'town']],
  ['accident_location_state', ['accident location state', 'accident state']],
  ['accident_location_region', ['accident location region', 'region']],
  ['police_station_district', ['police station district', 'ps district', 'district of police station']],
  ['police_station', ['police station', 'ps name', 'thana', 'jurisdiction police station', 'concerned police station']],
  ['district_state', ['district / state', 'district and state', 'district state', 'district', 'distt']],
  ['hospital_name', ['hospital name', 'name of hospital', 'hospital', 'treated at', 'medical facility', 'mlc hospital']],
  ['io_name', ['io name', 'investigating officer', 'name of io', 'investigator']],
  ['no_of_occupants', ['no of occupants', 'number of occupants', 'occupants', 'persons travelling', 'passengers']],
  ['injury_or_death', ['injury or death', 'injuries', 'casualties', 'fatalities', 'injured or dead', 'death', 'injury']],
  ['parties_involved', ['parties involved', 'third party', 'tp details', 'other party', 'persons involved', 'injured parties']],
  ['FIR_cause_narrative', ['cause of loss', 'brief facts', 'fir narrative', 'accident details', 'how the accident occurred', 'how accident occurred', 'nature of loss', 'loss description', 'description of loss', 'incident description']],
  ['past_record_vehicle', ['past record of vehicle', 'previous claims', 'prior claims', 'claim history']],
  ['crime_check', ['crime check', 'gd entry', 'ipc sections', 'sections applied']],
  ['call_112_check', ['112 call', 'call on 112', '112 check', 'pcr call']],
  ['call_108_check', ['108 call', 'call on 108', '108 check', 'ambulance call']],
  ['news_check', ['news check', 'newspaper check', 'media check']],
  ['social_media_check', ['social media check', 'social media']],
  ['supporting_information', ['supporting information', 'supporting documents', 'documents submitted', 'additional information']]
];

// "Loss Zone" on a USGI sheet is the servicing branch zone, not geography: all
// four sample claims read "Jaipur" while the accidents were in Gangrar, Mumbai,
// Kota and Mumbai. It is kept as its own field, and the accident region is
// derived from the accident state instead — which is what the client's own
// header template does ("PUNJAB" -> "North").
const STATE_REGIONS = {
  'jammu and kashmir': 'North', 'ladakh': 'North', 'himachal pradesh': 'North',
  'punjab': 'North', 'haryana': 'North', 'chandigarh': 'North', 'delhi': 'North',
  'rajasthan': 'North', 'uttar pradesh': 'North', 'uttarakhand': 'North',
  'maharashtra': 'West', 'gujarat': 'West', 'goa': 'West',
  'dadra and nagar haveli': 'West', 'daman and diu': 'West',
  'madhya pradesh': 'Central', 'chhattisgarh': 'Central',
  'bihar': 'East', 'jharkhand': 'East', 'odisha': 'East', 'orissa': 'East',
  'west bengal': 'East', 'sikkim': 'East',
  'assam': 'North East', 'arunachal pradesh': 'North East', 'manipur': 'North East',
  'meghalaya': 'North East', 'mizoram': 'North East', 'nagaland': 'North East',
  'tripura': 'North East',
  'andhra pradesh': 'South', 'telangana': 'South', 'karnataka': 'South',
  'kerala': 'South', 'tamil nadu': 'South', 'puducherry': 'South',
  'lakshadweep': 'South', 'andaman and nicobar islands': 'South'
};

const VALUE_STOPWORDS = /^(n\/?a|nil|none|null|unknown|not available|not applicable|not in master|-{1,3}|\.{2,}|_{2,})$/i;

// Fields whose value is always a short identifier, name, date or place. If a
// prose fragment lands in one of these, a label pattern has matched mid
// sentence — which is what happens when a policy wording is fed to the parser
// ("police station and obtain a copy. Provide a photocopy of…" is not a police
// station). Left unguarded those fragments become search anchors and every
// query for the case is poisoned.
const SHORT_VALUE_FIELDS = new Set([
  'claim_id', 'policy_information', 'insured_name', 'driver_name',
  'insured_contact_no', 'driver_contact_no', 'driver_licence_no',
  'vehicle_numbers', 'vehicle_make', 'vehicle_model', 'accident_date_time',
  'intimation_date', 'fir_date', 'fir_time', 'police_station',
  'police_station_district', 'state', 'district_state', 'no_of_occupants',
  'hospital_name', 'io_name', 'accident_location_city',
  'accident_location_state', 'accident_location_region'
]);

const PROSE_MARKERS = /\b(and|the|of|for|with|shall|will|must|may|any|please|provide|obtain|copy|following|hereby|whereas|subject|case|if|that|this|from|been|are|were)\b/i;

// ---------------------------------------------------------------------------
// Value shape rules
// ---------------------------------------------------------------------------

function looksLikeDate(v) {
  const s = String(v);
  return /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(s)
    || /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(s)
    || /\b\d{1,2}[-\s]+[A-Za-z]{3,9}[-\s,]+\d{4}\b/.test(s);
}

function looksLikePhone(v) {
  const digits = String(v).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 12 && /[6-9]\d{9}$/.test(digits);
}

// Indian driving licence: two-letter state code, RTO number, then a long
// serial — "RJ08 20190004935", "PB9120210006160", "RJ23A20120005221".
function looksLikeLicence(v) {
  return /^[A-Z]{2}[-\s]?\d{1,2}[A-Z]?[-\s]?\d{4,13}$/i.test(String(v).trim());
}

/**
 * How well a value fits the field it is about to be written to.
 * 0 rejects the assignment outright; anything above scales the confidence.
 */
const VALUE_RULES = {
  claim_id: (v) => (/\d/.test(v) && /^[A-Za-z0-9][A-Za-z0-9/\- ]{4,29}$/.test(v) ? 1 : 0),
  policy_information: (v) => (/\d/.test(v) && v.length <= 40 ? 1 : 0),
  vehicle_numbers: (v) => (normalisePlate(v) ? 1 : 0),
  insured_contact_no: (v) => (looksLikePhone(v) ? 1 : 0),
  insured_alternate_contact_no: (v) => (looksLikePhone(v) ? 1 : 0),
  driver_contact_no: (v) => (looksLikePhone(v) ? 1 : 0),
  driver_licence_no: (v) => (looksLikeLicence(v) ? 1 : 0.6),
  accident_date_time: (v) => (looksLikeDate(v) ? 1 : 0),
  intimation_date: (v) => (looksLikeDate(v) ? 1 : 0),
  fir_date: (v) => (looksLikeDate(v) ? 1 : 0),
  fir_time: (v) => (/^\d{1,2}[:.]\d{2}/.test(String(v).trim()) ? 1 : 0),
  intimation_time: (v) => (/^\d{1,2}[:.]\d{2}/.test(String(v).trim()) ? 1 : 0),
  no_of_occupants: (v) => (/^\d{1,3}$/.test(String(v).trim()) ? 1 : 0),
  seating_capacity: (v) => (/^\d{1,3}$/.test(String(v).trim()) ? 1 : 0),
  manufacturing_year: (v) => (/^(19|20)\d{2}$/.test(String(v).trim()) ? 1 : 0)
};

function valueFit(field, value) {
  const rule = VALUE_RULES[field];
  return rule ? rule(String(value)) : 1;
}

function looksLikeProse(value, field) {
  if (!SHORT_VALUE_FIELDS.has(field)) return false;
  const v = String(value || '').trim();
  const words = v.split(/\s+/);
  if (words.length > 6) return true;
  if (words.length >= 3 && PROSE_MARKERS.test(v)) return true;
  if (/[.;]\s/.test(v)) return true;              // a sentence break mid-value
  if (/^[a-z]/.test(v) && words.length >= 2) return true; // lower-case sentence tail
  return false;
}

function normLabel(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanValue(v) {
  const s = String(v || '')
    .replace(/^[\s:|\-–—]+/, '')
    .replace(/[\s:|\-–—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || VALUE_STOPWORDS.test(s)) return '';
  return s;
}

/**
 * Could this cell be a field label at all?
 *
 * Without this test any long prose cell is offered to the matcher, and the
 * matcher will find something: the accident narrative "…an ahead going T.P.
 * vehicle driver applied sudden brakes…" contains the whole word "driver" and
 * would be accepted as the label for the driver's name.
 */
function isLabelCandidate(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60) return false;
  if (/[.;]\s/.test(t)) return false;
  if ((t.match(/\s/g) || []).length > 7) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return true;
}

/**
 * Resolve a document label to a field.
 *
 * Exact dictionary first, scored synonyms second. Returns null for a label
 * that is recognised as noise, and undefined-ish `null` for one that is simply
 * unknown — the caller distinguishes the two by consulting isIgnored().
 */
function matchField(label) {
  const n = normLabel(label);
  if (!n || n.length < 2) return null;

  const exact = FIELD_BY_LABEL.get(n);
  if (exact) return exact === IGNORE ? null : { field: exact, exact: true };

  let best = null;
  let bestScore = 0;

  for (const [field, synonyms] of LABELS) {
    for (const syn of synonyms) {
      if (!syn) continue;
      let score = 0;
      if (n === syn) score = 1000 + syn.length;
      else if (n.startsWith(`${syn} `)) score = 600 + syn.length;
      else if (n.endsWith(` ${syn}`)) score = 500 + syn.length;
      else if (n.includes(` ${syn} `)) score = 400 + syn.length;
      else if (syn.length >= 5 && n.includes(syn)) score = 100 + syn.length;

      if (score > bestScore) {
        bestScore = score;
        best = { field, exact: score >= 1000 };
      }
    }
  }

  return best;
}

function isIgnored(label) {
  return FIELD_BY_LABEL.get(normLabel(label)) === IGNORE;
}

/**
 * Split one reconstructed row into (label, value) pairs.
 *
 * Walks the row as a sequence of label/value cells rather than pairing by
 * position, because the layout engine preserves empty spacer columns and
 * position-pairing loses parity on the first one.
 *
 * The value is the cell after the label. When that cell is empty the scan
 * continues over further empty cells, but stops if it reaches another LABEL —
 * so "From: |  |  | UNIVERSAL SOMPO GIC" finds its value across two spacers,
 * while "Name of IV Driver |  | DL Number | RJ08…" correctly yields an empty
 * driver name instead of a driver called "DL Number".
 */
function splitPairs(line) {
  const pairs = [];
  const cells = line.split(/\s*\|\s*/).map((c) => c.trim());

  // Spacer columns carry no information here; work on the filled cells and
  // remember nothing about their original index except that order is kept.
  const filled = cells.filter(Boolean);

  // A DEFINITE label is one the dictionary or an exact synonym resolves. Only
  // these delimit a value — a weak similarity score must not, or a value that
  // happens to resemble a synonym would blank its own field.
  const definiteLabel = (t) => {
    if (!isLabelCandidate(t)) return false;
    const hit = matchField(t);
    return Boolean(hit && hit.exact);
  };

  // "Label: Value" inside a single cell — pasted text, FIR headers and the
  // covering e-mail all use this shape. The guard keeps it from firing on a
  // colon that is not a delimiter: "16:07" is a time, not a field called
  // "04 July 2026 16", and the "S/O:" opening an Indian postal address is a
  // relationship prefix rather than a label.
  cells.forEach((cell) => {
    const colon = cell.match(/^([^:：]{2,60}?)\s*[:：]\s*(.+)$/);
    if (colon && isColonLabel(colon[1])) pairs.push({ label: colon[1], value: colon[2] });
  });

  let n = 0;
  while (n < filled.length) {
    if (!isLabelCandidate(filled[n])) { n += 1; continue; }

    // Several labels can share one run of cells, with their values in a
    // matching run after them: the policy schedule prints "Type of Body |
    // Color" as one cell pair and "Hatchback | PEARL ARCTIC WHITE" as another.
    // Pair those positionally, but only when the two runs are the same length —
    // otherwise the sheet left a field blank and positional pairing would shift
    // every value up by one.
    let runEnd = n;
    while (runEnd < filled.length && definiteLabel(filled[runEnd])) runEnd += 1;
    const labelCount = runEnd - n;

    if (labelCount >= 2) {
      let valueEnd = runEnd;
      while (valueEnd < filled.length && !definiteLabel(filled[valueEnd])) valueEnd += 1;
      if (valueEnd - runEnd === labelCount) {
        for (let q = 0; q < labelCount; q += 1) {
          pairs.push({ label: filled[n + q], value: filled[runEnd + q] });
        }
        n = valueEnd;
        continue;
      }
    }

    // One label: its value is the next cell, unless that cell is itself a
    // definite label — which means the sheet left this field blank. "Name of IV
    // Driver |  | DL Number | RJ08…" must yield an empty driver name, not a
    // driver called "DL Number".
    const label = filled[n];
    const next = n + 1 < filled.length ? filled[n + 1] : null;
    const value = next && !definiteLabel(next) ? next : '';
    pairs.push({ label, value });
    n = value ? n + 2 : n + 1;
  }

  // A short bare label on its own row takes its value from the row below. Only
  // a label that actually resolves may do this: an unresolved single-cell row
  // is a wrapped continuation, and letting it borrow the next line paired
  // "Relationship Manager/Sales Manager" with "Regards, USGI Admin".
  if (filled.length === 1 && isLabelCandidate(filled[0]) && filled[0].length <= 40) {
    const trailing = filled[0].match(/^([^:：]{2,60}?)\s*[:：]\s*$/);
    const label = trailing ? trailing[1] : filled[0];
    if (matchField(label)) pairs.push({ label, value: '', fromBareLabel: true });
  }

  return pairs;
}

/**
 * Is the text before a colon a field label, or is the colon part of the value?
 * A label has at least one real word in it and does not end mid-number.
 */
function isColonLabel(text) {
  const t = String(text || '').trim();
  if (!/[A-Za-z]{3}/.test(t)) return false;
  if (/\d$/.test(t)) return false;
  return t.split(/[\s/]+/).some((w) => /^[A-Za-z]{3,}$/.test(w));
}

// Markers of documents that are NOT claim intimations. A policy schedule or a
// terms-and-conditions wording dropped into a batch alongside the real claim
// files should not become its own bogus "case" — it has no claim number, its
// prose defeats field extraction, and searching it burns a search slot on a
// document that describes no incident.
const POLICY_DOC_MARKERS = [
  'certificate cum policy schedule', 'policy schedule', 'tax invoice',
  'period of insurance', 'proposal no', 'premium computation',
  'central motor vehicles rules', 'terms and conditions', 'policy wording'
];

const CLAIM_DOC_MARKERS = [
  'claim no', 'claim number', 'intimation', 'date of accident', 'loss city',
  'cause of accident', 'accident date', 'fir', 'date of loss', 'loss location'
];

// Text that belongs to the covering e-mail rather than to the claim. Without
// this the "longest prose block" fallback picked the security banner, and the
// accident narrative for every case read "This email originated from outside of
// USGI domain. DO NOT click the links…".
const BOILERPLATE = /(originated from outside|do not click the link|unless you recognize the sender|following case is assigned|please find the intimation details|^regards|usgi admin|this is a system generated)/i;

/**
 * Classify a document so the batch pipeline can tell a claim intimation apart
 * from a supporting policy copy.
 */
export function classifyDocument(text) {
  const t = String(text || '').toLowerCase().slice(0, 6000);
  const policyHits = POLICY_DOC_MARKERS.filter((m) => t.includes(m)).length;
  const claimHits = CLAIM_DOC_MARKERS.filter((m) => t.includes(m)).length;
  const hasClaimRef = /\b(?:CL|CLM)[-/ ]?\d{6,12}\b/i.test(text || '');

  if (hasClaimRef && claimHits >= 2) return 'claim';
  if (policyHits >= 2 && claimHits <= 1) return 'policy';
  if (claimHits >= 3) return 'claim';
  return 'unknown';
}

// Bounds on the catch-all bucket, so a 40-page policy wording cannot turn one
// case record into a memory problem.
const MAX_ADDITIONAL_DETAILS = 80;
const MAX_ADDITIONAL_VALUE = 400;

/**
 * Extract every field the document carries.
 *
 * @param {string} text          Document body (PDF text layer or pasted text).
 * @param {string} fallbackId    Claim id to use when the document has none.
 * @returns {{facts:object, confidence:object, quality:object}}
 */
export function extractClaimFacts(text, fallbackId = '') {
  const facts = {};
  const confidence = {};
  ALL_FIELDS.forEach((f) => { facts[f] = ''; confidence[f] = 0; });

  const body = String(text || '');
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const notes = [];

  // Labels the dictionary and the synonym table both failed to place. Kept
  // verbatim so nothing on the page is silently lost.
  const additional = new Map();

  // ---- Pass 1: labelled pairs --------------------------------------------
  lines.forEach((line, idx) => {
    splitPairs(line).forEach(({ label, value, fromBareLabel }) => {
      const hit = matchField(label);
      let v = cleanValue(value);

      if (!hit) {
        // Unrecognised, but still a labelled value printed on the document, so
        // it is kept verbatim rather than dropped. Only its own cell counts:
        // an unresolved label must not borrow the row below, or a wrapped
        // trailing line pairs itself with the sign-off beneath it.
        if (v && !isIgnored(label) && isColonLabel(label) && additional.size < MAX_ADDITIONAL_DETAILS) {
          const key = normLabel(label);
          if (key && !additional.has(key)) {
            additional.set(key, { label: String(label).trim(), value: v.slice(0, MAX_ADDITIONAL_VALUE) });
          }
        }
        return;
      }

      // Only a label that stood ALONE on its row may borrow the row below, and
      // only from a plain single-cell line. A label in the last cell of a grid
      // row deliberately may not: the line under it is the next row of the
      // table, not its value. Measured on the samples, borrowing there invented
      // a FASTag ID out of the section heading "Insured Declared Value", and an
      // "Intimated By" out of "Relationship Manager/Sales Manager" — which the
      // page geometry shows is a label of its own in the first column, not a
      // value at all. An empty cell in the middle of a grid row means the sheet
      // left that field blank, and reaching past it captures the next label.
      if (!v && fromBareLabel && idx + 1 < lines.length) {
        const nextCells = lines[idx + 1].split(/\s*\|\s*/).map((c) => c.trim());
        if (nextCells.length === 1 && nextCells[0]) {
          const next = cleanValue(nextCells[0]);
          if (next && !matchField(next.split(/[:|]/)[0])) v = next;
        }
      }

      if (!v || looksLikeProse(v, hit.field)) return;

      const fit = valueFit(hit.field, v);
      if (!fit) return;

      const score = (hit.exact ? 0.95 : 0.8) * fit;
      if (score > confidence[hit.field]) {
        facts[hit.field] = v;
        confidence[hit.field] = score;
      }
    });
  });

  // ---- Pass 2: regex recovery for the fields that matter most ------------

  if (!facts.claim_id) {
    // Deliberately case-SENSITIVE: under /i the [A-Z0-9/-] class also matches
    // lowercase, so "Claim Intimation Date" yielded a claim number of
    // "intimation". A real claim reference always contains digits, enforced below.
    const m = body.match(/\b(?:CL|CLM|TP-RCU|OD)[-/ ]?\d{6,12}(?:\/\d{3,6})?\b/)
      || body.match(/\bclaim\s*(?:no|number|id)\.?\s*[:\-|]?\s*([A-Z0-9][A-Z0-9/-]{5,24})\b/);
    const candidate = m && (m[1] || m[0]).trim();
    if (candidate && /\d/.test(candidate)) {
      facts.claim_id = candidate;
      confidence.claim_id = 0.85;
    }
  }

  if (!facts.policy_information) {
    const m = body.match(/\b\d{4}\/\d{5,}\/\d{2,}\/\d{3,}\b/)
      || body.match(/\b\d{4}\/\d{5,}\/\d{5,}\b/)
      || body.match(/\b[A-Z]{2,4}\/\d{3,5}\/\d{6,12}\b/);
    if (m) { facts.policy_information = m[0].trim(); confidence.policy_information = 0.8; }
  }

  // Registration plates: collect every distinct valid plate in the document.
  const plates = new Set();
  const plateRe = /\b[A-Z]{2}[\s.-]?\d{1,2}[\s.-]?[A-Z]{0,3}[\s.-]?\d{3,4}\b/g;
  let pm;
  while ((pm = plateRe.exec(body)) !== null) {
    const p = normalisePlate(pm[0]);
    if (p) plates.add(p);
  }
  if (plates.size) {
    const list = [...plates];
    const existing = normalisePlate(facts.vehicle_numbers);
    if (!existing) {
      facts.vehicle_numbers = list.join(', ');
      confidence.vehicle_numbers = Math.max(confidence.vehicle_numbers, 0.85);
    } else if (list.length > 1) {
      // Keep the labelled plate first, append the others found in the body.
      const others = list.filter((p) => p !== existing);
      facts.vehicle_numbers = [existing, ...others].join(', ');
    }
  }

  // A brand new vehicle is intimated with the registration cell reading
  // "NEW---". That is a fact about the claim, not a parse failure, and the
  // reviewer needs to see the difference.
  const unregistered = /registration\s*number\s*\|?\s*(?:new-{2,}|not\s*registered|applied\s*for)/i.test(body)
    || /\bnew-{3}/i.test(body);
  if (!facts.vehicle_numbers && unregistered) {
    notes.push('Vehicle is not yet registered ("NEW---" on the sheet) — there is no number plate to search.');
  }

  if (!facts.insured_contact_no) {
    const m = body.match(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/);
    if (m) { facts.insured_contact_no = m[0].trim(); confidence.insured_contact_no = 0.7; }
  }

  // Dates. There is deliberately NO "first date in the document" fallback: an
  // intimation sheet carries the policy start, policy end, intimation and
  // registration dates as well, and picking the wrong one silently points the
  // whole news search at a day on which nothing happened. A date is only
  // accepted when the surrounding text says it is the accident's.
  if (!facts.accident_date_time) {
    const m = body.match(/(?:accident|loss|incident|occurrence)[^\n|]{0,40}?[:|\s]\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:\s+\d{1,2}[:.]\d{2}(?:\s*[APap]\.?[Mm]\.?)?)?)/i);
    if (m) { facts.accident_date_time = m[1].trim(); confidence.accident_date_time = 0.6; }
  }

  if (!facts.police_station) {
    // Requires an explicit delimiter and a capitalised value so this only fires
    // on a genuinely labelled field. Without that it matched running prose in
    // policy wordings ("…police station and obtain a copy. Provide a photocopy").
    const m = body.match(/(?:police\s*station|thana|\bP\.?S\.?)\s*[:\-|]\s*([A-Z][A-Za-z .'-]{2,40})/);
    const candidate = m && cleanValue(m[1]);
    if (candidate && !looksLikeProse(candidate, 'police_station')) {
      facts.police_station = candidate;
      confidence.police_station = 0.7;
    }
  }

  if (!facts.hospital_name) {
    const m = body.match(/\b([A-Z][A-Za-z .'-]{2,40}\s+(?:Hospital|Medical College|CHC|PHC|Trauma Cent(?:re|er)))\b/);
    const hosp = m && cleanValue(m[1]);
    if (hosp && !looksLikeProse(hosp, 'hospital_name')) {
      facts.hospital_name = hosp;
      confidence.hospital_name = 0.7;
    }
  }

  // ---- Pass 3: narrative -------------------------------------------------
  // Read only from the accident narrative, never from the covering e-mail.
  if (!facts.FIR_cause_narrative) {
    const prose = lines
      .filter((l) => !BOILERPLATE.test(l))
      .filter((l) => l.length > 60 && (l.match(/\s/g) || []).length > 8 && !/\|/.test(l))
      .sort((a, b) => b.length - a.length)[0];
    if (prose) {
      facts.FIR_cause_narrative = prose;
      confidence.FIR_cause_narrative = 0.55;
    }
  }

  if (facts.FIR_cause_narrative && !facts.injury_or_death) {
    const n = facts.FIR_cause_narrative;
    if (/\b(fatal|death|died|deceased|expired|मौत|मृत)\b/i.test(n)) {
      facts.injury_or_death = 'Fatality reported in document';
      confidence.injury_or_death = 0.6;
    } else if (/\b(injur|घायल|hospitali[sz]ed)\b/i.test(n)) {
      facts.injury_or_death = 'Injuries reported in document';
      confidence.injury_or_death = 0.6;
    }
  }

  // ---- Pass 4: derived / normalised fields -------------------------------
  if (facts.insured_name) facts.insured_name = cleanPersonName(facts.insured_name) || facts.insured_name;
  if (facts.driver_name) facts.driver_name = cleanPersonName(facts.driver_name) || facts.driver_name;

  if (!facts.loss_location && facts.spot_of_accident) {
    facts.loss_location = facts.spot_of_accident;
    confidence.loss_location = confidence.spot_of_accident * 0.9;
  }
  if (!facts.spot_of_accident && facts.loss_location) {
    facts.spot_of_accident = facts.loss_location;
    confidence.spot_of_accident = confidence.loss_location * 0.9;
  }
  if (!facts.district_state && facts.police_station_district) {
    facts.district_state = facts.police_station_district;
    confidence.district_state = confidence.police_station_district * 0.9;
  }
  if (!facts.accident_location_city && facts.loss_location) {
    facts.accident_location_city = String(facts.loss_location).split(',')[0].trim();
    confidence.accident_location_city = 0.5;
  }

  // Intimation sheets state the accident place only as Loss City / Loss State,
  // so compose the location the search anchors on from those.
  const composedPlace = [facts.accident_location_city, facts.accident_location_state]
    .filter((v) => isMeaningful(v))
    .map((v) => String(v).trim())
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');

  if (!facts.loss_location && composedPlace) {
    facts.loss_location = composedPlace;
    confidence.loss_location = 0.7;
    if (!facts.spot_of_accident) {
      facts.spot_of_accident = composedPlace;
      confidence.spot_of_accident = 0.6;
    }
  }
  if (!facts.district_state && composedPlace) {
    facts.district_state = composedPlace;
    confidence.district_state = 0.6;
  }

  if (!facts.accident_location_region && facts.accident_location_state) {
    const region = STATE_REGIONS[String(facts.accident_location_state).trim().toLowerCase()];
    if (region) {
      facts.accident_location_region = region;
      confidence.accident_location_region = 0.75;
    }
  }

  // A licence number identifies the driver even when the sheet leaves the
  // driver's name blank, which is the usual case on an intimation sheet.
  if (facts.driver_licence_no && !facts.driver_name) {
    notes.push(`Driver name is blank on the document; the driving licence number ${facts.driver_licence_no} is the only driver identifier available.`);
  }

  // Confidences are shown to the reviewer as percentages; keep them free of
  // floating-point tails such as 0.6174999999999999.
  Object.keys(confidence).forEach((f) => {
    confidence[f] = Number((confidence[f] || 0).toFixed(2));
  });

  const parsedDate = parseFlexibleDate(facts.accident_date_time);
  if (parsedDate) facts.accident_date_iso = toISO(parsedDate);

  if (!facts.claim_id) {
    facts.claim_id = fallbackId || `USGI-${Date.now().toString(36).toUpperCase()}`;
    confidence.claim_id = fallbackId ? 0.5 : 0.2;
  }

  facts.additional_details = [...additional.values()];

  // ---- Quality report ----------------------------------------------------
  const critical = ['claim_id', 'vehicle_numbers', 'accident_date_time', 'loss_location', 'insured_name'];
  const present = critical.filter((f) => isMeaningful(facts[f]));
  const populated = CANONICAL_FIELDS.filter((f) => isMeaningful(facts[f]));
  const extendedPopulated = EXTENDED_FIELDS.filter((f) => isMeaningful(facts[f]));

  const quality = {
    criticalFound: present.length,
    criticalTotal: critical.length,
    missingCritical: critical.filter((f) => !isMeaningful(facts[f])),
    fieldsPopulated: populated.length,
    fieldsTotal: CANONICAL_FIELDS.length,
    extendedPopulated: extendedPopulated.length,
    extendedTotal: EXTENDED_FIELDS.length,
    // Labelled values found on the page that no field claimed. A non-zero
    // count is not an error — it is the audit trail proving nothing was
    // dropped, and the shortlist of labels worth adding to the dictionary.
    unmappedLabels: facts.additional_details.length,
    documentType: classifyDocument(body),
    vehicleUnregistered: Boolean(!facts.vehicle_numbers && unregistered),
    notes,
    // A document that yields fewer than 2 critical fields is almost certainly
    // a scan without a text layer, or the wrong kind of document.
    usable: present.length >= 2,
    averageConfidence: populated.length
      ? Number((populated.reduce((s, f) => s + (confidence[f] || 0), 0) / populated.length).toFixed(2))
      : 0
  };

  return { facts, confidence, quality };
}
