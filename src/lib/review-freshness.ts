/** SQL predicate for an events row aliased as e. Use the newest supporting article. */
export const FRESH_REVIEW_EVENT = `
  COALESCE(
    (SELECT max(COALESCE(r.published_at, r.fetched_at)) >= now() - interval '48 hours'
     FROM event_sources evidence
     JOIN raw_documents r ON r.url = evidence.article_url
     WHERE evidence.event_id = e.event_id AND evidence.relationship = 'SUPPORTS'),
    e.event_date >= (now() AT TIME ZONE 'UTC')::date - 2
  )
`;
