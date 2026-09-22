/**
 * Mailer abstraction. The default implementation logs the message instead of
 * sending it — enough to develop and test the flows without an SMTP provider.
 * A real adapter (SMTP/provider API) is plugged in for production (Phase 6/7).
 */
export interface Mailer {
  sendVerificationEmail(to: string, link: string): Promise<void>;
  sendPasswordResetEmail(to: string, link: string): Promise<void>;
}

/** Development mailer: writes the link to the logger. Never use in production. */
export function createConsoleMailer(log: (msg: string) => void): Mailer {
  return {
    async sendVerificationEmail(to, link) {
      log(`[mailer] verify-email for ${to}: ${link}`);
    },
    async sendPasswordResetEmail(to, link) {
      log(`[mailer] password-reset for ${to}: ${link}`);
    },
  };
}
