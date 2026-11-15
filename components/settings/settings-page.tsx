"use client";

import { type FormEvent, useId, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { TaggingCard } from "@/components/suggestions/tagging-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { ErrorText, Loading } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import {
	useConnectImmich,
	useDisconnectImmich,
	useImmichStatus,
} from "@/lib/client/immich";
import { useMe } from "@/lib/client/queries";

export function SettingsPage() {
	const me = useMe();
	return (
		<>
			<PageHeader title="Settings" />
			<div className="flex max-w-3xl flex-col gap-8">
				<ImmichCard />
				{me.data?.features.vision ? <TaggingCard /> : null}
			</div>
		</>
	);
}

function ImmichCard() {
	const id = useId();
	const me = useMe();
	const status = useImmichStatus(!!me.data?.features.immich);
	const connect = useConnectImmich();
	const disconnect = useDisconnectImmich();
	const [key, setKey] = useState("");
	function submit(e: FormEvent) {
		e.preventDefault();
		connect.mutate(key.trim(), { onSuccess: () => setKey("") });
	}
	return (
		<section
			aria-labelledby={`${id}-heading`}
			className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
		>
			<h2 id={`${id}-heading`} className="font-semibold">
				Immich
			</h2>
			{me.isPending ? (
				<Loading />
			) : me.isError ? (
				<ErrorText error={me.error} />
			) : !me.data.features.immich ? (
				<p className="text-sm text-muted">
					Immich is not enabled on this server.
				</p>
			) : status.isPending ? (
				<Loading />
			) : status.isError ? (
				<ErrorText error={status.error} />
			) : !status.data.enabled ? (
				<p className="text-sm text-muted">
					Immich is not enabled on this server.
				</p>
			) : (
				<>
					<p className="text-sm text-muted">
						{status.data.connected
							? `Connected as ${status.data.user?.name || status.data.user?.email || status.data.user?.id || "Immich user"}${status.data.user?.name && status.data.user?.email ? ` (${status.data.user.email})` : ""}`
							: "Not connected to Immich."}
					</p>
					<form onSubmit={submit} className="flex flex-col gap-4">
						<Field
							label="Immich API key"
							htmlFor={`${id}-key`}
							hint="Create an API key in Immich under Account Settings → API Keys. Grant user.read, asset.read and asset.view permissions."
						>
							<Input
								id={`${id}-key`}
								type="password"
								autoComplete="off"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								required
							/>
						</Field>
						<ErrorText error={connect.error} />
						<Button
							type="submit"
							variant="primary"
							className="self-start"
							disabled={connect.isPending || !key.trim()}
						>
							{connect.isPending
								? "Connecting…"
								: status.data.connected
									? "Replace key"
									: "Connect"}
						</Button>
					</form>
					{status.data.connected ? (
						<ConfirmDialog
							title="Disconnect Immich?"
							description="Photos you linked from Immich will stop loading until you reconnect."
							confirmLabel="Disconnect"
							onConfirm={() => disconnect.mutateAsync()}
							trigger={
								<Button variant="danger-ghost" className="self-start">
									Disconnect
								</Button>
							}
						/>
					) : null}
				</>
			)}
		</section>
	);
}
