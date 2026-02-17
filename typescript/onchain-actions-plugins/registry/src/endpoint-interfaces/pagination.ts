import { z } from 'zod';

export const PaginatedPossibleResultsRequestSchema = z.object({
  cursor: z.string().optional().describe('Pagination cursor for cached results'),
  page: z.number().int().positive().optional().describe('Page number to retrieve (defaults to 1)'),
});
export type PaginatedPossibleResultsRequest = z.infer<
  typeof PaginatedPossibleResultsRequestSchema
>;

export const PaginatedPossibleResultsResponseSchema = z.object({
  cursor: z.string().describe('Pagination cursor for retrieving next/previous pages'),
  currentPage: z.number().int().describe('Current page number'),
  totalPages: z.number().int().describe('Total number of pages'),
  totalItems: z.number().int().describe('Total number of items across all pages'),
});
export type PaginatedPossibleResultsResponse = z.infer<
  typeof PaginatedPossibleResultsResponseSchema
>;
