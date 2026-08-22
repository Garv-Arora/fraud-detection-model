// ============================================================================
// socialEvidence.js — presentation rules for discovered social posts
// ----------------------------------------------------------------------------
// Shared by every surface that renders evidence: the Search Lab panel, the
// batch workspace and the Claims Portfolio case view. Kept here rather than in
// a component so all three agree on what counts as a social post, and so the
// rules can be tested without a renderer.
// ============================================================================

// Platform presentation, keyed by the platform the provider's URL resolved to.
// `hosts` is the authority: a badge asserts that a post exists at that address,
// so the host is re-checked at render time rather than trusted from a field.
export const PLATFORMS = {
  facebook: {
    label: 'Facebook', bg: '#E7F0FE', fg: '#1877F2',
    hosts: ['facebook.com', 'fb.com', 'fb.watch']
  },
  instagram: {
    label: 'Instagram', bg: '#FCE7F3', fg: '#C13584',
    hosts: ['instagram.com']
  }
};

export const MATCHED_FIELD_LABELS = {
  person: 'Person', vehicle: 'Vehicle', location: 'Location',
  date: 'Date', incident: 'Incident', operator: 'Operator'
};

/**
 * Is this record a social post we are willing to present as one?
 *
 * All three must hold: the record is flagged social, the platform is one we
 * render, and the URL is still on that platform's own host. The host check is
 * the one that matters — this decides whether a "View Original Post" button
 * appears, and therefore where an investigator is sent. A record asserting
 * `platform: facebook` while pointing elsewhere must never be badged as one.
 */
export function isSocialRecord(record) {
  if (!record || record.source_type !== 'social_media') return false;
  const platform = PLATFORMS[record.platform];
  if (!platform) return false;
  try {
    const host = new URL(record.url).hostname.replace(/^www\./, '').toLowerCase();
    return platform.hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Why the social tier is empty, when it is.
 *
 * A silent absence reads exactly like "no posts exist", which is the one thing
 * it must not be confused with in a claim file: an investigator has to be able
 * to tell a social search that ran and found nothing from one that never ran.
 *
 * Returns null when there are social results, or when nothing reported the tier
 * as unavailable — in which case it genuinely was searched and came back empty.
 */
export function socialTierNotice(socialCount, enginesUnavailable) {
  if (socialCount > 0) return null;

  const entry = (enginesUnavailable || [])
    .find((e) => /serper social/i.test((e && e.engine) || ''));
  if (!entry) return null;

  return /SERPER_API_KEY/i.test(entry.reason || '')
    ? 'Facebook and Instagram were not searched — no SERP key is configured, so social discovery is switched off. Set SERPER_API_KEY in .env and restart the dev server.'
    : `Facebook and Instagram could not be searched: ${entry.reason}`;
}
