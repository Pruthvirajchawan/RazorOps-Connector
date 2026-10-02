export type ErrorCode =
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'SSRF_DETECTED'
  | 'UNKNOWN_ERROR';

export interface ConnectorErrorDetails {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  retryAfterSeconds?: number;
  attemptsMade?: number;
  upstreamUrl?: string;
  remedy?: string;
}

export class ConnectorError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryAfterSeconds?: number;
  public readonly attemptsMade?: number;
  public readonly upstreamUrl?: string;
  public readonly remedy?: string;

  constructor(details: ConnectorErrorDetails) {
    super(details.message);
    this.name = 'ConnectorError';
    this.code = details.code;
    this.statusCode = details.statusCode || 500;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.attemptsMade = details.attemptsMade;
    this.upstreamUrl = details.upstreamUrl;
    this.remedy = details.remedy;
    Object.setPrototypeOf(this, ConnectorError.prototype);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryAfterSeconds: this.retryAfterSeconds,
      attemptsMade: this.attemptsMade,
      remedy: this.remedy,
    };
  }
}
