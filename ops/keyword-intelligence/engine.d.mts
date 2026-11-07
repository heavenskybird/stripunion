import type { KeywordRecord, ScoreResult, SnapshotProvider } from './model.js';
export interface GscSnapshot {
  source: string; collectedAt: string;
  siteUrl: 'sc-domain:stripunion.com' | 'https://blog.stripunion.com/' | 'sc-domain:avcams.online';
  queryPageRows?: Array<{ date?: string; query: string; page?: string; clicks?: number;
    impressions?: number; position?: number | null }>;
}
export interface BingSnapshot {
  source: string; collectedAt: string;
  sites?: Array<{ siteUrl: string; methodStatus?: Record<string, string>;
    queryStats?: Array<{ Query: string; Date?: string; Clicks?: number;
      Impressions?: number; AvgImpressionPosition?: number }> }>;
}
export type Signal = 'demand' | 'trend' | 'ranking' | 'difficulty' | 'commercial' | 'coverage' | 'intent';
export function normalizeKeyword(value: string): string;
export function adaptGsc(snapshot: GscSnapshot): KeywordRecord[];
export function adaptBing(snapshot: BingSnapshot): KeywordRecord[];
export function canonicalGscRecords(domain?: GscSnapshot | null, blog?: GscSnapshot | null,
  avcams?: GscSnapshot | null): KeywordRecord[];
export function observationKey(row: KeywordRecord): string;
export function deduplicate(records: KeywordRecord[]): KeywordRecord[];
export const DEFAULT_WEIGHTS: Readonly<Record<Signal, number>>;
export function scoreOpportunity(signals: Partial<Record<Signal, number | null>>, options?: {
  weights?: Partial<Record<Signal, number>>; confidence?: number; freshness?: number;
}): ScoreResult;
export const providers: Readonly<{ gsc: SnapshotProvider<GscSnapshot>; bing: SnapshotProvider<BingSnapshot> }>;
