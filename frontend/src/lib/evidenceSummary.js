// ============================================================================
// evidenceSummary.js — Evidence-grounded briefing generator
// ----------------------------------------------------------------------------
// Produces the markdown briefing rendered by GeminiAiSummaryCard.
//
// Hard rule: every statement here is derived from a result that was actually
// returned, or from a fact the investigator supplied. Nothing is invented. If
// there is no corroboration, the briefing says so plainly — a fabricated
// evidence summary in a fraud file is worse than no summary at all.
// ============================================================================

import { formatLongDate, extractCasualtyCount, platePermutations } from './searchIntel.js';

function esc(s) {
  return String(s || '').replace(/\|/g, '\\|').trim();
}

function listSentence(arr, max = 4) {
  const a = (arr || []).filter(Boolean).slice(0, max);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

// Pull the casualty figures the *sources* assert, so the briefing can flag a
// disagreement with the declared claim rather than silently picking one.
function corroboratedCasualties(results) {
  const tally = new Map();
  results.forEach((r) => {
    const n = extractCasualtyCount(`${r.title || ''} ${r.snippet || ''}`);
    if (n) tally.set(n, (tally.get(n) || 0) + 1);
  });
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

function publishedDates(results) {
  return results
    .map((r) => r.publish_date)
    .filter(Boolean)
    .map((d) => {
      const dt = new Date(d);
      return isNaN(dt) ? null : dt;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);
}

/**
 * Build the investigator-facing markdown briefing.
 *
 * @param {object} anchors    Output of extractAnchors().
 * @param {Array}  results    Ranked results from rankAndDedupe().
 * @param {object} meta       { enginesUsed, queriesExecuted, elapsedMs, live }
 */
export function buildEvidenceSummary(anchors, results = [], meta = {}) {
  // Bands, not score thresholds. A result can score highly on location and
  // incident vocabulary alone while proving nothing about THIS claim, and the
  // whole point of the banding is that such a result is never described as
  // corroboration.
  const confirmed = results.filter((r) => r.band === 'CONFIRMED');
  const strongBand = results.filter((r) => r.band === 'STRONG');
  const background = results.filter((r) => r.band === 'BACKGROUND');
  const caseSpecific = confirmed;
  const strong = strongBand;
  const authoritative = results.filter((r) => r.authoritative);

  // Built as a clause list so a case with only a location does not read as
  // "executed for at Chittorgarh".
  const subjectParts = [];
  if (anchors.names[0]) subjectParts.push(`**${esc(anchors.names[0])}**`);
  if (anchors.plates[0]) subjectParts.push(`vehicle **${esc(anchors.plates[0])}**`);
  let subject = subjectParts.join(', ');
  if (anchors.places[0]) {
    const place = `**${esc(anchors.places[0])}**`;
    subject = subject ? `${subject} at ${place}` : `an incident at ${place}`;
  }
  if (!subject) subject = `**${esc(anchors.raw || 'the supplied keywords')}**`;

  const dateLine = anchors.date ? formatLongDate(anchors.date) : 'not supplied';

  const sections = [];

  // ------------------------------------------------------------- Overview --
  const engineList = (meta.enginesUsed || []).join(', ') || 'the configured engines';
  let verdict;
  if (confirmed.length) {
    verdict = `**${confirmed.length} CONFIRMED record${confirmed.length > 1 ? 's' : ''}** ${confirmed.length > 1 ? 'name' : 'names'} a hard identifier from this claim — the registration plate, the claimant, or the transport operator — directly in the source text.`;
    if (strongBand.length) verdict += ` A further ${strongBand.length} record${strongBand.length > 1 ? 's match' : ' matches'} the location and date without naming an identifier.`;
  } else if (strongBand.length) {
    const weakerClause = background.length ? ` (plus ${background.length} background ${background.length === 1 ? 'record' : 'records'})` : '';
    verdict = `**${strongBand.length} STRONG record${strongBand.length > 1 ? 's' : ''}**${weakerClause} aligned on location, date and incident context, but **no source names the vehicle or the claimant directly**. Treat as circumstantial corroboration only — these describe accidents in the same area, not necessarily this accident.`;
  } else if (results.length) {
    verdict = `**${results.length} BACKGROUND record${results.length > 1 ? 's' : ''}** ${results.length > 1 ? 'were' : 'was'} returned, none carrying an identifier or a date-and-place alignment that ties it to this claim. Treat as background context, not corroboration.`;
  } else {
    verdict = '**Zero public web records** matched these parameters across every engine queried.';
  }

  let overview = `### Executive Evidence Overview
Public-source discovery was executed for ${subject}${anchors.date ? ` for a declared loss date of **${dateLine}**` : ''}.
${verdict}

**Search execution**
- **Engines queried**: ${esc(engineList)}
- **Distinct queries dispatched**: ${(meta.queriesExecuted || []).length}
- **Records after de-duplication and ranking**: ${results.length}${meta.elapsedMs ? `\n- **Engine response time**: ${(meta.elapsedMs / 1000).toFixed(2)}s` : ''}
- **Search mode**: ${meta.live ? 'Live multi-engine internet search' : 'Manual research links only (live engines unreachable)'}${meta.languages && meta.languages.length > 1 ? `
- **Language editions swept**: ${esc(meta.languages.join(', '))}` : ''}${meta.rounds > 1 ? `
- **Search rounds**: ${meta.rounds} — round 2 re-queried entities harvested from the first pass` : ''}${meta.widened ? `
- **Widening pass**: the precise plan returned nothing, so a broader location-and-incident sweep was run` : ''}`;

  if (!results.length) {
    overview += `

**RCU interpretation**: a nil digital footprint is a routine and expected outcome for minor own-damage losses on district roads — it is *not* by itself a fraud indicator. It does mean the claim cannot be corroborated from open sources, so verification must fall back to the physical trail: police station blotter, T+1 print edition of the district daily, hospital MLC register, and spot inspection. Use the manual research links supplied alongside this summary to run those checks by hand.`;
  }
  sections.push(overview);

  // -------------------------------------------------- What the sources say --
  if (results.length) {
    const top = results.slice(0, 6);
    let findings = `### What the Sources Actually Report\n`;
    findings += '\nEach record carries a confidence band. **CONFIRMED** means an identifier from this claim — the plate, the claimant, the operator — appears in the source. **STRONG** means location, date and incident line up but nothing names the vehicle or the claimant. **BACKGROUND** is keyword overlap only, and is not corroboration.\n';
    top.forEach((r, i) => {
      const score = Math.round(r.relevance_score);
      const dom = esc(r.domain || 'web');
      const when = r.publish_date ? ` · ${esc(String(r.publish_date).slice(0, 25))}` : '';
      findings += `\n**${i + 1}. [${esc(r.title || 'Untitled record')}](${r.url})**  \n`;
      findings += `${dom}${when} · **${r.band || 'BACKGROUND'}** · relevance ${score}%${r.distinct_incident ? ' · *shares a headline with a different incident — verify separately*' : ''}\n`;
      if (r.snippet) findings += `> ${esc(r.snippet).slice(0, 320)}\n`;
      if (r.match_reasons && r.match_reasons.length) {
        findings += `- Why it matched: ${esc(r.match_reasons.slice(0, 3).join('; '))}\n`;
      }
      if (r.also_reported_by && r.also_reported_by.length) {
        findings += `- Also carried by: ${r.also_reported_by.slice(0, 4).map((x) => `[${esc(x.domain)}](${x.url})`).join(', ')}\n`;
      }
    });
    sections.push(findings.trim());
  }

  // ------------------------------------------------- Parameters & matching --
  const paramLines = [];
  if (anchors.plates.length) {
    const hit = results.some((r) => (r.matched_keywords || []).some((k) => anchors.plates.includes(k)));
    paramLines.push(`- **Vehicle registration**: ${esc(anchors.plates.join(', '))} — ${hit ? 'found in at least one public source' : 'not found in any indexed public source'}`);
    if (anchors.plates[0]) {
      paramLines.push(`  - Plate written forms searched: ${platePermutations(anchors.plates[0]).map((p) => `\`${p}\``).join(', ')}`);
    }
  }
  if (anchors.names.length) {
    const hit = results.some((r) => (r.matched_keywords || []).some((k) => anchors.names.includes(k)));
    paramLines.push(`- **Named parties**: ${esc(listSentence(anchors.names))} — ${hit ? 'named in a public report' : 'no public mention located'}`);
  }
  if (anchors.places.length) {
    const hitCount = results.filter((r) => (r.matched_keywords || []).some((k) => anchors.places.includes(k))).length;
    paramLines.push(`- **Location**: ${esc(listSentence(anchors.places))} — referenced by ${hitCount} of ${results.length} records`);
  }
  if (anchors.corridors.length) paramLines.push(`- **Corridor**: ${esc(anchors.corridors.join(', '))}`);
  if (anchors.date) {
    const dates = publishedDates(results);
    const within = dates.filter((d) => Math.abs((d - anchors.date) / 86400000) <= 3).length;
    paramLines.push(`- **Declared loss date**: ${dateLine} — ${within} record${within === 1 ? '' : 's'} published within the T-1 to T+3 window`);
  }
  if (anchors.policeStation) paramLines.push(`- **Police station**: ${esc(anchors.policeStation)}`);
  if (anchors.hospital) paramLines.push(`- **Hospital / MLC**: ${esc(anchors.hospital)}`);
  if (anchors.vehicleTypes.length) paramLines.push(`- **Vehicle description**: ${esc(listSentence(anchors.vehicleTypes))}`);

  if (paramLines.length) {
    sections.push(`### Claim Parameters vs Public Record\n${paramLines.join('\n')}`);
  }

  // --------------------------------------------------------- Discrepancies --
  const flags = [];
  const casualtyTally = corroboratedCasualties(results);
  if (anchors.casualties && casualtyTally.length) {
    const conflicting = casualtyTally.filter(([n]) => n !== anchors.casualties);
    if (conflicting.length && !casualtyTally.some(([n]) => n === anchors.casualties)) {
      flags.push(`**Casualty count disagreement** — the claim references ${anchors.casualties} fatalities, but the sources report ${conflicting.map(([n, c]) => `${n} (in ${c} report${c > 1 ? 's' : ''})`).join(', ')}. Reconcile against the FIR before proceeding.`);
    }
  }
  if (anchors.date) {
    const dates = publishedDates(results);
    const earliest = dates[0];
    if (earliest && (anchors.date - earliest) / 86400000 > 2) {
      flags.push(`**Possible pre-inception exposure** — the earliest matching public report is dated ${formatLongDate(earliest)}, which precedes the declared loss date of ${dateLine} by ${Math.round((anchors.date - earliest) / 86400000)} days. Verify whether the reported event is the same incident.`);
    }
  }
  if (anchors.plates.length && results.length && !caseSpecific.length) {
    flags.push(`**No identifier-level corroboration** — records were returned for the location and incident type, but none names registration ${esc(anchors.plates[0])} or the claimant. The link between this claim and the reported event is unproven.`);
  }
  if (results.length && !authoritative.length) {
    flags.push(`**No newspaper-of-record coverage** — all matches come from lower-tier or aggregator sources. Corroborate against a mainstream daily before relying on these findings.`);
  }

  if (flags.length) {
    sections.push(`### Discrepancy & Risk Flags\n${flags.map((f) => `- ${f}`).join('\n')}`);
  }

  // ------------------------------------------------------- Recommended next --
  const next = [];
  if (!caseSpecific.length) {
    next.push('Run the manual research links in the **Google Research Trail** tab — the date-locked and Hindi-language queries reach district reporting that the automated engines index poorly.');
    next.push(`Check the T+1 print edition (${anchors.date ? formatLongDate(new Date(anchors.date.getTime() + 86400000)) : 'day after the loss'}) of the district daily; print-only crime pages are frequently absent from the web.`);
  }
  if (anchors.policeStation) next.push(`Request the FIR / GD extract from ${esc(anchors.policeStation)} and reconcile the narrative against the sources above.`);
  else next.push('Identify the jurisdictional police station and obtain the FIR or GD extract.');
  if (anchors.plates.length) next.push(`Verify registration ${esc(anchors.plates[0])} on the Vahan public registry for make, model and registration date consistency.`);
  if (anchors.hospital) next.push(`Confirm the MLC entry at ${esc(anchors.hospital)} against the declared injuries.`);
  next.push('Record this search execution in the audit trail, including the nil results — a documented negative finding is itself evidence.');

  sections.push(`### Recommended Verification Steps\n${next.map((n) => `- ${n}`).join('\n')}`);

  return sections.join('\n\n');
}
