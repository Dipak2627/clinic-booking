/**
 * Error carrying an HTTP status and a stable machine-readable code.
 * The error-handling middleware turns it into:
 *   { "error": { "code": "...", "message": "...", "details": [...] } }
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const forbidden = (code, message) => new AppError(403, code, message);
export const notFound = (code, message) => new AppError(404, code, message);
export const conflict = (code, message) => new AppError(409, code, message);
export const unprocessable = (code, message) => new AppError(422, code, message);
