import type { EmailMessage, EmailSender } from "../domain/ports.js";

/** Dev stand-in for an email provider: prints instead of sending. */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    await new Promise((r) => setTimeout(r, 200)); // providers are slow
    console.log(`📧 to=${message.to} subject="${message.subject}" key=${message.idempotencyKey}`);
  }
}
