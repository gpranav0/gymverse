const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Development stand-in for a mailbox. Reset and verification links are credentials, so
// they are written here (gitignored) rather than to the console, where logs keep them.
const OUTBOX = path.resolve(__dirname, '../../.mail-outbox');

let transport = null;
const smtpConfigured = () => !!process.env.SMTP_HOST;

const getTransport = () => {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
};

/** Public URL of the frontend, for links in emails. */
const appUrl = (route) => `${(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '')}${route}`;

/**
 * Sends an email. Never throws for delivery problems — callers are auth flows that must
 * give the same answer whether or not mail went out. Returns { delivered, via }.
 */
async function sendMail({ to, subject, text }) {
  const from = process.env.MAIL_FROM || 'GymVerse <no-reply@gymverse.local>';

  if (smtpConfigured()) {
    try {
      await getTransport().sendMail({ from, to, subject, text });
      return { delivered: true, via: 'smtp' };
    } catch (error) {
      // The SMTP error can include the server's reply, but not the recipient's token.
      console.error(`Email to ${to} failed: ${error.message}`);
      return { delivered: false, via: 'smtp' };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('Email not sent: SMTP is not configured. Set SMTP_HOST (see DEPLOYMENT.md).');
    return { delivered: false, via: 'none' };
  }

  fs.mkdirSync(OUTBOX, { recursive: true });
  const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(OUTBOX, `${Date.now()}-${slug}.txt`);
  fs.writeFileSync(file, `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
  console.log(`Email to ${to} written to the local outbox (SMTP not configured): ${path.basename(file)}`);
  return { delivered: true, via: 'outbox', file };
}

const passwordResetEmail = (to, link) => sendMail({
  to,
  subject: 'Reset your GymVerse password',
  text: [
    'Someone asked to reset the password for your GymVerse account.',
    '',
    'Choose a new password here (the link works once, for 30 minutes):',
    link,
    '',
    'If this was not you, ignore this email. Your password will not change.',
  ].join('\n'),
});

const verificationEmail = (to, name, link) => sendMail({
  to,
  subject: 'Confirm your GymVerse email address',
  text: [
    `Welcome to GymVerse${name ? `, ${name}` : ''}!`,
    '',
    'Confirm your email address here (the link works for 24 hours):',
    link,
  ].join('\n'),
});

module.exports = { passwordResetEmail, verificationEmail, appUrl };
