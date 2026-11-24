/** Port for sending email. Production would wrap SES/SendGrid/etc.; tests use a fake. */
export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** Rejects if the email could not be sent (the caller decides whether to retry). */
  send(email: Email): Promise<void>;
}

/** Development adapter: prints instead of sending. */
export const consoleEmailSender: EmailSender = {
  async send(email) {
    console.log(`[email] to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`);
  },
};
