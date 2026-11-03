import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import {
	ApiError,
	conflict,
	errorResponse,
	notFound,
	toErrorBody,
} from "@/lib/http/errors";

const prismaError = (code: string) =>
	new Prisma.PrismaClientKnownRequestError("boom", {
		code,
		clientVersion: "test",
	});

describe("toErrorBody", () => {
	it("maps ApiErrors to their status and code", () => {
		expect(toErrorBody(notFound("No such bag"))).toEqual({
			status: 404,
			body: { error: "not_found", message: "No such bag" },
		});
		expect(toErrorBody(new ApiError(422, "x", "custom_code")).body.error).toBe(
			"custom_code",
		);
	});

	it("maps zod errors to 400 with the field path", () => {
		const result = z.object({ name: z.string() }).safeParse({ name: 1 });
		const { status, body } = toErrorBody(result.error);
		expect(status).toBe(400);
		expect(body.error).toBe("bad_request");
		expect(body.message).toMatch(/^name: /);
	});

	it.each([
		["P2002", 409],
		["P2003", 409],
		["P2025", 404],
		["P9999", 500],
	])("maps Prisma %s to %i", (code, status) => {
		expect(toErrorBody(prismaError(code)).status).toBe(status);
	});

	it("hides unknown errors behind an opaque 500", () => {
		expect(toErrorBody(new Error("secret detail"))).toEqual({
			status: 500,
			body: { error: "internal", message: "Internal server error" },
		});
	});
});

describe("errorResponse", () => {
	it("returns JSON in the contract shape", async () => {
		const response = errorResponse(conflict("Taken"));
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "conflict",
			message: "Taken",
		});
	});

	it("logs 500s", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		errorResponse(new Error("x"));
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
