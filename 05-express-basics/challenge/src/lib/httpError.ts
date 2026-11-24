/**
 * An error that knows which HTTP response it should become.
 *
 * Throw (or `next()`) one of these from anywhere in a request and the
 * central error handler turns it into a consistent JSON response.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} not found`);

export const validationError = (message: string) =>
  new HttpError(400, "VALIDATION_ERROR", message);
