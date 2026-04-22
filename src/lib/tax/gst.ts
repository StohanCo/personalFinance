import { Decimal } from "decimal.js";

/**
 * NZ GST is 15%. All math goes through decimal.js with HALF_UP rounding
 * to match IRD treatment. Never pass currency through JS `number`.
 */

export const GST_RATE = new Decimal("0.15");
// For inclusive amounts: gst = gross * 3/23
export const GST_FRACTION_FROM_INCLUSIVE = new Decimal(3).div(23);

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Extract GST portion from a GST-inclusive total.
 * e.g. gross 115.00 -> gst 15.00, net 100.00
 */
export function gstFromInclusive(gross: Decimal.Value): {
  gross: Decimal;
  gst: Decimal;
  net: Decimal;
} {
  const g = new Decimal(gross);
  const gst = g.mul(GST_FRACTION_FROM_INCLUSIVE).toDecimalPlaces(2);
  const net = g.minus(gst);
  return { gross: g.toDecimalPlaces(2), gst, net };
}

/**
 * Add GST to a GST-exclusive (net) amount.
 * e.g. net 100.00 -> gst 15.00, gross 115.00
 */
export function gstFromExclusive(net: Decimal.Value): {
  net: Decimal;
  gst: Decimal;
  gross: Decimal;
} {
  const n = new Decimal(net);
  const gst = n.mul(GST_RATE).toDecimalPlaces(2);
  const gross = n.plus(gst);
  return { net: n.toDecimalPlaces(2), gst, gross: gross.toDecimalPlaces(2) };
}

/**
 * Net GST position: positive number = payable to IRD, negative = refund due.
 */
export function gstPayable(
  outputGst: Decimal.Value,
  inputGst: Decimal.Value,
): Decimal {
  return new Decimal(outputGst).minus(inputGst).toDecimalPlaces(2);
}

/**
 * Given a date, return the bi-monthly NZ GST period it falls in.
 * NZ taxable periods for most contractors: Jan-Feb, Mar-Apr, May-Jun,
 * Jul-Aug, Sep-Oct, Nov-Dec.
 */
export function biMonthlyGstPeriod(date: Date): {
  start: Date;
  end: Date;
  label: string;
} {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const periodIdx = Math.floor(month / 2);
  const start = new Date(Date.UTC(year, periodIdx * 2, 1));
  const end = new Date(Date.UTC(year, periodIdx * 2 + 2, 0, 23, 59, 59, 999));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = `${monthNames[periodIdx * 2]}–${monthNames[periodIdx * 2 + 1]} ${year}`;
  return { start, end, label };
}

/**
 * NZ tax year containing the given date (1 April → 31 March).
 */
export function nzTaxYear(date: Date): { start: Date; end: Date; label: string } {
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  const startYear = m >= 3 ? y : y - 1;
  const start = new Date(Date.UTC(startYear, 3, 1));
  const end = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999));
  return { start, end, label: `${startYear}/${(startYear + 1).toString().slice(2)}` };
}

/**
 * Compute deductible amount from a transaction amount and a percentage (0-100).
 */
export function deductibleAmount(amount: Decimal.Value, percent: number): Decimal {
  return new Decimal(amount).mul(percent).div(100).toDecimalPlaces(2);
}
