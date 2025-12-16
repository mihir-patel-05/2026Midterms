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
