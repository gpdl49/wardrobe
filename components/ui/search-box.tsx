"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { Input } from "./field";

/** Search field: local state for typing, written to the URL after a pause. */
export function SearchBox({
	value,
	onChange,
	className,
	delay = 300,
}: {
	value: string;
	onChange: (value: string) => void;
	className?: string;
	delay?: number;
}) {
	const [text, setText] = useState(value);
	const latest = useRef(onChange);
	latest.current = onChange;
	// Follow the URL when it changes from elsewhere (back button, clear).
	const lastSent = useRef(value);
	useEffect(() => {
		if (value !== lastSent.current) {
			lastSent.current = value;
			setText(value);
		}
	}, [value]);
	useEffect(() => {
		const next = text.trim();
		if (next === lastSent.current) {
			return;
		}
		const timer = setTimeout(() => {
			lastSent.current = next;
			latest.current(next);
		}, delay);
		return () => clearTimeout(timer);
	}, [text, delay]);
	return (
		<div className={cn("relative", className)}>
			<Search
				aria-hidden
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
			/>
			<Input
				type="search"
				inputMode="search"
				enterKeyHint="search"
				placeholder="Search name, brand, notes…"
				aria-label="Search"
				value={text}
				onChange={(e) => setText(e.target.value)}
				className="pr-3 pl-9"
			/>
		</div>
	);
}
