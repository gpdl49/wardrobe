"use client";

import { Share2, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { LocationOptions } from "@/components/catalogue/filter-controls";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState, ErrorText, Loading } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import type { ShareAccess, ShareDto, SharedWithMeDto } from "@/lib/api/types";
import { userLabel } from "@/lib/client/access";
import { locationLabel } from "@/lib/client/labels";
import {
	useLocations,
	useSharedWithMe,
	useShareMutations,
	useShares,
} from "@/lib/client/queries";

const ACCESS_LABELS: Record<ShareAccess, string> = {
	view: "Can view",
	edit: "Can edit",
};

/** /sharing: what you share and what others share with you. */
export function SharingPage() {
	return (
		<>
			<PageHeader title="Sharing" />
			<div className="flex max-w-3xl flex-col gap-8">
				<AddShare />
				<YourShares />
				<SharedWithMe />
			</div>
		</>
	);
}

function AddShare() {
	const id = useId();
	const locations = useLocations();
	const { create } = useShareMutations();
	const [grantee, setGrantee] = useState("");
	const [access, setAccess] = useState<ShareAccess>("view");
	const [locationId, setLocationId] = useState("");

	const submit = (e: FormEvent) => {
		e.preventDefault();
		create.mutate(
			{
				grantee: grantee.trim(),
				access,
				...(locationId ? { locationId } : {}),
			},
			{ onSuccess: () => setGrantee("") },
		);
	};

	return (
		<form
			onSubmit={submit}
			aria-label="Share with someone"
			className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
		>
			<h2 className="font-semibold">Share with someone</h2>
			<Field
				label="Email or username"
				htmlFor={`${id}-grantee`}
				hint="They must have signed in to Wardrobe at least once."
			>
				<Input
					id={`${id}-grantee`}
					required
					value={grantee}
					onChange={(e) => setGrantee(e.target.value)}
					autoComplete="off"
					autoCapitalize="none"
				/>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="What" htmlFor={`${id}-scope`}>
					<Select
						id={`${id}-scope`}
						value={locationId}
						onChange={(e) => setLocationId(e.target.value)}
					>
						<option value="">My whole wardrobe</option>
						<LocationOptions locations={locations.data ?? []} />
					</Select>
				</Field>
				<Field label="Access" htmlFor={`${id}-access`}>
					<Select
						id={`${id}-access`}
						value={access}
						onChange={(e) => setAccess(e.target.value as ShareAccess)}
					>
						<option value="view">{ACCESS_LABELS.view}</option>
						<option value="edit">{ACCESS_LABELS.edit}</option>
					</Select>
				</Field>
			</div>
			<ErrorText error={create.error} />
			<Button
				type="submit"
				variant="primary"
				className="self-start"
				disabled={create.isPending || !grantee.trim()}
			>
				<Share2 />
				{create.isPending ? "Sharing…" : "Share"}
			</Button>
		</form>
	);
}

const scopeLabel = (share: { location: ShareDto["location"] }) =>
	share.location ? locationLabel(share.location) : "Whole wardrobe";

function YourShares() {
	const shares = useShares();
	const { update, remove } = useShareMutations();
	return (
		<section aria-labelledby="your-shares-heading">
			<h2 id="your-shares-heading" className="mb-2 font-semibold">
				What you share
			</h2>
			{shares.isPending ? (
				<Loading />
			) : shares.isError ? (
				<ErrorText error={shares.error} />
			) : shares.data.length === 0 ? (
				<EmptyState icon={<Share2 />} title="Not shared with anyone">
					Your wardrobe is private until you share it.
				</EmptyState>
			) : (
				<>
					<ErrorText error={update.error} className="mb-2" />
					<ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
						{shares.data.map((share) => {
							const who = userLabel(share.grantee);
							return (
								<li
									key={share.id}
									className="flex flex-wrap items-center gap-3 px-4 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{who}</p>
										<p className="truncate text-sm text-muted">
											{scopeLabel(share)}
										</p>
									</div>
									<label htmlFor={`share-${share.id}`} className="sr-only">
										Access for {who} to {scopeLabel(share)}
									</label>
									<Select
										id={`share-${share.id}`}
										value={share.access}
										disabled={update.isPending}
										onChange={(e) =>
											update.mutate({
												id: share.id,
												access: e.target.value as ShareAccess,
											})
										}
										className="w-auto"
									>
										<option value="view">{ACCESS_LABELS.view}</option>
										<option value="edit">{ACCESS_LABELS.edit}</option>
									</Select>
									<ConfirmDialog
										title={`Stop sharing with ${who}?`}
										description={`${who} loses access to ${scopeLabel(share).toLowerCase()}. Photo links they already opened keep working for up to 10 minutes.`}
										confirmLabel="Stop sharing"
										onConfirm={() => remove.mutateAsync(share.id)}
										trigger={
											<Button
												variant="danger-ghost"
												size="icon"
												aria-label={`Stop sharing ${scopeLabel(share)} with ${who}`}
											>
												<Trash2 />
											</Button>
										}
									/>
								</li>
							);
						})}
					</ul>
				</>
			)}
		</section>
	);
}

const sharedHref = (share: SharedWithMeDto) =>
	share.location
		? `/locations/${share.location.id}`
		: `/?owner=${encodeURIComponent(share.owner.id)}`;

function SharedWithMe() {
	const shared = useSharedWithMe();
	return (
		<section aria-labelledby="shared-heading">
			<h2 id="shared-heading" className="mb-2 font-semibold">
				Shared with you
			</h2>
			{shared.isPending ? (
				<Loading />
			) : shared.isError ? (
				<ErrorText error={shared.error} />
			) : shared.data.length === 0 ? (
				<EmptyState icon={<Users />} title="Nothing yet">
					When someone shares their wardrobe with you, it appears here.
				</EmptyState>
			) : (
				<ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
					{shared.data.map((share) => (
						<li key={share.id}>
							<Link
								href={sharedHref(share)}
								className="flex min-h-14 items-center gap-3 px-4 py-2 transition hover:bg-sunken"
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">
										{userLabel(share.owner)}
									</span>
									<span className="block truncate text-sm text-muted">
										{share.location
											? `${share.location.code} · ${share.location.name}`
											: "Whole wardrobe"}
									</span>
								</span>
								<span className="text-sm text-muted">
									{ACCESS_LABELS[share.access]}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
