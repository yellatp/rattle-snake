export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
}

const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

export async function scrapeLinkedInJob(url: string): Promise<ScrapedJob> {
  // Validate URL
  if (!url.includes('linkedin.com/jobs')) {
    throw new Error('Please provide a valid LinkedIn job URL');
  }

  let html = '';
  let lastError: Error = new Error('Failed to fetch job listing');

  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('Network error');
    }
  }

  if (!html) throw lastError;

  return parseLinkedInHTML(html, url);
}

function parseLinkedInHTML(html: string, url: string): ScrapedJob {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try multiple selectors as LinkedIn changes their DOM frequently
  const title = (
    doc.querySelector('h1.top-card-layout__title')?.textContent ??
    doc.querySelector('h1.job-details-jobs-unified-top-card__job-title')?.textContent ??
    doc.querySelector('h1[class*="title"]')?.textContent ??
    doc.querySelector('h1')?.textContent ??
    ''
  ).trim();

  const company = (
    doc.querySelector('a.topcard__org-name-link')?.textContent ??
    doc.querySelector('[class*="company-name"]')?.textContent ??
    doc.querySelector('a[data-tracking-control-name*="company"]')?.textContent ??
    ''
  ).trim();

  const location = (
    doc.querySelector('.topcard__flavor--bullet')?.textContent ??
    doc.querySelector('[class*="location"]')?.textContent ??
    ''
  ).trim();

  const description = (
    doc.querySelector('#job-details')?.textContent ??
    doc.querySelector('.description__text')?.textContent ??
    doc.querySelector('[class*="job-description"]')?.textContent ??
    doc.querySelector('[class*="description"]')?.textContent ??
    ''
  ).trim();

  if (!title && !description) {
    throw new Error('Could not parse job listing. Try pasting the job description manually.');
  }

  return { title, company, location, description: cleanText(description), url };
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
