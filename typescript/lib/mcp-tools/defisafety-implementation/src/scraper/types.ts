export interface PageContent {
  url: string;
  title: string;
  text: string;
  headings: Heading[];
  links: string[];
  timestamp: number;
}

export interface Heading {
  level: string;  // h1, h2, h3, etc.
  text: string;
}

export interface ScraperOptions {
  baseUrl: string;
  maxPages: number;
  selector: string;
  userAgent?: string;
  timeout?: number;
  rateLimit?: number; // milliseconds between requests
}

export interface ScrapingProgress {
  totalPages: number;
  scrapedPages: number;
  currentUrl: string;
  errors: ScrapingError[];
}

export interface ScrapingError {
  url: string;
  error: string;
  timestamp: number;
} 