import { layout, securityNotice } from '@notification/index';
import type { EmailResult } from '@notification/index';
import { COUPON_REDEEM } from '@coupon/config';

interface CouponOtpParams {
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

const couponOtp = ({ firstName, otpCode }: CouponOtpParams): EmailResult => ({
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
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">This code is valid for the next ${COUPON_REDEEM.OTP_EXPIRY_MINUTES} minutes. Please do not share this code with anyone unless you are at the vendor's location.</p>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; text-align: center; color: #666666;">If you did not request this, please ignore this email or contact our support team.</p>
        </td>
    </tr>
    ${securityNotice()}`,
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

export {
  couponOtp,
  vendorRedemptionConfirmation,
  customerRedemptionConfirmation,
};
