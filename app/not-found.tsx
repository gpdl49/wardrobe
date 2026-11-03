import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export default function NotFound() {
	return (
		<>
			<PageHeader title="Not found" />
			<Link href="/" className="underline">
				Back to the catalogue
			</Link>
		</>
	);
}
