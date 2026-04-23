const LEG_JSON = `json_group_array(json_object(
  'leg_index',        l.leg_index,
  'bookmaker',        l.bookmaker,
  'outcome',          l.outcome,
  'odd',              l.odd,
  'stake',            l.stake,
  'expected_return',  l.expected_return,
  'fetch_url',        l.fetch_url
)) AS legs_json`;

const BASE_COLS = `
  o.id, o.group_id, o.source_type, o.market_type, o.target_date,
  o.start_time, o.canonical_home, o.canonical_away, o.competition,
  o.country, o.confidence, o.n_legs, o.profit_margin_bps,
  o.total_stake, o.guaranteed_return, o.guaranteed_profit,
  o.oldest_odd_updated_at, o.latest_odd_updated_at,
  o.first_seen_at, o.last_seen_at`;

function parseLegs(row) {
  return {
    ...row,
    legs: JSON.parse(row.legs_json || '[]')
      .filter(l => l.bookmaker != null)
      .sort((a, b) => a.leg_index - b.leg_index),
  };
}

export function liveArbs(db) {
  const rows = db.selectObjects(`
    SELECT ${BASE_COLS}, ${LEG_JSON}
    FROM arb_opportunities o
    LEFT JOIN arb_legs l ON l.opportunity_id = o.id
    WHERE o.expired_at IS NULL
    GROUP BY o.id
    ORDER BY o.profit_margin_bps DESC
  `);
  return rows.map(parseLegs);
}

export function expiredArbs(db) {
  const rows = db.selectObjects(`
    SELECT ${BASE_COLS}, o.expired_at, ${LEG_JSON}
    FROM arb_opportunities o
    LEFT JOIN arb_legs l ON l.opportunity_id = o.id
    WHERE o.expired_at IS NOT NULL
      AND (unixepoch('now') - unixepoch(o.expired_at)) <= 10800
    GROUP BY o.id
    ORDER BY o.expired_at DESC
  `);
  return rows.map(parseLegs);
}
