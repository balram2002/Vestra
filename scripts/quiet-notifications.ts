/**
 * Keep a script's notifications on this machine.
 *
 * Imported FIRST by scripts that drive the real services over generated data,
 * so it runs before any module reads its configuration. Those services notify
 * people as they work (a settlement run emails every seller it pays), and a
 * seed must never send mail or texts through the real providers to the
 * addresses it makes up: they bounce, and bounces cost the sending account its
 * reputation. It also used to keep the seed from exiting, because the pooled
 * SMTP connection held the process open after the last write.
 *
 * With no SMTP host, mail is printed and written to the outbox instead.
 */

process.env.SMTP_HOST = '';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';

export {};
