import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  gstFromInclusive,
  gstFromExclusive,
  gstPayable,
  biMonthlyGstPeriod,
  nzTaxYear,
  deductibleAmount,
} from "@/lib/tax/gst";

describe("gstFromInclusive", () => {
  it("extracts GST from a gross amount using 3/23", () => {
    const { gst, net } = gstFromInclusive("115.00");
    expect(gst.toFixed(2)).toBe("15.00");
    expect(net.toFixed(2)).toBe("100.00");
  });

  it("handles odd amounts with HALF_UP rounding", () => {
    const { gst } = gstFromInclusive("89.99");
    // 89.99 * 3/23 = 11.7378… -> 11.74
    expect(gst.toFixed(2)).toBe("11.74");
  });
});

describe("gstFromExclusive", () => {
  it("adds 15% to a net amount", () => {
    const { gst, gross } = gstFromExclusive("100");
    expect(gst.toFixed(2)).toBe("15.00");
    expect(gross.toFixed(2)).toBe("115.00");
  });
});

describe("gstPayable", () => {
  it("returns positive when output > input (owed to IRD)", () => {
    expect(gstPayable("1500", "900").toNumber()).toBe(600);
  });
  it("returns negative when input > output (refund due)", () => {
    expect(gstPayable("500", "900").toNumber()).toBe(-400);
  });
});

describe("biMonthlyGstPeriod", () => {
  it("groups January into Jan-Feb", () => {
    const p = biMonthlyGstPeriod(new Date(Date.UTC(2026, 0, 15)));
    expect(p.start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(p.end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("groups November into Nov-Dec", () => {
    const p = biMonthlyGstPeriod(new Date(Date.UTC(2026, 10, 20)));
    expect(p.start.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(p.end.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});

describe("nzTaxYear", () => {
  it("treats March as previous tax year", () => {
    const y = nzTaxYear(new Date(Date.UTC(2026, 2, 31)));
    expect(y.start.toISOString().slice(0, 10)).toBe("2025-04-01");
    expect(y.end.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("treats April as new tax year", () => {
    const y = nzTaxYear(new Date(Date.UTC(2026, 3, 1)));
    expect(y.start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(y.end.toISOString().slice(0, 10)).toBe("2027-03-31");
  });
});

describe("deductibleAmount", () => {
  it("computes percentage of amount", () => {
    expect(deductibleAmount("100", 50).toNumber()).toBe(50);
    expect(deductibleAmount("299.99", 70).toFixed(2)).toBe("209.99");
  });
});
