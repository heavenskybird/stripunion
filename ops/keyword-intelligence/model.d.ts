export type EvidenceKind = 'first_party_measured' | 'provider_estimate' | 'sampled_serp' | 'model_hypothesis';
export interface Evidence {
  source: string; property: string | null; observed_at: string;
  source_updated_at: string | null; country: string | null; language: string | null;
  period: { start: string | null; end: string | null };
  kind: EvidenceKind; limitations: string[];
}
export interface KeywordRecord {
  keyword: string; normalized_keyword: string; language: string | null;
  country: string | null; search_engine: 'google' | 'bing'; property: string;
  search_intent: string | null; topic_cluster: string | null; category: string | null;
  estimated_monthly_search_volume: number | null; volume_history: unknown[] | null;
  volume_trend: number | null; volume_source: string | null; data_confidence: number | null;
  our_rank: number | null; our_ranking_url: string | null;
  impressions: number | null; clicks: number | null; ctr: number | null;
  competitor_domains: string[] | null; competitor_rankings: unknown[] | null;
  seo_difficulty_estimate: number | null; backlinks: number | null; referring_domains: number | null;
  content_gap: boolean | null; cannibalization_risk: string | null;
  affiliate_relevance: number | null; opportunity_score: number | null;
  observed_at: string; source_updated_at: string | null;
  evidence: Evidence[];
}
/** Offline boundary: implementations accept parsed snapshots, never publish or collect. */
export interface SnapshotProvider<T> { id: string; adapt(snapshot: T): KeywordRecord[] }
export interface ScoreResult {
  score: number | null; coverage: number; confidence: number;
  contributions: Record<string, { value: number | null; weight: number; contribution: number }>;
  label: 'model-derived prioritization';
}
