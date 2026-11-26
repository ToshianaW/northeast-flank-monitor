export const REVIEW_MAX_AGE_DAYS = 2;

/** Oldest event date eligible for review, based on the UTC calendar day. */
export function oldestReviewEventDate(now = new Date()): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - REVIEW_MAX_AGE_DAYS);
  return day;
}

/** SQL predicate for an events row aliased as e. Both the event and its evidence must be fresh. */
export const FRESH_REVIEW_EVENT = `
  e.event_date >= (now() AT TIME ZONE 'UTC')::date - ${REVIEW_MAX_AGE_DAYS}
  AND COALESCE(
    (SELECT max(COALESCE(r.published_at, r.fetched_at)) >= now() - interval '${REVIEW_MAX_AGE_DAYS * 24} hours'
     FROM event_sources evidence
     JOIN raw_documents r ON r.url = evidence.article_url
     WHERE evidence.event_id = e.event_id AND evidence.relationship = 'SUPPORTS'),
    true
  )
`;
