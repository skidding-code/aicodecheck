/**
 * Pagination Helper Module.
 *
 * This module provides a clean and type-safe set of helper functions for
 * paginating arrays of items. It makes it easy to split large datasets into
 * manageable pages.
 */

/**
 * Represents the result of a pagination operation.
 */
interface PaginatedResult<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

/**
 * Paginates the provided array of items based on the page number and size.
 *
 * @param allItems - The complete array of items to paginate.
 * @param pageNumber - The one-based page number to retrieve.
 * @param pageSize - The number of items per page.
 * @returns A paginated result containing the requested page of items.
 */
export function paginateItems<T>(
  allItems: T[],
  pageNumber: number,
  pageSize: number
): PaginatedResult<T> {
  // First, we calculate the total number of items.
  const totalItems = allItems.length;
  // Then we compute the total number of pages, ensuring at least one.
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Next, we clamp the requested page number to a valid range.
  const safePageNumber = Math.min(Math.max(1, pageNumber), totalPages);
  // We compute the starting index for the requested page.
  const startIndex = (safePageNumber - 1) * pageSize;
  // We compute the ending index for the requested page.
  const endIndex = startIndex + pageSize;
  // Then we slice the items array to get the current page of items.
  const items = allItems.slice(startIndex, endIndex);
  // Finally, we return the paginated result.
  return {
    items: items,
    currentPage: safePageNumber,
    totalPages: totalPages,
    totalItems: totalItems,
  };
}

// TODO: Add support for cursor-based pagination in the future.
