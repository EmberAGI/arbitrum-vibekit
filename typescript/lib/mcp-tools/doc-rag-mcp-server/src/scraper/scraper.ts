import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { PageContent, Heading, ScraperOptions } from './types.js';

export class DocumentationScraper {
  private browser: Browser | null = null;
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
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
      console.error('Puppeteer browser initialized');
    } catch (error) {
      console.error('Failed to initialize Puppeteer:', error);
      throw new Error(`Failed to initialize browser: ${(error as Error).message}`);
    }
  }

  async scrapePage(url: string): Promise<PageContent> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.browser.newPage();
    
    try {
      // Set user agent
      await page.setUserAgent(this.options.userAgent!);
      
      // Navigate to the page
      console.error(`Scraping: ${url}`);
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.options.timeout 
      });

      // Extract content based on selector
      // @ts-nocheck
      const content = await page.evaluate((selector: string) => {
        // Find the main content area
        const contentElement = document.querySelector(selector);
        if (!contentElement) {
          // Fallback to body if selector doesn't match
          const body = document.body;
          return {
            text: (body as any).innerText || '',
            html: body.innerHTML
          };
        }
        
        return {
          text: (contentElement as any).innerText || '',
          html: contentElement.innerHTML
        };
      }, this.options.selector);

      // Extract page metadata
      // @ts-ignore - This code runs in browser context where DOM APIs are available
      const metadata = await page.evaluate(() => {
        const title = document.title;
        
        // Extract all headings
        const headings: any[] = [];
        const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headingElements.forEach((heading: any) => {
          headings.push({
            level: heading.tagName.toLowerCase(),
            text: heading.innerText.trim()
          });
        });

        // Extract all links
        const links: string[] = [];
        const linkElements = document.querySelectorAll('a[href]');
        linkElements.forEach((link: any) => {
          const href = link.href;
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            links.push(href);
          }
        });

        return { title, headings, links };
      });

      return {
        url,
        title: metadata.title,
        text: content.text,
        headings: metadata.headings,
        links: metadata.links,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      throw new Error(`Failed to scrape ${url}: ${(error as Error).message}`);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.error('Puppeteer browser closed');
    }
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
      const excludedExtensions = ['.pdf', '.zip', '.tar', '.gz', '.exe', '.dmg'];
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