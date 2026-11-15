"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImmichPicker } from "@/components/immich/immich-picker";
import { ItemCard } from "@/components/items/item-tile";
import { Photo } from "@/components/photo";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { ErrorText, Loading } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { useCurrentUser } from "@/lib/client/current-user";
import { itemTitle } from "@/lib/client/labels";
import { outfits, useOutfit, useOutfitMutation } from "@/lib/client/outfits";
import { useSharedWithMe } from "@/lib/client/queries";
import { OutfitImage } from "./outfit-tile";
export function OutfitDetail({ id }: { id: string }) {
	const data = useOutfit(id);
	const me = useCurrentUser();
	const shares = useSharedWithMe();
	const router = useRouter();
	const [picker, setPicker] = useState(false);
	const [grantee, setGrantee] = useState("");
	const [open, setOpen] = useState(false);
	const action = useOutfitMutation(id, async (fn: () => Promise<unknown>) =>
		fn(),
	);
	if (data.isPending) return <Loading />;
	if (!data.data) return <ErrorText error={data.error} />;
	const outfit = data.data;
	const edit = outfit.access !== "view";
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center gap-2">
				<h1 className="flex-1 text-2xl font-semibold">{outfit.name}</h1>
				{edit && (
					<Link href={`/outfits/${id}/edit`} className={buttonClass({})}>
						Edit
					</Link>
				)}
				{outfit.access === "owner" && (
					<Dialog
						open={open}
						onOpenChange={setOpen}
						title="Share outfit"
						trigger={<Button>Share</Button>}
					>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								action.mutate(() => outfits.share(id, grantee), {
									onSuccess: () => setGrantee(""),
								});
							}}
						>
							<Input
								aria-label="Email or username"
								value={grantee}
								onChange={(e) => setGrantee(e.target.value)}
								required
							/>
							<Button type="submit">Share</Button>
						</form>
						<ul>
							{outfit.shares.map((s) => (
								<li
									key={s.id}
									className="flex items-center justify-between py-2"
								>
									<span>
										{s.grantee.username ?? s.grantee.email ?? s.grantee.id}
									</span>
									<Button
										onClick={() =>
											action.mutate(() => outfits.unshare(id, s.id))
										}
									>
										Remove
									</Button>
								</li>
							))}
						</ul>
						<ErrorText error={action.error} />
					</Dialog>
				)}
				{edit && (
					<ConfirmDialog
						title={`Delete ${outfit.name}?`}
						description="This deletes the outfit and its uploaded photos."
						onConfirm={async () => {
							await action.mutateAsync(() => outfits.delete(id));
							router.replace("/outfits");
						}}
						trigger={<Button variant="danger-ghost">Delete</Button>}
					/>
				)}
			</div>
			{outfit.notes && <p className="whitespace-pre-wrap">{outfit.notes}</p>}
			<p className="text-sm text-muted">
				{[...outfit.seasons, ...outfit.tags].join(" · ")}
			</p>
			<section className="flex flex-col gap-3">
				<h2 className="text-xl font-semibold">Items</h2>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{outfit.items.map((item) =>
						item.location ||
						item.access !== "view" ||
						shares.data?.some(
							(share) => share.owner.id === item.ownerId && !share.location,
						) ? (
							<ItemCard key={item.id} item={item} />
						) : (
							<div
								key={item.id}
								className="overflow-hidden rounded-card border border-line bg-surface"
							>
								<Photo
									photo={item.coverPhoto}
									variant="thumb"
									alt=""
									className="aspect-[4/5]"
								/>
								<p className="p-2">{itemTitle(item)}</p>
							</div>
						),
					)}
				</div>
			</section>
			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="flex-1 text-xl font-semibold">Photos</h2>
					{edit && (
						<>
							<label className={buttonClass({})}>
								Add photo
								<input
									className="sr-only"
									type="file"
									accept="image/*"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) action.mutate(() => outfits.upload(id, file));
										e.target.value = "";
									}}
								/>
							</label>
							{me?.features.immich && (
								<Button onClick={() => setPicker(true)}>Add from Immich</Button>
							)}
						</>
					)}
				</div>
				<ImmichPicker
					open={picker}
					onOpenChange={setPicker}
					onPick={async (ids) => {
						await action.mutateAsync(() => outfits.link(id, ids));
					}}
				/>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{outfit.photos.map((photo) => (
						<div key={`${photo.source}-${photo.id}`}>
							<a href={photo.urls.display} target="_blank" rel="noreferrer">
								<OutfitImage photo={photo} alt="Outfit photo" />
							</a>
							{edit && (
								<Button
									onClick={() =>
										action.mutate(() => outfits.removePhoto(id, photo))
									}
								>
									Remove photo
								</Button>
							)}
						</div>
					))}
				</div>
				<ErrorText error={action.error} />
			</section>
		</div>
	);
}
