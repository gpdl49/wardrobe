import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Wardrobe",
		short_name: "Wardrobe",
		description: "What's packed where.",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#fafafa",
		theme_color: "#fafafa",
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
			{
				src: "/icons/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
