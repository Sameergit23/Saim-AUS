import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { createSmtpMailer, type SmtpOptions } from '../src/infra/smtpMailer.js';

const opts: SmtpOptions = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'apikey',
  pass: 'secret',
  from: 'Saim-AUS <no-reply@example.com>',
};

describe('smtpMailer', () => {
  it('sends verification and reset emails through the transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '1' });
    const mailer = createSmtpMailer(opts, { sendMail } as never);

    await mailer.sendVerificationEmail('user@example.com', 'https://x/verify?token=abc');
    await mailer.sendPasswordResetEmail('user@example.com', 'https://x/reset?token=def');

    expect(sendMail).toHaveBeenCalledTimes(2);
    const first = sendMail.mock.calls[0]![0];
    expect(first.to).toBe('user@example.com');
    expect(first.from).toBe(opts.from);
    expect(first.subject).toMatch(/verify/i);
    expect(first.html).toContain('https://x/verify?token=abc');
    expect(sendMail.mock.calls[1]![0].subject).toMatch(/reset/i);
  });

  it('builds a real transport (with auth) when none is injected', () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    const mailer = createSmtpMailer(opts);
    expect(typeof mailer.sendVerificationEmail).toBe('function');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: 'apikey', pass: 'secret' } }));
    spy.mockRestore();
  });

  it('omits auth when no user is provided', () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    createSmtpMailer({ ...opts, user: null, pass: null });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
    spy.mockRestore();
  });
});
