/** Thrown from routes; formatted into the `{ error: { code, message, details? } }` envelope by onError. */
export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export const badRequest = (msg: string, code = 'bad_request', details?: unknown) =>
  new ApiHttpError(400, code, msg, details);
export const unauthorized = (msg = 'Unauthorized', code = 'unauthorized') => new ApiHttpError(401, code, msg);
export const forbidden = (msg: string, code = 'forbidden') => new ApiHttpError(403, code, msg);
export const notFound = (msg = 'Not found', code = 'not_found') => new ApiHttpError(404, code, msg);
export const conflict = (msg: string, code = 'conflict', details?: unknown) =>
  new ApiHttpError(409, code, msg, details);
