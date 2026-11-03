"use client";

import {
	ArrowDown,
	ArrowUp,
	Check,
	CornerDownRight,
	FolderInput,
	FolderTree,
	Pencil,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { indent } from "@/components/catalogue/filter-controls";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorText, Loading } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { type CategoryNode, descendantIds } from "@/lib/client/categories";
import { useCategories, useCategoryMutations } from "@/lib/client/queries";

type Mutations = ReturnType<typeof useCategoryMutations>;

/**
 * New sort orders after moving `node` one place up or down among its
 * siblings: every sibling gets its index, so gaps and ties are repaired too.
 * Returns only the changes.
 */
export function reorder(
	siblings: CategoryNode[],
	id: string,
	delta: -1 | 1,
): Array<{ id: string; sortOrder: number }> {
	const order = siblings.map((s) => s.id);
	const from = order.indexOf(id);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= order.length) {
		return [];
	}
	[order[from], order[to]] = [order[to] as string, order[from] as string];
	return order.flatMap((sid, sortOrder) => {
		const sibling = siblings.find((s) => s.id === sid);
		return sibling && sibling.sortOrder !== sortOrder
			? [{ id: sid, sortOrder }]
			: [];
	});
}

export function CategoryTreeEditor() {
	const categories = useCategories();
	const mutations = useCategoryMutations();
	const [error, setError] = useState<unknown>(null);
	const run = async (fn: () => Promise<unknown>) => {
		setError(null);
		try {
			await fn();
		} catch (err) {
			setError(err);
		}
	};

	if (categories.isPending) {
		return <Loading />;
	}
	if (categories.isError) {
		return <ErrorText error={categories.error} />;
	}
	return (
		<div className="flex flex-col gap-4">
			<ErrorText error={error} />
			{categories.tree.length === 0 ? (
				<EmptyState icon={<FolderTree />} title="No categories yet" />
			) : (
				<ul className="overflow-hidden rounded-card border border-line bg-surface">
					<Branch
						nodes={categories.tree}
						all={categories.flat}
						mutations={mutations}
						run={run}
					/>
				</ul>
			)}
			<AddCategory
				parentId={null}
				siblings={categories.tree}
				mutations={mutations}
				run={run}
				label="Add top-level category"
			/>
		</div>
	);
}

interface NodeProps {
	all: CategoryNode[];
	mutations: Mutations;
	run: (fn: () => Promise<unknown>) => Promise<void>;
}

function Branch({ nodes, ...props }: NodeProps & { nodes: CategoryNode[] }) {
	return nodes.map((node, i) => (
		<CategoryRow
			key={node.id}
			node={node}
			siblings={nodes}
			first={i === 0}
			last={i === nodes.length - 1}
			{...props}
		/>
	));
}

function CategoryRow({
	node,
	siblings,
	first,
	last,
	all,
	mutations,
	run,
}: NodeProps & {
	node: CategoryNode;
	siblings: CategoryNode[];
	first: boolean;
	last: boolean;
}) {
	const [renaming, setRenaming] = useState(false);
	const [adding, setAdding] = useState(false);
	const busy =
		mutations.update.isPending ||
		mutations.create.isPending ||
		mutations.remove.isPending;

	const move = (delta: -1 | 1) =>
		run(() =>
			Promise.all(
				reorder(siblings, node.id, delta).map(({ id, sortOrder }) =>
					mutations.update.mutateAsync({ id, input: { sortOrder } }),
				),
			),
		);

	return (
		<li className="border-line not-first:border-t">
			<div
				className="flex min-h-14 flex-wrap items-center gap-1 py-1.5 pr-2"
				style={{ paddingLeft: `${0.75 + node.depth * 1.25}rem` }}
			>
				{node.depth > 0 ? (
					<CornerDownRight aria-hidden className="size-4 shrink-0 text-faint" />
				) : null}
				{renaming ? (
					<RenameForm
						node={node}
						onDone={() => setRenaming(false)}
						mutations={mutations}
						run={run}
					/>
				) : (
					<span className="min-w-0 flex-1 truncate px-1 font-medium">
						{node.name}
						<span className="ml-2 font-mono text-xs font-normal text-faint">
							{node.slug}
						</span>
					</span>
				)}
				{!renaming ? (
					<div className="flex items-center">
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Move ${node.name} up`}
							disabled={first || busy}
							onClick={() => void move(-1)}
						>
							<ArrowUp />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Move ${node.name} down`}
							disabled={last || busy}
							onClick={() => void move(1)}
						>
							<ArrowDown />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Rename ${node.name}`}
							onClick={() => setRenaming(true)}
						>
							<Pencil />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Add a category inside ${node.name}`}
							onClick={() => setAdding(true)}
						>
							<Plus />
						</Button>
						<ReparentDialog node={node} all={all} mutations={mutations} />
						<ConfirmDialog
							title={`Delete ${node.name}?`}
							description="Only empty categories can be deleted: move or delete its subcategories and recategorise its items first."
							onConfirm={() => mutations.remove.mutateAsync(node.id)}
							trigger={
								<Button
									variant="danger-ghost"
									size="icon"
									aria-label={`Delete ${node.name}`}
								>
									<Trash2 />
								</Button>
							}
						/>
					</div>
				) : null}
			</div>
			{node.children.length > 0 || adding ? (
				<ul className="border-t border-line">
					<Branch
						nodes={node.children}
						all={all}
						mutations={mutations}
						run={run}
					/>
					{adding ? (
						<li
							className="border-t border-line py-2 pr-2"
							style={{ paddingLeft: `${0.75 + (node.depth + 1) * 1.25}rem` }}
						>
							<AddCategory
								parentId={node.id}
								siblings={node.children}
								mutations={mutations}
								run={run}
								autoFocus
								onDone={() => setAdding(false)}
								label={`New category in ${node.name}`}
							/>
						</li>
					) : null}
				</ul>
			) : null}
		</li>
	);
}

function RenameForm({
	node,
	onDone,
	mutations,
	run,
}: {
	node: CategoryNode;
	onDone: () => void;
	mutations: Mutations;
	run: NodeProps["run"];
}) {
	const [name, setName] = useState(node.name);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		const next = name.trim();
		if (!next || next === node.name) {
			onDone();
			return;
		}
		void run(async () => {
			await mutations.update.mutateAsync({
				id: node.id,
				input: { name: next },
			});
			onDone();
		});
	};
	return (
		<form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-1">
			<Input
				aria-label={`New name for ${node.name}`}
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => e.key === "Escape" && onDone()}
				autoFocus
			/>
			<Button type="submit" variant="ghost" size="icon" aria-label="Save name">
				<Check />
			</Button>
			<Button variant="ghost" size="icon" aria-label="Cancel" onClick={onDone}>
				<X />
			</Button>
		</form>
	);
}

function AddCategory({
	parentId,
	siblings,
	mutations,
	run,
	label,
	autoFocus,
	onDone,
}: {
	parentId: string | null;
	siblings: CategoryNode[];
	mutations: Mutations;
	run: NodeProps["run"];
	label: string;
	autoFocus?: boolean;
	onDone?: () => void;
}) {
	const [name, setName] = useState("");
	const submit = (e: FormEvent) => {
		e.preventDefault();
		const next = name.trim();
		if (!next) {
			onDone?.();
			return;
		}
		const sortOrder =
			siblings.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
		void run(async () => {
			await mutations.create.mutateAsync({ name: next, parentId, sortOrder });
			setName("");
		});
	};
	return (
		<form onSubmit={submit} className="flex items-center gap-2">
			<Input
				aria-label={label}
				placeholder={label}
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => e.key === "Escape" && onDone?.()}
				autoFocus={autoFocus}
				className="max-w-sm"
			/>
			<Button type="submit" disabled={mutations.create.isPending}>
				<Plus />
				Add
			</Button>
			{onDone ? (
				<Button variant="ghost" onClick={onDone}>
					Done
				</Button>
			) : null}
		</form>
	);
}

function ReparentDialog({
	node,
	all,
	mutations,
}: {
	node: CategoryNode;
	all: CategoryNode[];
	mutations: Mutations;
}) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const [parentId, setParentId] = useState(node.parentId ?? "");
	const excluded = descendantIds(node);
	const save = () => {
		const target = parentId || null;
		const siblings = all.filter((c) => c.parentId === target);
		const sortOrder =
			siblings.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
		mutations.update.mutate(
			{ id: node.id, input: { parentId: target, sortOrder } },
			{ onSuccess: () => setOpen(false) },
		);
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setParentId(node.parentId ?? "");
				mutations.update.reset();
			}}
			title={`Move ${node.name}`}
			description="Its subcategories move with it."
			trigger={
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Move ${node.name} to another parent`}
				>
					<FolderInput />
				</Button>
			}
			footer={
				<>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button
						variant="primary"
						disabled={
							mutations.update.isPending || parentId === (node.parentId ?? "")
						}
						onClick={save}
					>
						Move
					</Button>
				</>
			}
		>
			<Field label="Put inside" htmlFor={`${id}-parent`}>
				<Select
					id={`${id}-parent`}
					value={parentId}
					onChange={(e) => setParentId(e.target.value)}
				>
					<option value="">Top level</option>
					{all.map((c) => (
						<option key={c.id} value={c.id} disabled={excluded.has(c.id)}>
							{indent(c.depth)}
							{c.name}
						</option>
					))}
				</Select>
			</Field>
			<ErrorText error={mutations.update.error} className="mt-3" />
		</Dialog>
	);
}
