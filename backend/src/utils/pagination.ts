export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const MAX_PER_PAGE = 100;

/**
 * Clamp client-supplied paging to sane bounds: page >= 1 and 1 <= perPage <= MAX_PER_PAGE.
 * Missing or non-numeric values fall back to the defaults.
 */
export function normalizePagination(
  page: number | undefined,
  perPage: number | undefined,
  defaultPerPage: number = 50
): { page: number; perPage: number } {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page as number)) : 1;
  const safePerPage = Number.isFinite(perPage)
    ? Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(perPage as number)))
    : defaultPerPage;
  return { page: safePage, perPage: safePerPage };
}

export function createPaginationResult<T>(
  data: T[],
  total: number,
  page: number = 1,
  perPage: number = 20
): PaginationResult<T> {
  const totalPages = Math.ceil(total / perPage);

  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export function getPaginationParams(
  page: number = 1,
  perPage: number = 20
): { skip: number; take: number } {
  const skip = (page - 1) * perPage;
  return { skip, take: perPage };
}
