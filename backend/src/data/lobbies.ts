/**
 * Industry / lobby classification for FEC contributions.
 *
 * For each lobby we match Receipt rows three ways:
 *   - committeeIds: exact FEC committee ID of a contributing PAC
 *   - namePatterns: case-insensitive regex against contributorName
 *     (catches PAC contributions where the contributor IS the PAC)
 *   - employerPatterns: case-insensitive regex against contributorEmployer
 *     (catches individual donors employed by industry firms)
 *
 * Sources: FEC.gov public committee filings, OpenSecrets industry
 * classifications (CRP codes — public reference), major-employer lists.
 *
 * Intentionally conservative — totals will undercount but should not
 * overcount. Update the lists below to expand coverage.
 */
export interface LobbyDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  committeeIds: string[];
  namePatterns: string[];
  employerPatterns: string[];
}

export const LOBBIES: LobbyDefinition[] = [
  {
    id: 'ai',
    name: 'AI / Big Tech',
    description:
      'Artificial intelligence companies, model labs, and the largest cloud/compute providers backing AI policy.',
    color: '#8b5cf6',
    committeeIds: [
      'C00428235', // Google Inc. NetPAC
      'C00487777', // Microsoft Corp PAC
      'C00428912', // Amazon.com PAC
      'C00819872', // Fairshake (crypto+tech aligned)
      'C00770273', // Meta Platforms PAC
      'C00838526', // Leading the Future (AI policy super PAC)
    ],
    namePatterns: [
      'leading the future',
      'americans for ai',
      'fairshake',
      'google.*pac',
      'microsoft.*pac',
      'alphabet inc',
      'meta platforms.*pac',
      'amazon\\.com.*pac',
      'nvidia.*pac',
      'ibm.*pac',
      'oracle.*pac',
      'salesforce.*pac',
    ],
    employerPatterns: [
      'openai',
      'anthropic',
      'google',
      'alphabet',
      'deepmind',
      'microsoft',
      'meta platforms',
      'facebook',
      'nvidia',
      'amazon',
      'amazon web services',
      '\\baws\\b',
      'apple inc',
      'oracle',
      '\\bibm\\b',
      'salesforce',
      'scale ai',
      'perplexity',
      'mistral',
      'cohere',
      'databricks',
      'palantir',
      'huggingface',
      'hugging face',
      'stability ai',
      '\\bxai\\b',
      'x\\.ai',
    ],
  },
  {
    id: 'oil_gas',
    name: 'Oil & Gas',
    description:
      'Oil majors, independents, refiners, pipeline operators, and their trade-association PACs.',
    color: '#1f2937',
    committeeIds: [
      'C00126774', // Chevron Employees PAC
      'C00012245', // ExxonMobil PAC
      'C00041681', // ConocoPhillips SPIRIT PAC
      'C00177439', // Marathon Petroleum Corp Employees PAC
      'C00033710', // Halliburton Co PAC
      'C00078451', // Koch Industries PAC (KOCHPAC)
      'C00114531', // American Petroleum Institute PAC
      'C00263601', // Independent Petroleum Assn of America PAC
      'C00107477', // Occidental Petroleum Corp PAC
      'C00193337', // Valero Energy Corp PAC
    ],
    namePatterns: [
      'exxon.*pac',
      'chevron.*pac',
      'conocophillips.*pac',
      'occidental.*pac',
      'marathon.*pac',
      'valero.*pac',
      'phillips 66.*pac',
      'halliburton.*pac',
      'schlumberger.*pac',
      'koch industries.*pac',
      'energy transfer.*pac',
      'kinder morgan.*pac',
      'enterprise products.*pac',
      'american petroleum institute',
      '\\bapi pac\\b',
      'ipaa pac',
      'independent petroleum',
    ],
    employerPatterns: [
      'exxon',
      'exxonmobil',
      'chevron',
      'conocophillips',
      'occidental petroleum',
      'marathon petroleum',
      'marathon oil',
      'valero',
      'phillips 66',
      'shell oil',
      'shell usa',
      'halliburton',
      'schlumberger',
      'baker hughes',
      'koch industries',
      'energy transfer',
      'kinder morgan',
      'enterprise products',
      'pioneer natural',
      'devon energy',
      'eog resources',
      'hess corporation',
      'american petroleum institute',
    ],
  },
  {
    id: 'pro_israel',
    name: 'Pro-Israel',
    description:
      'PACs and organizations that explicitly advocate U.S.-Israel policy alignment. Includes both bipartisan and partisan-leaning groups.',
    color: '#0ea5e9',
    committeeIds: [
      'C00797670', // United Democracy Project (AIPAC-affiliated super PAC)
      'C00127811', // AIPAC PAC
      'C00734301', // Democratic Majority for Israel
      'C00528081', // Republican Jewish Coalition PAC
      'C00130377', // NORPAC
      'C00368856', // Pro-Israel America PAC
      'C00497915', // To Protect Our Heritage PAC
      'C00136473', // Joint Action Committee for Political Affairs (JACPAC)
      'C00098699', // Washington PAC
      'C00499945', // Hudson Valley PAC
    ],
    namePatterns: [
      '\\baipac\\b',
      'united democracy project',
      'democratic majority for israel',
      'republican jewish coalition',
      'norpac',
      'jacpac',
      'pro-israel america',
      'to protect our heritage',
      'joint action committee for political affairs',
      'florida congressional committee',
      'hudson valley pac',
      'desert caucus',
      'washington pac',
    ],
    employerPatterns: [],
  },
  {
    id: 'pharma',
    name: 'Pharma & Health Products',
    description: 'Pharmaceutical manufacturers, biotech firms, and PhRMA-affiliated PACs.',
    color: '#ef4444',
    committeeIds: [
      'C00081496', // Pfizer Inc PAC
      'C00043604', // Merck & Co Inc PAC
      'C00025260', // Eli Lilly & Co PAC
      'C00131110', // Johnson & Johnson PAC
      'C00141788', // AbbVie Inc PAC
      'C00248818', // Amgen Inc PAC
      'C00345366', // PhRMA PAC
    ],
    namePatterns: [
      'pfizer.*pac',
      'merck.*pac',
      'eli lilly.*pac',
      'johnson & johnson.*pac',
      'abbvie.*pac',
      'bristol.*myers.*pac',
      'amgen.*pac',
      'novartis.*pac',
      'gilead.*pac',
      'phrma pac',
      'biotechnology innovation',
    ],
    employerPatterns: [
      'pfizer',
      'merck',
      'eli lilly',
      'johnson & johnson',
      'abbvie',
      'bristol-myers',
      'bristol myers squibb',
      'amgen',
      'novartis',
      'gilead',
      'regeneron',
      'moderna',
      'biontech',
      'sanofi',
      'astrazeneca',
      'glaxosmithkline',
      '\\bgsk\\b',
      'phrma',
    ],
  },
  {
    id: 'defense',
    name: 'Defense & Aerospace',
    description: 'Major defense contractors and aerospace manufacturers with federal contracts.',
    color: '#475569',
    committeeIds: [
      'C00277345', // Lockheed Martin Employees PAC
      'C00010057', // Boeing Co PAC
      'C00146574', // Raytheon Co PAC (RTX)
      'C00034298', // Northrop Grumman Corp PAC
      'C00224946', // General Dynamics Voluntary Political Contribution Plan
      'C00134290', // L3Harris Technologies PAC
    ],
    namePatterns: [
      'lockheed martin.*pac',
      'boeing.*pac',
      'raytheon.*pac',
      'rtx.*pac',
      'northrop grumman.*pac',
      'general dynamics.*pac',
      'l3harris.*pac',
      'huntington ingalls.*pac',
      'leidos.*pac',
    ],
    employerPatterns: [
      'lockheed martin',
      'boeing',
      'raytheon',
      'rtx corp',
      'northrop grumman',
      'general dynamics',
      'l3harris',
      'huntington ingalls',
      'leidos',
      'booz allen',
      '\\bsaic\\b',
      'anduril',
    ],
  },
  {
    id: 'crypto',
    name: 'Crypto & Blockchain',
    description: 'Cryptocurrency exchanges, blockchain firms, and major crypto-aligned PACs.',
    color: '#f59e0b',
    committeeIds: [
      'C00819872', // Fairshake
      'C00835959', // Defend American Jobs
      'C00836155', // Protect Progress
      'C00805954', // Crypto Innovation PAC
    ],
    namePatterns: [
      'fairshake',
      'defend american jobs',
      'protect progress',
      'coinbase.*pac',
      'kraken.*pac',
      'ripple.*pac',
    ],
    employerPatterns: [
      'coinbase',
      'kraken',
      'ripple',
      'circle internet',
      'binance',
      'gemini trust',
      'andreessen horowitz',
      '\\ba16z\\b',
      'polygon labs',
      'consensys',
      'uniswap',
    ],
  },
  {
    id: 'labor',
    name: 'Organized Labor',
    description: 'Major labor unions and their political committees.',
    color: '#10b981',
    committeeIds: [
      'C00004036', // AFL-CIO COPE
      'C00004606', // SEIU COPE
      'C00010132', // AFSCME PEOPLE
      'C00026789', // UAW V-CAP
      'C00036214', // Teamsters DRIVE
      'C00010561', // NEA Fund for Children & Public Education
      'C00177436', // American Federation of Teachers (AFT) Committee on Political Education
      'C00345057', // IBEW PAC
    ],
    namePatterns: [
      'afl-cio',
      'afl cio',
      'seiu cope',
      'afscme pac',
      'afscme people',
      '\\buaw\\b',
      'teamsters drive',
      'national education association',
      'nea fund',
      'american federation of teachers',
      'aft committee',
      'carpenters legislative',
      'ibew pac',
      'ufcw active ballot',
      'machinists non-partisan',
    ],
    employerPatterns: [],
  },
];
