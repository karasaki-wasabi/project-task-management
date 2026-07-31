// Small typed HTTP error used by route/service layers to signal a status
// code. Fastify's default error handling (and our own setErrorHandler from
// task 1.5) both already respect a thrown error's `statusCode` property, so
// no extra wiring is needed for this to reach the client correctly.
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}
