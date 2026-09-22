import nodemailer, { type Transporter } from 'nodemailer';
import type { Mailer } from './mailer.js';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

const verificationHtml = (link: string): string =>
  `<p>Welcome! Please verify your email address by clicking the link below:</p>
   <p><a href="${link}">Verify my email</a></p>
   <p>If the link doesn't work, paste this URL into your browser:<br>${link}</p>`;

const resetHtml = (link: string): string =>
  `<p>We received a request to reset your password. Click the link below to choose a new one:</p>
   <p><a href="${link}">Reset my password</a></p>
   <p>If you didn't request this, you can safely ignore this email.</p>
   <p>Link: ${link}</p>`;

/**
 * SMTP mailer (nodemailer) for real email delivery in production. Works with any
 * SMTP provider (SendGrid, Mailgun, Resend, SES, Gmail, …). A transporter can be
 * injected for testing; otherwise one is built from the options.
 */
export function createSmtpMailer(
  opts: SmtpOptions,
  transport: Transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: opts.user ? { user: opts.user, pass: opts.pass ?? '' } : undefined,
  }),
): Mailer {
  return {
    async sendVerificationEmail(to, link) {
      await transport.sendMail({
        from: opts.from,
        to,
        subject: 'Verify your email address',
        text: `Verify your email address: ${link}`,
        html: verificationHtml(link),
      });
    },
    async sendPasswordResetEmail(to, link) {
      await transport.sendMail({
        from: opts.from,
        to,
        subject: 'Reset your password',
        text: `Reset your password: ${link}`,
        html: resetHtml(link),
      });
    },
  };
}
