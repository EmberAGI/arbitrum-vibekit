import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const normalizedTotalPages =
    Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1;

  if (normalizedTotalPages <= 1) {
    return null;
  }

  const clampedCurrentPage = Math.min(Math.max(currentPage, 1), normalizedTotalPages);
  const canGoPrevious = clampedCurrentPage > 1;
  const canGoNext = clampedCurrentPage < normalizedTotalPages;

  return (
    <div className="flex items-center justify-end gap-4 mt-5">
      <span className="text-[13px] text-gray-400">
        Page {clampedCurrentPage} of {normalizedTotalPages}
      </span>
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={!canGoPrevious}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => onPageChange(Math.max(1, clampedCurrentPage - 1))}
          disabled={!canGoPrevious}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => onPageChange(Math.min(normalizedTotalPages, clampedCurrentPage + 1))}
          disabled={!canGoNext}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={() => onPageChange(normalizedTotalPages)}
          disabled={!canGoNext}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Last page"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
