export type ApiErrorCode =
  | 'TMDB_KEY_MISSING'
  | 'TMDB_KEY_INVALID'
  | 'TMDB_UNREACHABLE'
  | 'TMDB_RATE_LIMITED'
  | 'TMDB_ERROR'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'NETWORK'
  | 'INTERNAL';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}
