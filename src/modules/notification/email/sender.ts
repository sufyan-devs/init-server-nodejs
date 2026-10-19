import nodemailer from 'nodemailer';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';
import { identifierHash } from '@utils/redisKeys';

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
  const recipient = identifierHash(to);
  transporter
    .sendMail({
      from: envConfig.EMAIL.FROM,
      to,
      subject,
      html,
    })
    .then(() => {
      logger.info('Email sent', { recipient, type, subject });
    })
    .catch((error: unknown) => {
      logger.error('Failed to send email', {
        recipient,
        type,
        error: errorMessage(error),
      });
    });
};

export { sendEmail };
