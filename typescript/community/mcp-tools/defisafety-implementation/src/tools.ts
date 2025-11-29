import { z } from "zod";

// Schema for index_documentation tool
export const IndexDocumentationSchema = z.object({
  baseUrl: z.string().url().describe("Base URL to scrape (will not go beyond this domain/path)"),
  maxPages: z.number().int().positive().default(250).describe("Maximum pages to scrape"),
  selector: z.string().default("main, article, .content, .documentation").describe("CSS selector for main content")
});

// Schema for query_documentation tool
export const QueryDocumentationSchema = z.object({
  query: z.string().min(1).describe("Natural language query"),
  topK: z.number().int().positive().default(5).describe("Number of relevant chunks to retrieve")
});

// Schema for clear_index tool
export const ClearIndexSchema = z.object({});

// Schema for list_indexed_urls tool
export const ListIndexedUrlsSchema = z.object({});

// Schema for evaluate_defisafety_criteria tool
export const EvaluateDefiSafetySchema = z.object({
  projectName: z.string().describe("Name of the project being evaluated"),
  baseUrl: z.string().url().describe("Base URL of the documentation to scrape and evaluate"),
  maxPages: z.number().int().positive().default(250).describe("Maximum pages to scrape")
}); 