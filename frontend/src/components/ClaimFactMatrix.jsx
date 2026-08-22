import React, { useState } from 'react';
import { Database } from 'lucide-react';
import {
  humaniseFieldName, ALL_FIELDS, FIELD_GROUPS, CONTRACT_FIELDS, CONTRACT_POSITION
} from '../lib/claimFactExtractor';

// Fields whose value is a paragraph rather than a token, so the review screen
// gives them a textarea instead of a single-line input.
const LONG_TEXT_FIELDS = new Set([
  'FIR_cause_narrative', 'supporting_information', 'insured_address',
  'parties_involved', 'attachments_listed', 'period_of_insurance',
  'vehicle_types', 'past_record_vehicle'
]);

// The five fields an investigation cannot proceed without.
const CRITICAL_FIELDS = new Set([
  'claim_id', 'vehicle_numbers', 'accident_date_time', 'loss_location', 'insured_name'
]);

/**
 * Review matrix for everything the document actually contained.
 *
 * Driven by FIELD_GROUPS rather than a hand-written list of thirty, so it grows
 * with the schema: a USGI intimation sheet yields around sixty fields and a
 * policy schedule around forty, against the thirty the client's export contract
 * defines. Contract fields keep their export numbers, so the screen and the
 * spreadsheet always agree on what "header 11" means.
 *
 * Nothing here is invented. The previous version filled an empty field with a
 * placeholder lifted from a sample case, so an unparsed claim displayed the
 * claimant "Lalit Parakh", policy "AVO/2315/20079740" and a 14-06-2026 loss
 * date — all belonging to a different claim. An empty field now reads as empty,
 * because on a fraud file a confident wrong value is worse than a blank one.
 */
export default function ClaimFactMatrix({ facts, confidence = {}, isEditable = false, onChange = null }) {
  const [showEmpty, setShowEmpty] = useState(false);
  if (!facts) return null;

  const readValue = (key) => {
    const raw = facts[key];
    if (Array.isArray(raw)) return raw.join(', ');
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const hasValue = (key) => readValue(key).trim() !== '';

  const getConf = (key) => {
    const val = confidence[key];
    if (val === undefined || val === null) return null;
    return Math.round(val * 100) + '%';
  };

  const getConfClass = (key) => {
    const val = confidence[key];
    if (val === undefined || val >= 0.85) return 'badge-low';
    if (val >= 0.6) return 'badge-medium';
    return 'badge-high';
  };

  const updateField = (key, val) => {
    if (!onChange) return;
    onChange({ ...facts, [key]: key === 'vehicle_numbers' ? val.split(',').map((x) => x.trim()) : val });
  };

  const populated = ALL_FIELDS.filter(hasValue);
  const contractPresent = CONTRACT_FIELDS.filter(hasValue);
  const extras = (facts.additional_details || []).filter((d) => d && d.label && d.value);

  // A contract field is always listed even when blank, so the reviewer can see
  // what the document did not supply. Everything else appears only when it has
  // a value, unless the reviewer asks for the whole schema.
  const groups = FIELD_GROUPS
    .map((g) => ({
      ...g,
      visible: g.fields.filter((key) => hasValue(key) || showEmpty || CONTRACT_POSITION.has(key))
    }))
    .filter((g) => g.visible.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Database size={18} style={{ color: 'var(--usgi-red)' }} />
            {populated.length} fields read from this document
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            {contractPresent.length} of the {CONTRACT_FIELDS.length} contract headers were found
            {populated.length > contractPresent.length
              ? ', plus ' + (populated.length - contractPresent.length) + ' further fields the sheet carries.'
              : '.'}
            {' '}A blank field means the document did not state it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowEmpty((v) => !v)}
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '5px 10px' }}
          >
            {showEmpty ? 'Hide empty fields' : 'Show all ' + ALL_FIELDS.length + ' schema fields'}
          </button>
          {isEditable && (
            <span className="badge badge-low" style={{ fontSize: '11px' }}>Verification mode</span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', alignItems: 'start' }}>
        {groups.map((sec) => (
          <div key={sec.title} className="card" style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderTop: '4px solid ' + sec.colour,
            borderRadius: '12px',
            padding: '18px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h5 style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B', margin: 0, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span>{sec.title}</span>
              <span style={{ color: '#94A3B8', fontWeight: '700' }}>
                {sec.fields.filter(hasValue).length}/{sec.fields.length}
              </span>
            </h5>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sec.visible.map((key) => {
                const value = readValue(key);
                const position = CONTRACT_POSITION.get(key);
                const conf = getConf(key);
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <label style={{ fontSize: '10.5px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {position ? position + '. ' : ''}{humaniseFieldName(key)}
                        {CRITICAL_FIELDS.has(key) && <span style={{ color: 'var(--usgi-red)' }}> *</span>}
                      </label>
                      {isEditable && value && conf && (
                        <span className={'badge ' + getConfClass(key)} style={{ fontSize: '9px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
                          {conf}
                        </span>
                      )}
                    </div>

                    {isEditable ? (
                      LONG_TEXT_FIELDS.has(key) ? (
                        <textarea
                          className="form-control"
                          style={{ minHeight: '56px', fontSize: '12px', padding: '6px 10px' }}
                          value={value}
                          onChange={(e) => updateField(key, e.target.value)}
                        />
                      ) : (
                        <input
                          type="text"
                          className="form-control"
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                          value={value}
                          onChange={(e) => updateField(key, e.target.value)}
                        />
                      )
                    ) : (
                      <div style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        color: '#1E293B',
                        fontWeight: CRITICAL_FIELDS.has(key) ? '700' : '500',
                        lineHeight: '1.4',
                        wordBreak: 'break-word'
                      }}>
                        {value || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Not stated in the document</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!!extras.length && (
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderTop: '4px solid #64748B', borderRadius: '12px', padding: '18px' }}>
          <h5 style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B', margin: '0 0 4px 0' }}>
            Other labelled values printed on the document ({extras.length})
          </h5>
          <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
            Labels the schema has no field for, kept exactly as printed so nothing on the page is lost.
          </p>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
            {extras.map((d, i) => (
              <div key={d.label + '-' + i} style={{
                display: 'grid', gridTemplateColumns: 'minmax(150px, 32%) 1fr', gap: '10px',
                padding: '7px 11px', fontSize: '12px',
                background: i % 2 ? '#FFFFFF' : '#F8FAFC',
                borderTop: i ? '1px solid #F1F5F9' : 'none'
              }}>
                <div style={{ color: '#64748B', fontWeight: '700' }}>{d.label}</div>
                <div style={{ color: '#0F172A', wordBreak: 'break-word' }}>{d.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
