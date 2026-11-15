import { Suspense } from "react";
import { NewOutfit } from "@/components/outfits/outfit-form";
export default function Page() {
	return (
		<Suspense>
			<NewOutfit />
		</Suspense>
	);
}
