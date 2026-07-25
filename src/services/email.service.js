import nodemailer from 'nodemailer';
import config from '../config/index.js';

const isSmtpConfigured = () => {
  const user = config.smtp.user;
  const pass = config.smtp.pass;
  if (!user || !pass) return false;
  if (user === 'your_email@gmail.com' || pass === 'your_app_password') return false;
  return true;
};

const createTransporter = () => {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: false,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
};

export const sendOTPEmail = async (email, code, purpose = 'verification') => {
  const subjectMap = {
    signup: 'Verify your ChatApp account',
    forgot_password: 'Reset your ChatApp password',
    resend: 'Your ChatApp OTP code',
    verification: 'Your ChatApp OTP code',
  };

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0e1621;color:#fff;border-radius:12px;">
      <h2 style="margin:0 0 12px;color:#2AABEE;">ChatApp</h2>
      <p style="color:#c5d0dc;">Your OTP for ${purpose.replace('_', ' ')} is:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:16px 0;color:#fff;">${code}</p>
      <p style="color:#8b9aab;font-size:13px;">This code expires in 5 minutes. Do not share it with anyone.</p>
    </div>
  `;

  const transporter = createTransporter();

  if (!transporter) {
    console.log(`[DEV OTP] ${email} => ${code} (${purpose})`);
    return { devMode: true, code };
  }

  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to: email,
      subject: subjectMap[purpose] || subjectMap.verification,
      html,
    });
    return { sent: true };
  } catch (error) {
    console.warn('[SMTP failed, falling back to DEV OTP]', error.message);
    console.log(`[DEV OTP] ${email} => ${code} (${purpose})`);
    return { devMode: true, code };
  }
};
