/**
 * Apple App Site Association (AASA) document builder for iOS universal links
 * and shared web credentials.
 *
 * Contract: docs/ios/api-contract.md "Server additions".
 */

export type AppleAppSiteAssociation = {
	applinks: {
		details: Array<{
			appIDs: string[];
			components: Array<{ "/": string }>;
		}>;
	};
	webcredentials: {
		apps: string[];
	};
};

/**
 * Builds the Apple App Site Association JSON structure for the given app IDs.
 * Matches:
 * {"applinks":{"details":[{"appIDs":[...],"components":[{"/":"/l/*"}]}]},"webcredentials":{"apps":[...]}}
 */
export function buildAppleAppSiteAssociation(
	appIds: string[],
): AppleAppSiteAssociation {
	return {
		applinks: {
			details: [
				{
					appIDs: appIds,
					components: [{ "/": "/l/*" }],
				},
			],
		},
		webcredentials: {
			apps: appIds,
		},
	};
}
