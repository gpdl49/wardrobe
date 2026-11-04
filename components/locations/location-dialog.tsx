"use client";

import { type FormEvent, type ReactNode, useId, useState } from "react";
import { LocationOptions } from "@/components/catalogue/filter-controls";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorText } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { LocationDto, LocationKind } from "@/lib/api/types";
import { KIND_LABELS, LOCATION_KINDS } from "@/lib/client/labels";
import { useLocations, useSaveLocation } from "@/lib/client/queries";

/** Ids of `id` and every location nested under it (not valid parents). */
export function subtreeIds(locations: LocationDto[], id: string): Set<string> {
	const ids = new Set([id]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const l of locations) {
			if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) {
				ids.add(l.id);
				grew = true;
			}
		}
	}
	return ids;
}

/** Create (no `location`) or edit a location. */
export function LocationDialog({
	location,
	ownerId,
	defaultParentId,
	lockParent = false,
	trigger,
	onSaved,
}: {
	location?: LocationDto;
	/** Whose wardrobe a new location goes in; defaults to the caller's. */
	ownerId?: string;
	defaultParentId?: string;
	/** The API would refuse re-parenting this location. */
	lockParent?: boolean;
	trigger: ReactNode;
	onSaved?: (location: LocationDto) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog
			open={open}
			onOpenChange={setOpen}
			trigger={trigger}
			title={location ? `Edit ${location.code}` : "New location"}
		>
			{open ? (
				<LocationForm
					location={location}
					ownerId={ownerId}
					defaultParentId={defaultParentId}
					lockParent={lockParent}
					onCancel={() => setOpen(false)}
					onSaved={(saved) => {
						setOpen(false);
						onSaved?.(saved);
					}}
				/>
			) : null}
		</Dialog>
	);
}

function LocationForm({
	location,
	ownerId,
	defaultParentId,
	lockParent,
	onCancel,
	onSaved,
}: {
	location?: LocationDto;
	ownerId?: string;
	defaultParentId?: string;
	lockParent: boolean;
	onCancel: () => void;
	onSaved: (location: LocationDto) => void;
}) {
	const id = useId();
	const owner = location?.ownerId ?? ownerId;
	const locations = useLocations({
		archived: true,
		...(owner ? { owner } : {}),
	});
	const save = useSaveLocation();
	const [kind, setKind] = useState<LocationKind>(location?.kind ?? "bag");
	const [code, setCode] = useState(location?.code ?? "");
	const [name, setName] = useState(location?.name ?? "");
	const [notes, setNotes] = useState(location?.notes ?? "");
	const [parentId, setParentId] = useState(
		location?.parentId ?? defaultParentId ?? "",
	);
	const excluded = location
		? subtreeIds(locations.data ?? [], location.id)
		: new Set<string>();

	const submit = (e: FormEvent) => {
		e.preventDefault();
		const input = {
			kind,
			code: code.trim(),
			name: name.trim(),
			notes: notes.trim() || null,
			// Left out when locked: a shared location refuses re-parenting.
			...(lockParent ? {} : { parentId: parentId || null }),
		};
		save.mutate(
			location
				? { id: location.id, input }
				: { input: { ...input, ...(ownerId ? { ownerId } : {}) } },
			{ onSuccess: onSaved },
		);
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<div className="grid grid-cols-2 gap-4">
				<Field label="Kind" htmlFor={`${id}-kind`}>
					<Select
						id={`${id}-kind`}
						value={kind}
						onChange={(e) => setKind(e.target.value as LocationKind)}
					>
						{LOCATION_KINDS.map((k) => (
							<option key={k} value={k}>
								{KIND_LABELS[k].one}
							</option>
						))}
					</Select>
				</Field>
				<Field
					label="Code"
					htmlFor={`${id}-code`}
					hint="On the label, e.g. B-07"
				>
					<Input
						id={`${id}-code`}
						required
						value={code}
						onChange={(e) => setCode(e.target.value.toUpperCase())}
						pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,31}"
						autoCapitalize="characters"
						autoComplete="off"
						className="font-mono uppercase"
					/>
				</Field>
			</div>
			<Field label="Name" htmlFor={`${id}-name`}>
				<Input
					id={`${id}-name`}
					required
					value={name}
					onChange={(e) => setName(e.target.value)}
					autoComplete="off"
				/>
			</Field>
			<Field label="Inside" htmlFor={`${id}-parent`} hint="Where this is kept">
				<Select
					id={`${id}-parent`}
					value={parentId}
					disabled={lockParent}
					onChange={(e) => setParentId(e.target.value)}
				>
					<option value="">Not inside anything</option>
					<LocationOptions
						locations={locations.data ?? []}
						exclude={(l) => excluded.has(l.id)}
					/>
				</Select>
			</Field>
			<Field label="Notes" htmlFor={`${id}-notes`}>
				<Textarea
					id={`${id}-notes`}
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
				/>
			</Field>
			<ErrorText error={save.error} />
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button onClick={onCancel}>Cancel</Button>
				<Button type="submit" variant="primary" disabled={save.isPending}>
					{save.isPending ? "Saving…" : location ? "Save" : "Create"}
				</Button>
			</div>
		</form>
	);
}
