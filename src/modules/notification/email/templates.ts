import { envConfig } from '@config/env';

interface EmailResult {
  subject: string;
  html: string;
}

interface OtpTemplateParams {
  firstName?: string;
  otpCode: string;
}

interface RedemptionDetailsParams {
  couponTitle: string;
  couponCode: string;
  redeemedQty: number;
  redeemedAt: string;
  orderReference?: string | null;
  customerName?: string;
  vendorName?: string;
  isVendor?: boolean;
}

interface VendorRedemptionParams {
  firstName?: string;
  couponTitle: string;
  couponCode: string;
  redeemedQty: number;
  redeemedAt: string;
  orderReference?: string | null;
  customerName: string;
}

interface CustomerRedemptionParams {
  firstName?: string;
  couponTitle: string;
  couponCode: string;
  redeemedQty: number;
  redeemedAt: string;
  orderReference?: string | null;
  vendorName: string;
}

interface WelcomeCredentialsParams {
  firstName?: string;
  email: string;
  password: string;
  role: string;
}

const currentYear = (): number => new Date().getFullYear();

const brand = envConfig.APP_NAME;

// A broken image is worse branding than no image.
const header = (): string => `
    <tr>
        <td style="padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
            ${envConfig.APP_LOGO_URL
              ? `<img src="${envConfig.APP_LOGO_URL}" alt="${brand}" style="max-width: 250px; height: auto; background-color:white; border-radius:10px;">`
              : `<h1 style="margin: 0; font-size: 28px; color: hsl(278, 66%, 39%);">${brand}</h1>`}
        </td>
    </tr>`;

const footer = (): string => `
    <tr>
        <td style="padding: 20px 30px; background-color: #f0f0f0; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666666;">Thank you for using ${brand}</p>
            <p style="margin: 0; font-size: 12px; color: #999999;">&copy; ${currentYear()} ${brand}. All rights reserved.</p>
            <p style="margin: 10px 0 0 0; font-size: 12px;">
                <a href="#" style="color: hsl(278, 66%, 39%); text-decoration: none;">Terms of Service</a> |
                <a href="#" style="color: hsl(278, 66%, 39%); text-decoration: none;">Privacy Policy</a>
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
    <title>${title}</title>
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

const couponOtp = ({ firstName, otpCode }: OtpTemplateParams): EmailResult => ({
  subject: "Coupon Redemption OTP",
  html: layout(
    "Coupon Redemption OTP",
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: hsl(278, 66%, 39%); text-align: center;">Coupon Redemption Code</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${firstName || "Customer"},</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">A vendor is requesting to redeem your coupon. Your One-Time Password (OTP) is:</p>
            <div style="background-color: #f0f0f0; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: hsl(278, 66%, 39%);">${otpCode}</span>
            </div>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">This code is valid for the next ${envConfig.COUPON_REDEEM.OTP_EXPIRY_MINUTES} minutes. Please do not share this code with anyone unless you are at the vendor's location.</p>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">If you did not request this, please ignore this email or contact our support team.</p>
        </td>
    </tr>
    ${securityNotice()}`,
  ),
});

// email verification OTP after signup
const emailVerificationOtp = ({ firstName, otpCode }: OtpTemplateParams): EmailResult => ({
  subject: "Verify Your Email",
  html: layout(
    "Email Verification",
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: hsl(278, 66%, 39%); text-align: center;">Verify Your Email</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${firstName || "User"},</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Welcome to ${brand}! Please verify your email address using the code below:</p>
            <div style="background-color: #f0f0f0; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: hsl(278, 66%, 39%);">${otpCode}</span>
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
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: hsl(278, 66%, 39%); text-align: center;">Password Reset Code</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${firstName || "User"},</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">You (or someone pretending to be you) requested a password reset. Your one-time code is:</p>
            <div style="background-color: #f0f0f0; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: hsl(278, 66%, 39%);">${otpCode}</span>
            </div>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">This code will expire in ${envConfig.PASSWORD_RESET.SESSION_EXPIRY_MINUTES} minutes. Do not share it with anyone.</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">If you did not request this, please ignore this message.</p>
        </td>
    </tr>
    ${securityNotice()}`
  ),
});

const redemptionDetailsTable = ({
  couponTitle,
  couponCode,
  redeemedQty,
  redeemedAt,
  orderReference,
  customerName,
  vendorName,
  isVendor,
}: RedemptionDetailsParams): string => `
            <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Coupon</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: 600; text-align: right;">${couponTitle}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Code</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; font-family: monospace; text-align: right;">${couponCode}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Quantity</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: 600; text-align: right;">${redeemedQty}</td>
                </tr>
                ${
                  isVendor
                    ? `<tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Customer</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: 600; text-align: right;">${customerName}</td>
                </tr>`
                    : `<tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Redeemed By</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; font-weight: 600; text-align: right;">${vendorName}</td>
                </tr>`
                }
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Redeemed At</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; text-align: right;">${redeemedAt}</td>
                </tr>
                ${
                  orderReference
                    ? `<tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">Order Reference</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; text-align: right;">${orderReference}</td>
                </tr>`
                    : ""
                }
            </table>`;

const vendorRedemptionConfirmation = ({
  firstName,
  couponTitle,
  couponCode,
  redeemedQty,
  redeemedAt,
  orderReference,
  customerName,
}: VendorRedemptionParams): EmailResult => ({
  subject: `Coupon Redeemed — ${couponCode} by ${customerName}`,
  html: layout(
    "Coupon Redeemed",
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: hsl(278, 66%, 39%); text-align: center;">Coupon Redeemed at Your Store</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${firstName || "Vendor"},</p>
            <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.5; text-align: center;"><strong>${customerName}</strong> has redeemed <strong>${redeemedQty}</strong> unit(s) of your coupon <strong>${couponTitle}</strong> (${couponCode}).</p>
            ${redemptionDetailsTable({ couponTitle, couponCode, redeemedQty, redeemedAt, orderReference, customerName, isVendor: true })}
            <p style="margin: 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">You can view all redemptions in your vendor dashboard.</p>
        </td>
    </tr>`,
  ),
});

const customerRedemptionConfirmation = ({
  firstName,
  couponTitle,
  couponCode,
  redeemedQty,
  redeemedAt,
  orderReference,
  vendorName,
}: CustomerRedemptionParams): EmailResult => ({
  subject: `Your Coupon Used — ${couponTitle}`,
  html: layout(
    "Coupon Used",
    `<tr>
        <td style="padding: 40px 30px;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px; color: hsl(278, 66%, 39%); text-align: center;">Your Coupon Has Been Used</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; text-align: center;">Hi ${firstName || "Customer"},</p>
            <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.5; text-align: center;">Your coupon <strong>${couponTitle}</strong> (${couponCode}) has been successfully redeemed by <strong>${vendorName}</strong>. <strong>${redeemedQty}</strong> unit(s) were used.</p>
            ${redemptionDetailsTable({ couponTitle, couponCode, redeemedQty, redeemedAt, orderReference, vendorName, isVendor: false })}
            <p style="margin: 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">You can view your remaining coupons in your account under My Coupons.</p>
        </td>
    </tr>`,
  ),
});

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

export {
  couponOtp,
  emailVerificationOtp,
  passwordResetOtp,
  vendorRedemptionConfirmation,
  customerRedemptionConfirmation,
  welcomeCredentials,
};
