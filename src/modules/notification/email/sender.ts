import nodemailer from 'nodemailer';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  type?: string;
}

const transporter = nodemailer.createTransport({
  host: envConfig.EMAIL.HOST,
  port: envConfig.EMAIL.PORT,
  secure: envConfig.EMAIL.SECURE,
  auth: {
    user: envConfig.EMAIL.USER,
    pass: envConfig.EMAIL.PASSWORD,
  },
});

const sendEmail = ({ to, subject, html, type = 'email' }: SendEmailOptions): void => {
  transporter
    .sendMail({
      from: envConfig.EMAIL.FROM,
      to,
      subject,
      html,
    })
    .then(() => {
      logger.info('Email sent', { to, type, subject });
    })
    .catch((error: Error) => {
      logger.error('Failed to send email', {
        to,
        type,
        error: error.message,
      });
    });
};

export { sendEmail };
