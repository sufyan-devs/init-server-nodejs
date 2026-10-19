import mongoose from 'mongoose';

export interface DateRange {
  startOfDay: Date;
  endOfDay: Date;
}

export const getDecimal = (v: mongoose.Types.Decimal128 | null | undefined): number | null | undefined =>
  v != null ? parseFloat(v.toString()) : v;

export const priceField = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: mongoose.Schema.Types.Decimal128,
  get: getDecimal,
  ...overrides,
});

export const couponDecimalFields: Record<string, unknown> = {
  $addFields: {
    "discount.value": { $toDouble: "$discount.value" },
    minimumOrderValue: { $toDouble: "$minimumOrderValue" },
    sellingPrice: { $toDouble: "$sellingPrice" },
  },
};

export const purchaseDecimalFields: Record<string, unknown> = {
  $addFields: {
    unitPrice: { $toDouble: "$unitPrice" },
    totalAmount: { $toDouble: "$totalAmount" },
    "snapshot.discount.value": { $toDouble: "$snapshot.discount.value" },
    "snapshot.sellingPrice": { $toDouble: "$snapshot.sellingPrice" },
    "snapshot.minimumOrderValue": { $toDouble: "$snapshot.minimumOrderValue" },
  },
};

export const todayDateRange = (timezone?: string): DateRange => {
  const now = new Date();

  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);

      const year = parseInt(parts.find((p) => p.type === "year")!.value);
      const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
      const day = parseInt(parts.find((p) => p.type === "day")!.value);

      return {
        startOfDay: new Date(Date.UTC(year, month, day, 0, 0, 0, 0)),
        endOfDay: new Date(Date.UTC(year, month, day, 23, 59, 59, 999)),
      };
    } catch {
      // fall through to UTC default
    }
  }

  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  return {
    startOfDay: new Date(Date.UTC(y, m, d, 0, 0, 0, 0)),
    endOfDay: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
  };
};

export const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
