import { locationCode } from "@/lib/locations/schema";

/** Hosts whose `/l/<code>` URLs are wardrobe labels. */
export const LABEL_HOSTS = ["wardrobe.vidur.xyz"];

/**
 * The location code in a scanned QR payload, or null if it is not a wardrobe
 * label. Labels encode `https://wardrobe.vidur.xyz/l/<code>`; a bare code
 * (`B-07`, typed or from an older label) is accepted too. `extraHosts` lets
 * the current origin (localhost in dev) count as a label host.
 */
export function parseLabel(
	payload: string,
	extraHosts: readonly string[] = [],
): string | null {
	const text = payload.trim();
	if (!text) {
		return null;
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
		return parseLabelUrl(text, [...LABEL_HOSTS, ...extraHosts]);
	}
	return toCode(text);
}

function parseLabelUrl(text: string, hosts: readonly string[]): string | null {
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
	const match = /^\/l\/([^/]+)\/?$/.exec(url.pathname);
	if (!match?.[1]) {
		return null;
	}
	let raw: string;
	try {
		raw = decodeURIComponent(match[1]);
	} catch {
		return null;
	}
	return toCode(raw);
}

function toCode(raw: string): string | null {
	const parsed = locationCode.safeParse(raw);
	return parsed.success ? parsed.data : null;
}
