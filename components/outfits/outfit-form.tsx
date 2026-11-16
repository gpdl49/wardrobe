"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { TagInput } from "@/components/items/tag-input";
import { Photo } from "@/components/photo";
import { Button } from "@/components/ui/button";
import { ErrorText, Loading } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ItemSummaryDto, OutfitDetailDto, Season } from "@/lib/api/types";
import { itemTitle } from "@/lib/client/labels";
import { outfits, useOutfit, useOutfitMutation } from "@/lib/client/outfits";
import { useCategories, useItems, useTags } from "@/lib/client/queries";

const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
export function NewOutfit() {
	const params = useSearchParams();
	return <OutfitForm owner={params.get("owner") ?? ""} />;
}
export function EditOutfit({ id }: { id: string }) {
	const outfit = useOutfit(id);
	if (outfit.isPending) return <Loading />;
	if (!outfit.data) return <ErrorText error={outfit.error} />;
	if (outfit.data.access === "view") return <p>You cannot edit this outfit.</p>;
	return <OutfitForm outfit={outfit.data} owner={outfit.data.ownerId} />;
}
function OutfitForm({
	outfit,
	owner,
}: {
	outfit?: OutfitDetailDto;
	owner: string;
}) {
	const router = useRouter();
	const [name, setName] = useState(outfit?.name ?? "");
	const [notes, setNotes] = useState(outfit?.notes ?? "");
	const [selectedSeasons, setSeasons] = useState<Season[]>(
		outfit?.seasons ?? [],
	);
	const [tags, setTags] = useState(outfit?.tags ?? []);
	const [chosen, setChosen] = useState<ItemSummaryDto[]>(outfit?.items ?? []);
	const [q, setQ] = useState("");
	const [category, setCategory] = useState("");
	const [season, setSeason] = useState("");
	const items = useItems({
		owner: owner || undefined,
		q,
		category,
		season: (season || undefined) as Season | undefined,
	});
	const categories = useCategories();
	const vocabulary = useTags(owner || undefined);
	const save = useOutfitMutation(outfit?.id ?? "", async () => {
		const input = {
			name,
			notes: notes || null,
			seasons: selectedSeasons,
			tags,
			itemIds: chosen.map((i) => i.id),
			...(!outfit && owner ? { ownerId: owner } : {}),
		};
		return outfit ? outfits.update(outfit.id, input) : outfits.create(input);
	});
	const move = (index: number, delta: number) =>
		setChosen((old) => {
			const copy = [...old];
			const target = index + delta;
			if (target < 0 || target >= copy.length) return old;
			[copy[index], copy[target]] = [copy[target], copy[index]] as [
				ItemSummaryDto,
				ItemSummaryDto,
			];
			return copy;
		});
	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				void save
					.mutateAsync(undefined)
					.then((result) =>
						router.push(`/outfits/${(result as OutfitDetailDto).id}`),
					)
					.catch(() => {});
			}}
		>
			<h1 className="text-2xl font-semibold">
				{outfit ? "Edit outfit" : "New outfit"}
			</h1>
			<Field label="Name" htmlFor="outfit-name">
				<Input
					id="outfit-name"
					required
					maxLength={200}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<Field label="Notes" htmlFor="outfit-notes">
				<Textarea
					id="outfit-notes"
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
				/>
			</Field>
			<fieldset>
				<legend className="text-sm font-medium text-muted">Seasons</legend>
				<div className="flex flex-wrap gap-3">
					{seasons.map((s) => (
						<label key={s} className="capitalize">
							<input
								type="checkbox"
								checked={selectedSeasons.includes(s)}
								onChange={(e) =>
									setSeasons(
										e.target.checked
											? [...selectedSeasons, s]
											: selectedSeasons.filter((x) => x !== s),
									)
								}
							/>{" "}
							{s}
						</label>
					))}
				</div>
			</fieldset>
			<div>
				<span className="text-sm font-medium text-muted">Tags</span>
				<TagInput
					value={tags}
					onChange={setTags}
					suggestions={vocabulary.data ?? []}
				/>
			</div>
			<section>
				<h2 className="font-semibold">Chosen items ({chosen.length}/50)</h2>
				<ol className="divide-y divide-line">
					{chosen.map((item, i) => (
						<li key={item.id} className="flex items-center gap-2 py-2">
							<Photo
								photo={item.coverPhoto}
								variant="thumb"
								alt=""
								className="size-12 shrink-0 rounded-lg"
							/>
							<span className="flex-1">
								<span style={{ opacity: item.nameGenerated ? 0.6 : 1 }}>
									{itemTitle(item)}
								</span>
							</span>
							<Button
								type="button"
								disabled={i === 0}
								onClick={() => move(i, -1)}
								aria-label={`Move $<span style={{ opacity: item.nameGenerated ? 0.6 : 1 }}>{itemTitle(item)}</span> up`}
							>
								↑
							</Button>
							<Button
								type="button"
								disabled={i === chosen.length - 1}
								onClick={() => move(i, 1)}
								aria-label={`Move $<span style={{ opacity: item.nameGenerated ? 0.6 : 1 }}>{itemTitle(item)}</span> down`}
							>
								↓
							</Button>
							<Button
								type="button"
								onClick={() =>
									setChosen(chosen.filter((x) => x.id !== item.id))
								}
							>
								Remove
							</Button>
						</li>
					))}
				</ol>
			</section>
			<section className="flex flex-col gap-2">
				<h2 className="font-semibold">Add items</h2>
				<Input
					aria-label="Search items"
					placeholder="Search items"
					value={q}
					onChange={(e) => setQ(e.target.value)}
				/>
				<div className="flex gap-2">
					<Select
						aria-label="Category"
						value={category}
						onChange={(e) => setCategory(e.target.value)}
					>
						<option value="">All categories</option>
						{categories.flat.map((c) => (
							<option key={c.id} value={c.id}>
								{c.path}
							</option>
						))}
					</Select>
					<Select
						aria-label="Item season"
						value={season}
						onChange={(e) => setSeason(e.target.value)}
					>
						<option value="">All seasons</option>
						{seasons.map((s) => (
							<option key={s}>{s}</option>
						))}
					</Select>
				</div>
				{items.isPending ? <Loading /> : <ErrorText error={items.error} />}
				<ul className="divide-y divide-line">
					{items.data?.pages
						.flatMap((p) => p.items)
						.map((item) => (
							<li key={item.id} className="flex items-center gap-2 py-2">
								<Photo
									photo={item.coverPhoto}
									variant="thumb"
									alt=""
									className="size-12 shrink-0 rounded-lg"
								/>
								<span className="flex-1">
									<span style={{ opacity: item.nameGenerated ? 0.6 : 1 }}>
										{itemTitle(item)}
									</span>
								</span>
								<Button
									type="button"
									disabled={
										chosen.length >= 50 || chosen.some((x) => x.id === item.id)
									}
									onClick={() => setChosen([...chosen, item])}
								>
									Add
								</Button>
							</li>
						))}
				</ul>
				{items.hasNextPage && (
					<Button type="button" onClick={() => void items.fetchNextPage()}>
						Load more items
					</Button>
				)}
			</section>
			<ErrorText error={save.error} />
			<Button
				variant="primary"
				disabled={save.isPending || !name.trim()}
				type="submit"
			>
				Save outfit
			</Button>
		</form>
	);
}
