// Email sender for the forgot-password + invitation flows. If SMTP_* is set it
// sends via nodemailer; otherwise it logs the link to the console (demo mode)
// and the route additionally returns a demo token so the flow works offline.
const env = require('../config/env');

const smtpConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = () => {
  // Lazily required so the server runs without nodemailer installed in demo mode.
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
};

const sendLink = async (toEmail, subject, intro, url) => {
  if (!smtpConfigured()) {
    console.log(`[mailer] SMTP not configured — ${subject} for ${toEmail}:`);
    console.log(`[mailer]   ${url}`);
    return { sent: false, url };
  }
  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject,
    text: `${intro}\n\n${url}\n`,
  });
  return { sent: true };
};

const sendResetEmail = (toEmail, token) =>
  sendLink(
    toEmail,
    'Reset your Leave Management System password',
    'We received a request to reset your password. Open this link (valid 30 minutes):',
    `${env.CLIENT_URL}/login?resetToken=${token}`
  );

const sendInviteEmail = (toEmail, token) =>
  sendLink(
    toEmail,
    'You are invited to the Leave Management System',
    'Complete your registration (link valid 48 hours):',
    `${env.CLIENT_URL}/register?inviteToken=${token}`
  );

module.exports = { smtpConfigured, sendResetEmail, sendInviteEmail };
