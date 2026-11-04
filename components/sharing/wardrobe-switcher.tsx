"use client";

import { useId, useMemo } from "react";
import { Select } from "@/components/ui/field";
import type { SharedWithMeDto } from "@/lib/api/types";
import { userLabel } from "@/lib/client/access";
import { useSharedWithMe } from "@/lib/client/queries";

export type SharedWardrobe = { id: string; label: string };

/** One entry per person, whether they shared everything or some locations. */
export function sharedWardrobes(
	shared: readonly SharedWithMeDto[],
): SharedWardrobe[] {
	const byOwner = new Map<string, SharedWithMeDto[]>();
	for (const share of shared) {
		byOwner.set(share.owner.id, [
			...(byOwner.get(share.owner.id) ?? []),
			share,
		]);
	}
	return [...byOwner.values()]
		.map((shares) => {
			const name = userLabel((shares[0] as SharedWithMeDto).owner);
			const id = (shares[0] as SharedWithMeDto).owner.id;
			return shares.some((s) => !s.location)
				? { id, label: `${name}'s wardrobe` }
				: {
						id,
						label: `${name}: ${shares.length} shared location${shares.length === 1 ? "" : "s"}`,
					};
		})
		.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Chooses whose wardrobe the page shows; `value` is a user id, empty for your
 * own. Renders nothing while nobody has shared anything with you.
 */
export function WardrobeSwitcher({
	value,
	onChange,
	className,
}: {
	value: string;
	onChange: (owner: string) => void;
	className?: string;
}) {
	const id = useId();
	const shared = useSharedWithMe();
	const wardrobes = useMemo(
		() => sharedWardrobes(shared.data ?? []),
		[shared.data],
	);
	if (wardrobes.length === 0 && !value) {
		return null;
	}
	return (
		<div className={className}>
			<label htmlFor={id} className="sr-only">
				Wardrobe
			</label>
			<Select
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-auto"
			>
				<option value="">My wardrobe</option>
				{wardrobes.map((w) => (
					<option key={w.id} value={w.id}>
						{w.label}
					</option>
				))}
				{value && !wardrobes.some((w) => w.id === value) ? (
					<option value={value}>Shared wardrobe</option>
				) : null}
			</Select>
		</div>
	);
}
