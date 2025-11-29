import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import type { PageContent, Heading, ScraperOptions } from './types.js';

export class DocumentationScraper {
  private options: ScraperOptions;
  private baseUrl: URL;

  constructor(options: ScraperOptions) {
    this.options = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      timeout: 30000,
      rateLimit: 1000,
      ...options
    };
    this.baseUrl = new URL(options.baseUrl);
  }

  async initialize(): Promise<void> {
    // No initialization needed for Cheerio
    console.error('Cheerio scraper initialized');
  }

  private async fetchWithTimeout(url: string, timeoutMs: number = 30000): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.options.userAgent!,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractContent($: cheerio.CheerioAPI, selector: string): { text: string; html: string } {
    // Try the provided selector first
    let contentElement = $(selector);
    
    // Fallback selectors if primary fails
    if (!contentElement.length) {
      const fallbackSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.documentation', '.docs'];
      for (const fallback of fallbackSelectors) {
        contentElement = $(fallback);
        if (contentElement.length) break;
      }
    }
    
    // Last resort: use body
    if (!contentElement.length) {
      contentElement = $('body');
    }
    
    // Remove script and style tags
    contentElement.find('script, style, noscript').remove();
    
    // Remove navigation elements
    contentElement.find('nav, .nav, .navigation, .menu, .sidebar').remove();
    
    // Remove footer elements
    contentElement.find('footer, .footer').remove();
    
    return {
      text: contentElement.text().replace(/\s+/g, ' ').trim(),
      html: contentElement.html() || ''
    };
  }

  private extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links: Set<string> = new Set();
    const base = new URL(baseUrl);
    
    $('a[href]').each((_: number, element: any) => {
      const href = $(element).attr('href');
      if (!href) return;
      
      // Skip anchors, javascript, mailto, tel
      if (href.match(/^(#|javascript:|mailto:|tel:)/)) return;
      
      try {
        // Handle relative URLs
        const absoluteUrl = new URL(href, base).href;
        
        // Only include HTTP(S) links
        if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
          links.add(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    });
    
    return Array.from(links);
  }

  private extractHeadings($: cheerio.CheerioAPI): Heading[] {
    const headings: Heading[] = [];
    
    $('h1, h2, h3, h4, h5, h6').each((_: number, element: any) => {
      const $el = $(element);
      const text = $el.text().trim();
      
      if (text) {
        headings.push({
          level: element.tagName.toLowerCase() as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
          text: text
        });
      }
    });
    
    return headings;
  }

  async scrapePage(url: string): Promise<PageContent> {
    try {
      console.error(`Scraping: ${url}`);
      
      // Fetch HTML with timeout
      const html = await this.fetchWithTimeout(url, this.options.timeout);
      
      // Load into Cheerio
      const $ = cheerio.load(html);
      
      // Extract title
      const title = $('title').text().trim() || 
                    $('h1').first().text().trim() || 
                    'Untitled';
      
      // Extract content
      const content = this.extractContent($, this.options.selector);
      
      // Extract metadata
      const headings = this.extractHeadings($);
      const links = this.extractLinks($, url);
      
      return {
        url,
        title,
        text: content.text,
        headings,
        links,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      throw new Error(`Failed to scrape ${url}: ${(error as Error).message}`);
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for Cheerio
    console.error('Cheerio scraper closed');
  }

  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Check if it's the same origin
      if (parsed.origin !== this.baseUrl.origin) {
        return false;
      }
      
      // Check if it starts with the base path
      if (!parsed.pathname.startsWith(this.baseUrl.pathname)) {
        return false;
      }
      
      // Exclude certain file types
      const excludedExtensions = ['.pdf', '.zip', '.tar', '.gz', '.exe', '.dmg', '.jpg', '.png', '.gif', '.svg'];
      const lowercaseUrl = url.toLowerCase();
      if (excludedExtensions.some(ext => lowercaseUrl.endsWith(ext))) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl.href;
  }
}