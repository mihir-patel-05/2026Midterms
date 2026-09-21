import type { ElectionResultsResponse, SourceStatus } from './contracts.js';

export interface RawResultsDocument<TPayload = unknown> {
  providerKey: string;
  fetchedAt: string;
  sourceUrl: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  sha256?: string;
  payload: TPayload;
}

export interface ResultsParseContext {
  ingestionRunId: string;
  receivedAt: string;
  parserVersion: string;
}

export interface ResultsParseIssue {
  severity: 'WARNING' | 'ERROR';
  code: string;
  message: string;
  path?: ReadonlyArray<string | number>;
}

export interface ParsedResultsBatch {
  providerKey: string;
  source: SourceStatus;
  results: ElectionResultsResponse[];
  issues: ResultsParseIssue[];
}

/**
 * Provider-specific parsers implement this interface after a source is approved.
 * Parsers transform already-fetched documents only; fetching, credentials, raw
 * artifact retention, validation, and publication remain separate concerns.
 */
export interface ElectionResultsParser<TPayload = unknown> {
  readonly providerKey: string;
  readonly parserVersion: string;

  canParse(document: RawResultsDocument<TPayload>): boolean;

  parse(
    document: RawResultsDocument<TPayload>,
    context: ResultsParseContext
  ): Promise<ParsedResultsBatch> | ParsedResultsBatch;
}
