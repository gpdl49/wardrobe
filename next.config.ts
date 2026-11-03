import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Photos are uploaded straight to S3 with presigned PUTs and shown through
 * presigned GET redirects, so S3 (or MinIO in dev) must be allowed for images
 * and fetches. 'unsafe-inline' stays for Next's inline bootstrap scripts.
 */
const CSP = [
	"default-src 'self'",
	// 'wasm-unsafe-eval': zxing-wasm (QR scanning) compiles WebAssembly.
	`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	`img-src 'self' data: blob: https:${isDev ? " http://localhost:*" : ""}`,
	"worker-src 'self' blob:",
	`connect-src 'self' https:${isDev ? " http://localhost:* ws://localhost:*" : ""}`,
	"font-src 'self' data:",
	"manifest-src 'self'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	// oauth2-proxy sign-out redirects to Zitadel.
	"form-action 'self' https:",
].join("; ");

const nextConfig: NextConfig = {
	output: "standalone",
	// This project is a submodule of gpdl49/homestacks, which has its own
	// lockfile; pin the tracing root here so standalone output is flat.
	outputFileTracingRoot: import.meta.dirname,
	turbopack: { root: import.meta.dirname },
	poweredByHeader: false,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "same-origin" },
					{ key: "X-Frame-Options", value: "DENY" },
					// The camera is used through <input capture> and QR scanning.
					{
						key: "Permissions-Policy",
						value: "camera=(self), microphone=(), geolocation=()",
					},
					{ key: "Content-Security-Policy", value: CSP },
				],
			},
		];
	},
};

export default nextConfig;
