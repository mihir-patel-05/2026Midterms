import { z } from 'zod';

export const RESULT_CONTRACT_VERSION = '1.0.0' as const;

export const DataModeSchema = z.enum(['MOCK', 'LIVE']);
export const ElectionTypeSchema = z.enum(['PRIMARY', 'GENERAL', 'RUNOFF', 'SPECIAL']);
export const ElectionStatusSchema = z.enum([
  'SCHEDULED',
  'OPEN',
  'CLOSED',
  'CANVASSING',
  'CERTIFIED',
]);
export const ContestOfficeTypeSchema = z.enum([
  'US_SENATE',
  'US_HOUSE',
  'STATEWIDE_EXECUTIVE',
  'COUNTY_OFFICE',
  'OTHER',
]);
export const JurisdictionTypeSchema = z.enum([
  'NATIONAL',
  'STATE',
  'CONGRESSIONAL_DISTRICT',
  'COUNTY',
  'PRECINCT',
  'OTHER',
]);
export const ReportingUnitTypeSchema = z.enum([
  'STATE',
  'CONGRESSIONAL_DISTRICT',
  'COUNTY',
  'PRECINCT',
  'SPLIT_PRECINCT',
  'OTHER',
]);
export const ResultStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETE',
  'DELAYED',
  'UNAVAILABLE',
]);
export const CertificationStateSchema = z.enum([
  'UNCERTIFIED',
  'PARTIALLY_CERTIFIED',
  'CERTIFIED',
]);
export const SourceHealthSchema = z.enum([
  'HEALTHY',
  'DEGRADED',
  'STALE',
  'UNAVAILABLE',
  'NOT_CONFIGURED',
]);
export const SourceTypeSchema = z.enum([
  'MOCK_FIXTURE',
  'LICENSED_PROVIDER',
  'STATE_OFFICIAL',
  'LOCAL_OFFICIAL',
  'OTHER',
]);
export const ResponseStatusSchema = z.enum(['AVAILABLE', 'PARTIAL', 'UNAVAILABLE']);
export const FreshnessStatusSchema = z.enum(['FRESH', 'STALE', 'UNKNOWN']);
export const CoverageStatusSchema = z.enum(['COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN']);

const IdentifierSchema = z.string().trim().min(1).max(160);
const StateCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Expected a two-letter uppercase state code');
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const IsoDateTimeSchema = z.string().datetime({ offset: true });
const PercentageSchema = z.number().finite().min(0).max(100);

export const JurisdictionSchema = z
  .object({
    id: IdentifierSchema,
    type: JurisdictionTypeSchema,
    name: z.string().trim().min(1).max(240),
    stateCode: StateCodeSchema.optional(),
    districtCode: z.string().trim().min(1).max(16).optional(),
    countyFips: z.string().regex(/^\d{5}$/, 'Expected a five-digit county FIPS code').optional(),
  })
  .strict();

export const ElectionSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(240),
    electionDate: IsoDateSchema,
    type: ElectionTypeSchema,
    status: ElectionStatusSchema,
    cycle: z.number().int().min(1788).max(9999),
    jurisdiction: JurisdictionSchema,
  })
  .strict();

export const ContestSchema = z
  .object({
    id: IdentifierSchema,
    electionId: IdentifierSchema,
    sourceContestId: IdentifierSchema.optional(),
    officeType: ContestOfficeTypeSchema,
    officeTitle: z.string().trim().min(1).max(240),
    jurisdiction: JurisdictionSchema,
    districtCode: z.string().trim().min(1).max(16).optional(),
    seatName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const PartySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    abbreviation: z.string().trim().min(1).max(16).optional(),
  })
  .strict();

export const CandidateSchema = z
  .object({
    id: IdentifierSchema,
    candidacyId: IdentifierSchema,
    displayName: z.string().trim().min(1).max(240),
    party: PartySchema.nullable(),
    ballotOrder: z.number().int().positive().optional(),
    isWriteIn: z.boolean().default(false),
  })
  .strict();

export const ReportingUnitSchema = z
  .object({
    id: IdentifierSchema,
    sourceUnitId: IdentifierSchema.optional(),
    type: ReportingUnitTypeSchema,
    name: z.string().trim().min(1).max(240),
    stateCode: StateCodeSchema,
    districtCode: z.string().trim().min(1).max(16).optional(),
    countyFips: z.string().regex(/^\d{5}$/, 'Expected a five-digit county FIPS code').optional(),
    parentId: IdentifierSchema.optional(),
  })
  .strict();

export const CandidateResultSchema = z
  .object({
    candidateId: IdentifierSchema,
    candidacyId: IdentifierSchema,
    votes: z.number().int().nonnegative(),
    percentage: PercentageSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

const ProgressCountSchema = z
  .object({
    reported: z.number().int().nonnegative().nullable(),
    total: z.number().int().nonnegative().nullable(),
    percentage: PercentageSchema.nullable(),
  })
  .strict()
  .superRefine((progress, context) => {
    if ((progress.reported === null) !== (progress.total === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reported and total must either both be numbers or both be null',
      });
    }

    if (progress.reported !== null && progress.total !== null && progress.reported > progress.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reported cannot exceed total',
        path: ['reported'],
      });
    }

    if (progress.total === null && progress.percentage !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'percentage must be null when the source does not provide progress counts',
        path: ['percentage'],
      });
    }
  });

export const ReportingProgressSchema = z
  .object({
    reportingUnits: ProgressCountSchema,
    precincts: ProgressCountSchema,
  })
  .strict();

export const ReportingUnitResultSchema = z
  .object({
    reportingUnit: ReportingUnitSchema,
    candidateResults: z.array(CandidateResultSchema),
    totalVotes: z.number().int().nonnegative(),
    reportingProgress: ReportingProgressSchema,
    status: ResultStatusSchema,
    certificationState: CertificationStateSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const ContestResultSchema = z
  .object({
    snapshotId: IdentifierSchema,
    election: ElectionSchema,
    contest: ContestSchema,
    reportingUnit: ReportingUnitSchema,
    candidates: z.array(CandidateSchema),
    candidateResults: z.array(CandidateResultSchema),
    reportingUnitResults: z.array(ReportingUnitResultSchema),
    totalVotes: z.number().int().nonnegative(),
    reportingProgress: ReportingProgressSchema,
    status: ResultStatusSchema,
    certificationState: CertificationStateSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.contest.electionId !== result.election.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'contest.electionId must reference election.id',
        path: ['contest', 'electionId'],
      });
    }

    const candidateIds = new Set(result.candidates.map(candidate => candidate.id));
    const candidacyIds = new Set(result.candidates.map(candidate => candidate.candidacyId));
    const candidacyByCandidateId = new Map(
      result.candidates.map(candidate => [candidate.id, candidate.candidacyId])
    );

    if (candidateIds.size !== result.candidates.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'candidate ids must be unique within a contest result',
        path: ['candidates'],
      });
    }

    if (candidacyIds.size !== result.candidates.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'candidacy ids must be unique within a contest result',
        path: ['candidates'],
      });
    }

    const validateCandidateResults = (
      candidateResults: z.infer<typeof CandidateResultSchema>[],
      totalVotes: number,
      path: Array<string | number>
    ) => {
      const resultCandidateIds = new Set<string>();

      for (const [index, candidateResult] of candidateResults.entries()) {
        if (!candidateIds.has(candidateResult.candidateId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'candidate result references an unknown candidate',
            path: [...path, index, 'candidateId'],
          });
        }

        if (!candidacyIds.has(candidateResult.candidacyId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'candidate result references an unknown candidacy',
            path: [...path, index, 'candidacyId'],
          });
        }

        if (
          candidacyByCandidateId.has(candidateResult.candidateId) &&
          candidacyByCandidateId.get(candidateResult.candidateId) !== candidateResult.candidacyId
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'candidateId and candidacyId must reference the same candidate',
            path: [...path, index, 'candidacyId'],
          });
        }

        if (resultCandidateIds.has(candidateResult.candidateId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'candidate results must not contain duplicate candidates',
            path: [...path, index, 'candidateId'],
          });
        }

        resultCandidateIds.add(candidateResult.candidateId);
      }

      const listedVotes = candidateResults.reduce(
        (sum, candidateResult) => sum + candidateResult.votes,
        0
      );
      if (listedVotes > totalVotes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'candidate vote sum cannot exceed totalVotes',
          path,
        });
      }
    };

    validateCandidateResults(result.candidateResults, result.totalVotes, ['candidateResults']);
    for (const [index, reportingUnitResult] of result.reportingUnitResults.entries()) {
      validateCandidateResults(
        reportingUnitResult.candidateResults,
        reportingUnitResult.totalVotes,
        ['reportingUnitResults', index, 'candidateResults']
      );
    }

    if (result.certificationState === 'CERTIFIED' && result.status !== 'COMPLETE') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a certified result must have COMPLETE result status',
        path: ['status'],
      });
    }
  });

export const SourceStatusSchema = z
  .object({
    providerKey: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    name: z.string().trim().min(1).max(240),
    url: z.string().url(),
    type: SourceTypeSchema,
    health: SourceHealthSchema,
    isMock: z.boolean(),
    updatedAt: IsoDateTimeSchema,
    lastCheckedAt: IsoDateTimeSchema,
    lastSuccessfulAt: IsoDateTimeSchema.nullable(),
    expectedUpdateIntervalSeconds: z.number().int().positive().nullable(),
    message: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const ResponseMetadataSchema = z
  .object({
    contractVersion: z.literal(RESULT_CONTRACT_VERSION),
    generatedAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    dataMode: DataModeSchema,
    isMockData: z.boolean(),
    mockDisclaimer: z.string().trim().min(1).max(500).optional(),
    responseStatus: ResponseStatusSchema,
    freshness: FreshnessStatusSchema,
    coverage: CoverageStatusSchema,
    source: SourceStatusSchema,
    limitations: z.array(z.string().trim().min(1).max(500)),
    request: z
      .object({
        electionId: IdentifierSchema.optional(),
        contestId: IdentifierSchema.optional(),
        reportingUnitId: IdentifierSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const ElectionResultsResponseSchema = z
  .object({
    data: ContestResultSchema.nullable(),
    meta: ResponseMetadataSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (response.meta.responseStatus === 'UNAVAILABLE' && response.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'unavailable responses must not contain result data',
        path: ['data'],
      });
    }

    if (response.meta.responseStatus !== 'UNAVAILABLE' && response.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'available and partial responses must contain result data',
        path: ['data'],
      });
    }

    if (response.meta.coverage === 'NONE' && response.meta.responseStatus !== 'UNAVAILABLE') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'coverage NONE requires an UNAVAILABLE response',
        path: ['meta', 'coverage'],
      });
    }

    const mockFieldsAgree =
      response.meta.dataMode === 'MOCK' &&
      response.meta.isMockData &&
      response.meta.source.isMock &&
      response.meta.source.type === 'MOCK_FIXTURE' &&
      Boolean(response.meta.mockDisclaimer);
    const liveFieldsAgree =
      response.meta.dataMode === 'LIVE' &&
      !response.meta.isMockData &&
      !response.meta.source.isMock &&
      response.meta.source.type !== 'MOCK_FIXTURE' &&
      response.meta.mockDisclaimer === undefined;

    if (!mockFieldsAgree && !liveFieldsAgree) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'data mode, mock labeling, disclaimer, and source type must agree',
        path: ['meta'],
      });
    }
  });

export const ResultsProviderFeatureFlagSchema = z
  .object({
    providerKey: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    enabled: z.boolean(),
    dataMode: DataModeSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const ElectionResultsFeatureFlagsSchema = z
  .object({
    dashboardEnabled: z.boolean(),
    providers: z.record(ResultsProviderFeatureFlagSchema),
  })
  .strict()
  .superRefine((flags, context) => {
    for (const [providerKey, provider] of Object.entries(flags.providers)) {
      if (provider.providerKey !== providerKey) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'provider registry key must match providerKey',
          path: ['providers', providerKey, 'providerKey'],
        });
      }
    }
  });

export type DataMode = z.infer<typeof DataModeSchema>;
export type Election = z.infer<typeof ElectionSchema>;
export type Contest = z.infer<typeof ContestSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type ReportingUnit = z.infer<typeof ReportingUnitSchema>;
export type CandidateResult = z.infer<typeof CandidateResultSchema>;
export type ReportingProgress = z.infer<typeof ReportingProgressSchema>;
export type ReportingUnitResult = z.infer<typeof ReportingUnitResultSchema>;
export type ContestResult = z.infer<typeof ContestResultSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;
export type ElectionResultsResponse = z.infer<typeof ElectionResultsResponseSchema>;
export type ResultsProviderFeatureFlag = z.infer<typeof ResultsProviderFeatureFlagSchema>;
export type ElectionResultsFeatureFlags = z.infer<typeof ElectionResultsFeatureFlagsSchema>;
