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

export function unauthorized(message: string): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message: string): HttpError {
  return new HttpError(403, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}
