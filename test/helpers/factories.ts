import type { AnalysisDto, ItemDetailDto, LocationDto } from "@/lib/api/types";

const at = "2026-11-01T10:00:00.000Z";

export function itemDetail(
	overrides: Partial<ItemDetailDto> = {},
): ItemDetailDto {
	return {
		id: "item-1",
		name: "Navy coat",
		category: null,
		brand: null,
		size: null,
		colors: [],
		pattern: null,
		material: null,
		seasons: [],
		status: "active",
		location: null,
		notes: null,
		tags: [],
		coverPhoto: null,
		createdAt: at,
		updatedAt: at,
		photos: [],
		movements: [],
		analyses: [],
		...overrides,
	};
}

export function analysis(overrides: Partial<AnalysisDto> = {}): AnalysisDto {
	return {
		id: "an-1",
		itemId: "item-1",
		photoId: null,
		kind: "vision",
		model: "test/vision",
		status: "done",
		result: null,
		error: null,
		appliedAt: null,
		createdAt: at,
		updatedAt: at,
		...overrides,
	};
}

export function location(overrides: Partial<LocationDto> = {}): LocationDto {
	return {
		id: "loc-1",
		kind: "bag",
		code: "B-01",
		name: "Winter bag",
		notes: null,
		parentId: null,
		archivedAt: null,
		createdAt: at,
		updatedAt: at,
		itemCount: 0,
		...overrides,
	};
}
