import { envConfig } from '@config/env';
import { layout } from '@notification/index';
import type { EmailResult } from '@notification/index';

interface WelcomeCredentialsParams {
  firstName?: string;
  email: string;
  password: string;
  role: string;
}

const brand = envConfig.APP_NAME;

const welcomeCredentials = ({ firstName, email, password, role }: WelcomeCredentialsParams): EmailResult => ({
  subject: `Welcome to ${brand} — Your Account Details`,
  html: layout(
    `Welcome to ${brand}`,
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: hsl(278, 66%, 39%); text-align: center;">Welcome to ${brand}!</h2>
            <p style="margin: 0 0 10px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${firstName || "there"},</p>
            <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.5; text-align: center;">An administrator has created a <strong>${role}</strong> account for you on ${brand}. Here are your login credentials:</p>
            <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666; background-color: #f9f9f9;">Email</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: 600; text-align: right;">${email}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 16px; font-size: 14px; color: #666; background-color: #f9f9f9;">Password</td>
                    <td style="padding: 12px 16px; font-size: 14px; font-family: monospace; letter-spacing: 2px; text-align: right;">${password}</td>
                </tr>
            </table>
            <p style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #d32f2f; font-weight: 600;">Please log in and change your password immediately.</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.5; text-align: center; color: #999999;">If you did not expect this account, please contact our support team.</p>
        </td>
    </tr>`,
  ),
});

export { welcomeCredentials };
