import { DocumentationScraper } from './scraper.js';
import type { PageContent, ScraperOptions, ScrapingProgress, ScrapingError } from './types.js';

export class DocumentationCrawler {
  private scraper: DocumentationScraper;
  private options: ScraperOptions;
  private visited = new Set<string>();
  private queue: string[] = [];
  private scraped: PageContent[] = [];
  private errors: ScrapingError[] = [];

  constructor(options: ScraperOptions) {
    this.options = options;
    this.scraper = new DocumentationScraper(options);
  }

  async crawl(progressCallback?: (progress: ScrapingProgress) => void): Promise<{
    pages: PageContent[];
    errors: ScrapingError[];
  }> {
    try {
      // Initialize the scraper
      await this.scraper.initialize();
      
      // Start with the base URL
      this.queue.push(this.options.baseUrl);
      
      while (this.queue.length > 0 && this.scraped.length < this.options.maxPages) {
        const url = this.queue.shift()!;
        
        // Skip if already visited
        if (this.visited.has(url)) {
          continue;
        }
        
        // Mark as visited
        this.visited.add(url);
        
        try {
          // Report progress
          if (progressCallback) {
            progressCallback({
              totalPages: this.options.maxPages,
              scrapedPages: this.scraped.length,
              currentUrl: url,
              errors: this.errors
            });
          }
          
          // Scrape the page
          const pageContent = await this.scraper.scrapePage(url);
          this.scraped.push(pageContent);
          
          // Extract and queue valid links
          const validLinks = pageContent.links
            .filter(link => this.scraper.isValidUrl(link))
            .filter(link => !this.visited.has(link));
          
          // Add unique links to queue
          const uniqueLinks = [...new Set(validLinks)];
          this.queue.push(...uniqueLinks);
          
          // Rate limiting
          if (this.options.rateLimit && this.queue.length > 0) {
            await this.delay(this.options.rateLimit);
          }
          
        } catch (error) {
          console.error(`Failed to scrape ${url}:`, error);
          this.errors.push({
            url,
            error: (error as Error).message,
            timestamp: Date.now()
          });
        }
      }
      
      return {
        pages: this.scraped,
        errors: this.errors
      };
      
    } finally {
      // Always close the browser
      await this.scraper.close();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getVisitedUrls(): string[] {
    return Array.from(this.visited);
  }

  getQueuedUrls(): string[] {
    return [...this.queue];
  }
} 