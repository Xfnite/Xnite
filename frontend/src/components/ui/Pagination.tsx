import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Calculate range of page numbers to show
  // We want to show something like: 1 2 3 ... 90
  const renderPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages + 2) {
      // If total pages is small enough, show all
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      // Calculate start and end of visible middle pages
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        endPage = Math.min(totalPages - 1, maxVisiblePages);
      } else if (currentPage >= totalPages - 2) {
        startPage = Math.max(2, totalPages - maxVisiblePages + 1);
      }

      if (startPage > 2) {
        pages.push("...");
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages - 1) {
        pages.push("...");
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages.map((page, index) => {
      if (page === "...") {
        return (
          <span
            key={`ellipsis-${index}`}
            className="px-3 py-2 text-sm font-medium text-[#2F3E46]/60 dark:text-white/40"
          >
            .....
          </span>
        );
      }

      const isCurrentPage = page === currentPage;

      return (
        <button
          key={`page-${page}`}
          onClick={() => onPageChange(page as number)}
          className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
            isCurrentPage
              ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#0D1B2A] shadow-md"
              : "text-[#2F3E46] bg-black/5 hover:bg-black/10 dark:text-[#E0E1DD] dark:bg-white/5 dark:hover:bg-white/10"
          }`}
        >
          {page}
        </button>
      );
    });
  };

  return (
    <div className="flex items-center justify-center gap-1.5 py-6">
      <button
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg text-[#2F3E46] bg-black/5 hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed dark:text-[#E0E1DD] dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
        aria-label="First page"
      >
        <ChevronsLeft className="w-4 h-4" />
      </button>

      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg text-[#2F3E46] bg-black/5 hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed dark:text-[#E0E1DD] dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1.5 mx-2">
        {renderPageNumbers()}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg text-[#2F3E46] bg-black/5 hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed dark:text-[#E0E1DD] dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <button
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg text-[#2F3E46] bg-black/5 hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed dark:text-[#E0E1DD] dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Last page"
      >
        <ChevronsRight className="w-4 h-4" />
      </button>
    </div>
  );
}
