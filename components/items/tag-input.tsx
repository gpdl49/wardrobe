"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { controlClass } from "@/components/ui/field";
import type { TagCountDto } from "@/lib/api/types";

/** Same normalisation as the API (lib/tags/schema): trimmed, lower-case. */
export const normaliseTag = (tag: string) =>
	tag.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 64);

/** Suggestions for `text`: prefix matches first, then by use count. */
export function suggestTags(
	all: TagCountDto[],
	text: string,
	selected: string[],
	limit = 8,
): TagCountDto[] {
	const needle = normaliseTag(text);
	return all
		.filter((t) => !selected.includes(t.name))
		.filter((t) => !needle || t.name.includes(needle))
		.sort((a, b) => {
			const ap = needle && a.name.startsWith(needle) ? 0 : 1;
			const bp = needle && b.name.startsWith(needle) ? 0 : 1;
			return ap - bp || b.count - a.count || a.name.localeCompare(b.name);
		})
		.slice(0, limit);
}

/**
 * Chips plus a combobox. Enter or comma adds what is typed (or the highlighted
 * suggestion), Backspace in an empty field removes the last tag.
 */
export function TagInput({
	value,
	onChange,
	suggestions,
	id: idProp,
	label = "Tags",
}: {
	value: string[];
	onChange: (tags: string[]) => void;
	suggestions: TagCountDto[];
	id?: string;
	label?: string;
}) {
	const autoId = useId();
	const id = idProp ?? autoId;
	const listId = `${id}-list`;
	const inputRef = useRef<HTMLInputElement>(null);
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const options = useMemo(
		() => suggestTags(suggestions, text, value),
		[suggestions, text, value],
	);
	const showList = open && options.length > 0;

	const add = (raw: string) => {
		const tag = normaliseTag(raw);
		if (tag && !value.includes(tag)) {
			onChange([...value, tag]);
		}
		setText("");
		setActive(-1);
	};
	const remove = (tag: string) => {
		onChange(value.filter((t) => t !== tag));
		inputRef.current?.focus();
	};

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown" && options.length > 0) {
			e.preventDefault();
			setOpen(true);
			setActive((i) => (i + 1) % options.length);
		} else if (e.key === "ArrowUp" && options.length > 0) {
			e.preventDefault();
			setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
		} else if (e.key === "Enter" || e.key === ",") {
			const choice = showList && active >= 0 ? options[active] : undefined;
			if (choice || text.trim()) {
				e.preventDefault();
				add(choice ? choice.name : text);
			}
		} else if (e.key === "Backspace" && text === "" && value.length > 0) {
			e.preventDefault();
			onChange(value.slice(0, -1));
		} else if (e.key === "Escape") {
			setOpen(false);
		}
	};

	return (
		<div className="relative">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: clicking the padding focuses the input; keyboard users reach it directly. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: as above. */}
			<div
				className={cn(
					controlClass,
					"flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 pointer-fine:min-h-9",
				)}
				onClick={() => inputRef.current?.focus()}
			>
				<ul aria-label={`Selected ${label.toLowerCase()}`} className="contents">
					{value.map((tag) => (
						<li
							key={tag}
							className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft py-0.5 pr-0.5 pl-2.5 text-sm text-accent"
						>
							{tag}
							<button
								type="button"
								aria-label={`Remove ${tag}`}
								onClick={() => remove(tag)}
								className="flex size-7 items-center justify-center rounded-full hover:bg-accent/15 pointer-fine:size-5"
							>
								<X aria-hidden className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
				<input
					ref={inputRef}
					id={id}
					role="combobox"
					aria-label={label}
					aria-expanded={showList}
					aria-controls={listId}
					aria-autocomplete="list"
					aria-activedescendant={
						showList && active >= 0 ? `${listId}-${active}` : undefined
					}
					autoCapitalize="none"
					autoCorrect="off"
					enterKeyHint="done"
					value={text}
					placeholder={value.length === 0 ? "Add tags…" : ""}
					onChange={(e) => {
						const next = e.target.value;
						if (next.endsWith(",")) {
							add(next.slice(0, -1));
						} else {
							setText(next);
							setOpen(true);
							setActive(-1);
						}
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						setOpen(false);
						if (text.trim()) {
							add(text);
						}
					}}
					onKeyDown={onKeyDown}
					className="min-w-24 flex-1 bg-transparent px-1 py-1 outline-none"
				/>
			</div>
			{showList ? (
				<div
					id={listId}
					role="listbox"
					aria-label={`${label} suggestions`}
					className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-lg"
				>
					{options.map((option, i) => (
						<div
							key={option.name}
							id={`${listId}-${i}`}
							role="option"
							tabIndex={-1}
							aria-selected={i === active}
							// Keep focus in the input so blur does not close the list first.
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => add(option.name)}
							onKeyDown={() => {}}
							className="flex min-h-11 cursor-pointer items-center justify-between rounded-md px-3 text-sm aria-selected:bg-sunken hover:bg-sunken pointer-fine:min-h-8"
						>
							<span>{option.name}</span>
							<span className="text-xs text-faint">{option.count}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
