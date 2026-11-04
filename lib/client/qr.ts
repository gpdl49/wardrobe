import { z } from "zod";
import { locationCode } from "@/lib/locations/schema";

/** Hosts whose `/l/<ownerId>/<code>` URLs are wardrobe labels. */
export const LABEL_HOSTS = ["wardrobe.vidur.xyz"];

/** Whose label it is, and the code. A null owner means the caller's own. */
export type ParsedLabel = { ownerId: string | null; code: string };

const ownerIdSchema = z.uuid();

/**
 * The location in a scanned QR payload, or null if it is not a wardrobe label.
 * Labels encode `https://wardrobe.vidur.xyz/l/<ownerId>/<code>`; a bare code
 * (`B-07`, typed) is accepted too and means the caller's own wardrobe.
 * `extraHosts` lets the current origin (localhost in dev) count as a label host.
 */
export function parseLabel(
	payload: string,
	extraHosts: readonly string[] = [],
): ParsedLabel | null {
	const text = payload.trim();
	if (!text) {
		return null;
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
		return parseLabelUrl(text, [...LABEL_HOSTS, ...extraHosts]);
	}
	const code = toCode(text);
	return code ? { ownerId: null, code } : null;
}

function parseLabelUrl(
	text: string,
	hosts: readonly string[],
): ParsedLabel | null {
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return null;
	}
	if (!hosts.includes(url.host)) {
		return null;
	}
	const match = /^\/l\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
	if (!match?.[1] || !match[2]) {
		return null;
	}
	let rawOwner: string;
	let rawCode: string;
	try {
		rawOwner = decodeURIComponent(match[1]);
		rawCode = decodeURIComponent(match[2]);
	} catch {
		return null;
	}
	const owner = ownerIdSchema.safeParse(rawOwner);
	const code = toCode(rawCode);
	return owner.success && code
		? { ownerId: owner.data.toLowerCase(), code }
		: null;
}

function toCode(raw: string): string | null {
	const parsed = locationCode.safeParse(raw);
	return parsed.success ? parsed.data : null;
}
