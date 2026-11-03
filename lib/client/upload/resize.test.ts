import { describe, expect, it } from "vitest";
import { fitWithin, UPLOAD_MAX_EDGE } from "@/lib/client/upload/resize";

describe("fitWithin", () => {
	it("scales a 12 MP iPhone photo to 2400 on the long edge", () => {
		expect(fitWithin({ width: 4032, height: 3024 }, UPLOAD_MAX_EDGE)).toEqual({
			width: 2400,
			height: 1800,
		});
		expect(fitWithin({ width: 3024, height: 4032 }, UPLOAD_MAX_EDGE)).toEqual({
			width: 1800,
			height: 2400,
		});
	});

	it("handles 48 MP and odd aspect ratios", () => {
		expect(fitWithin({ width: 8064, height: 6048 }, 2400)).toEqual({
			width: 2400,
			height: 1800,
		});
		expect(fitWithin({ width: 4000, height: 1000 }, 2400)).toEqual({
			width: 2400,
			height: 600,
		});
		expect(fitWithin({ width: 3000, height: 2001 }, 2400)).toEqual({
			width: 2400,
			height: 1601,
		});
	});

	it("never upscales", () => {
		expect(fitWithin({ width: 1200, height: 900 }, 2400)).toEqual({
			width: 1200,
			height: 900,
		});
		expect(fitWithin({ width: 2400, height: 2400 }, 2400)).toEqual({
			width: 2400,
			height: 2400,
		});
	});

	it("keeps at least one pixel on extreme panoramas", () => {
		expect(fitWithin({ width: 100_000, height: 10 }, 320)).toEqual({
			width: 320,
			height: 1,
		});
	});

	it("rejects empty images", () => {
		expect(() => fitWithin({ width: 0, height: 10 }, 2400)).toThrow(RangeError);
		expect(() => fitWithin({ width: Number.NaN, height: 10 }, 2400)).toThrow(
			RangeError,
		);
	});
});
