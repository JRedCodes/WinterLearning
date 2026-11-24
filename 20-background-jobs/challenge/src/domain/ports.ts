/**
 * Ports: what the job processors need from the outside world. The real
 * implementations (an email provider's API, an image service) live behind
 * these interfaces; tests pass fakes that fail on demand.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  /**
   * Many email/payment providers accept an idempotency key and drop
   * duplicates on their side. Always pass one when the API supports it.
   */
  idempotencyKey: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface Thumbnailer {
  /** Downloads the image, resizes it, stores it; returns the thumbnail's URL. */
  createThumbnail(imageUrl: string): Promise<string>;
}
