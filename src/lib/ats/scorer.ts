import Fuse from 'fuse.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'do', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'him', 'his',
  'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of',
  'on', 'or', 'our', 'out', 'she', 'so', 'than', 'that', 'the', 'their',
  'them', 'they', 'this', 'to', 'up', 'us', 'was', 'we', 'were', 'what',
  'when', 'who', 'will', 'with', 'would', 'you', 'your', 'also', 'all',
  'about', 'after', 'before', 'between', 'into', 'more', 'other', 'some',
  'such', 'than', 'then', 'there', 'these', 'those', 'through', 'under',
  'using', 'while', 'work', 'working', 'experience', 'years', 'year',
  'ability', 'strong', 'good', 'excellent', 'must', 'can', 'may', 'should',
  'well', 'highly', 'able', 'new', 'build', 'building', 'help', 'helping',
  'team', 'teams', 'company', 'role', 'position', 'job',
]);

// Simple stemmer — strips common suffixes
function stem(word: string): string {
  return word
    .replace(/ies$/, 'y')
    .replace(/ied$/, 'y')
    .replace(/ing$/, '')
    .replace(/tion$/, 't')
    .replace(/tions$/, 't')
    .replace(/ness$/, '')
    .replace(/ment$/, '')
    .replace(/ments$/, '')
    .replace(/ers?$/, '')
    .replace(/ing$/, '')
    .replace(/s$/, '');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function extractBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

export interface KeywordMatch {
  keyword: string;
  found: boolean;
  frequency: number;
  stemMatch?: boolean;
}

export interface ATSScoreResult {
  score: number;
  matched: KeywordMatch[];
  missing: KeywordMatch[];
  topMissing: string[];
  resumeKeywords: string[];
  jdKeywords: string[];
}

/**
 * Extract the same keyword list the scorer will check — use this to pre-seed the AI prompt
 * so the model embeds the exact terms that will be scored.
 */
export function extractJDKeywords(
  jobDescription: string,
  templateKeywords: string[] = []
): string[] {
  const jdTokens = tokenize(jobDescription);
  const jdBigrams = extractBigrams(jdTokens);
  const allJdTerms = [...jdTokens, ...jdBigrams];

  const jdFreq = new Map<string, number>();
  for (const term of allJdTerms) {
    jdFreq.set(term, (jdFreq.get(term) ?? 0) + 1);
  }

  return [
    ...new Set([
      ...Array.from(jdFreq.entries())
        .filter(([term, freq]) => freq >= 2 || jdBigrams.includes(term) || term.length > 6)
        .sort((a, b) => b[1] - a[1])
        .map(([term]) => term),
      ...templateKeywords.map(k => k.toLowerCase()),
    ]),
  ].filter(k => !STOP_WORDS.has(k)).slice(0, 60);
}

export function scoreResume(
  resumeText: string,
  jobDescription: string,
  templateKeywords: string[] = []
): ATSScoreResult {
  // Extract JD keywords with frequency
  const jdTokens = tokenize(jobDescription);
  const jdBigrams = extractBigrams(jdTokens);
  const allJdTerms = [...jdTokens, ...jdBigrams];

  const jdFreq = new Map<string, number>();
  for (const term of allJdTerms) {
    jdFreq.set(term, (jdFreq.get(term) ?? 0) + 1);
  }

  // Filter to meaningful keywords (freq >= 2 or in template keywords or bigrams)
  const importantJdKeywords = [
    ...new Set([
      ...Array.from(jdFreq.entries())
        .filter(([term, freq]) => freq >= 2 || jdBigrams.includes(term) || term.length > 6)
        .map(([term]) => term),
      ...templateKeywords.map(k => k.toLowerCase()),
    ]),
  ].filter(k => !STOP_WORDS.has(k)).slice(0, 60);

  // Extract resume text keywords
  const resumeTokens = tokenize(resumeText);
  const resumeBigrams = extractBigrams(resumeTokens);
  const allResumeTerms = new Set([...resumeTokens, ...resumeBigrams]);
  const resumeStemmed = new Set([...resumeTokens].map(stem));

  // Set up fuzzy matcher for close matches
  const resumeTermsArr = Array.from(allResumeTerms);
  const fuse = new Fuse(resumeTermsArr, { threshold: 0.3, includeScore: true });

  // Score each JD keyword
  const matches: KeywordMatch[] = [];
  const missing: KeywordMatch[] = [];

  for (const kw of importantJdKeywords) {
    const freq = jdFreq.get(kw) ?? 1;
    const exactMatch = allResumeTerms.has(kw);
    const stemMatchFound = !exactMatch && (resumeStemmed.has(stem(kw)) || resumeStemmed.has(kw));
    const fuseResults = !exactMatch && !stemMatchFound ? fuse.search(kw) : [];
    const fuzzyMatch = fuseResults.length > 0 && (fuseResults[0].score ?? 1) < 0.25;

    const found = exactMatch || stemMatchFound || fuzzyMatch;

    const result: KeywordMatch = {
      keyword: kw,
      found,
      frequency: freq,
      stemMatch: stemMatchFound || fuzzyMatch,
    };

    if (found) {
      matches.push(result);
    } else {
      missing.push(result);
    }
  }

  // Weight score by keyword frequency in JD
  const totalWeight = importantJdKeywords.reduce((sum, kw) => sum + (jdFreq.get(kw) ?? 1), 0);
  const matchedWeight = matches.reduce((sum, m) => sum + m.frequency, 0);
  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

  // Top missing: sort by frequency desc
  const topMissing = [...missing]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)
    .map(m => m.keyword);

  return {
    score,
    matched: matches,
    missing,
    topMissing,
    resumeKeywords: Array.from(allResumeTerms).slice(0, 50),
    jdKeywords: importantJdKeywords,
  };
}

export function resumeToText(resumeContent: string): string {
  try {
    const parsed = JSON.parse(resumeContent) as {
      sections?: {
        summary?: { content?: string };
        skills?: { categories?: Array<{ items?: string[] }> };
        experience?: Array<{ title?: string; company?: string; bullets?: string[] }>;
        education?: Array<{ degree?: string; institution?: string }>;
        certifications?: string[];
      };
    };
    const parts: string[] = [];

    if (parsed.sections?.summary?.content) {
      parts.push(parsed.sections.summary.content);
    }

    parsed.sections?.skills?.categories?.forEach(cat => {
      parts.push(cat.items?.join(' ') ?? '');
    });

    parsed.sections?.experience?.forEach(exp => {
      parts.push(`${exp.title ?? ''} ${exp.company ?? ''}`);
      exp.bullets?.forEach(b => parts.push(b));
    });

    parsed.sections?.education?.forEach(ed => {
      parts.push(`${ed.degree ?? ''} ${ed.institution ?? ''}`);
    });

    parsed.sections?.certifications?.forEach(c => parts.push(c));

    return parts.join(' ');
  } catch {
    return resumeContent;
  }
}
