"use client";

/**
 * Picks photos from the signed-in user's Immich library. Frozen props
 * (docs/outfits/contract.md "Shared UI contracts"): the picker only selects;
 * the caller links the assets (POST /api/outfits/{id}/immich-assets).
 *
 * Placeholder until the Immich web package fills it in.
 */
export type ImmichPickerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called with the chosen Immich asset ids; the picker closes when it settles. */
	onPick: (assetIds: string[]) => void | Promise<void>;
};

export function ImmichPicker(_props: ImmichPickerProps) {
	return null;
}
