import { envConfig } from '@config/env';
import { escapeHtml } from '@utils/format';

interface EmailResult {
  subject: string;
  html: string;
}

interface OtpTemplateParams {
  firstName?: string;
  otpCode: string;
}

const currentYear = (): number => new Date().getFullYear();

const BRAND_COLOR = 'hsl(278, 66%, 39%)';

const brand = escapeHtml(envConfig.APP_NAME);

// A broken image is worse branding than no image.
const header = (): string => `
    <tr>
        <td style="padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
            ${envConfig.APP_LOGO_URL
              ? `<img src="${escapeHtml(envConfig.APP_LOGO_URL)}" alt="${brand}" style="max-width: 250px; height: auto; background-color:white; border-radius:10px;">`
              : `<h1 style="margin: 0; font-size: 28px; color: ${BRAND_COLOR};">${brand}</h1>`}
        </td>
    </tr>`;

const footer = (): string => `
    <tr>
        <td style="padding: 20px 30px; background-color: #f0f0f0; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666666;">Thank you for using ${brand}</p>
            <p style="margin: 0; font-size: 12px; color: #999999;">&copy; ${currentYear()} ${brand}. All rights reserved.</p>
            <p style="margin: 10px 0 0 0; font-size: 12px;">
                <a href="#" style="color: ${BRAND_COLOR}; text-decoration: none;">Terms of Service</a> |
                <a href="#" style="color: ${BRAND_COLOR}; text-decoration: none;">Privacy Policy</a>
            </p>
        </td>
    </tr>`;

const securityNotice = (): string => `
    <tr>
        <td style="padding: 0 30px 30px 30px;">
            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9f9f9; border-radius: 4px;">
                <tr>
                    <td style="padding: 20px; text-align: center;">
                        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #666666;">For your security, never share your OTP with anyone, including ${brand} staff.</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>`;

const layout = (title: string, content: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4; color: #171717;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    ${header()}
                    ${content}
                    ${footer()}
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

// email verification OTP after signup
const emailVerificationOtp = ({ firstName, otpCode }: OtpTemplateParams): EmailResult => ({
  subject: "Verify Your Email",
  html: layout(
    "Email Verification",
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${BRAND_COLOR}; text-align: center;">Verify Your Email</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${escapeHtml(firstName || "User")},</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Welcome to ${brand}! Please verify your email address using the code below:</p>
            <div style="background-color: #f0f0f0; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: ${BRAND_COLOR};">${escapeHtml(otpCode)}</span>
            </div>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">This code expires in ${envConfig.OTP.EXPIRY_MINUTES} minutes. Do not share it with anyone.</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">If you did not create an account, please ignore this message.</p>
        </td>
    </tr>
    ${securityNotice()}`
  ),
});

// password reset OTP email
const passwordResetOtp = ({ firstName, otpCode }: OtpTemplateParams): EmailResult => ({
  subject: "Password Reset Code",
  html: layout(
    "Password Reset Code",
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${BRAND_COLOR}; text-align: center;">Password Reset Code</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${escapeHtml(firstName || "User")},</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">You (or someone pretending to be you) requested a password reset. Your one-time code is:</p>
            <div style="background-color: #f0f0f0; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: ${BRAND_COLOR};">${escapeHtml(otpCode)}</span>
            </div>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">This code will expire in ${envConfig.OTP.EXPIRY_MINUTES} minutes. Do not share it with anyone.</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">If you did not request this, please ignore this message.</p>
        </td>
    </tr>
    ${securityNotice()}`
  ),
});

export type { EmailResult };

export {
  emailVerificationOtp,
  passwordResetOtp,
  layout,
  securityNotice,
  BRAND_COLOR,
};
