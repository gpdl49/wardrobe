import SwiftUI
import WardrobeKit

/// Form for creating or editing a location.
struct LocationFormView: View {
	@Environment(AppModel.self) private var model
	@Environment(\.dismiss) private var dismiss

	let location: LocationDTO?
	let ownerId: ID?
	let defaultParentId: ID?
	let lockParent: Bool
	let onSaved: (LocationDTO) -> Void
	let onCancel: () -> Void

	@State private var kind: LocationKind
	@State private var code: String
	@State private var name: String
	@State private var notes: String
	@State private var parentId: ID?

	@State private var availableParents: [LocationDTO] = []
	@State private var isSaving = false
	@State private var errorMessage: String?

	init(
		location: LocationDTO? = nil,
		ownerId: ID? = nil,
		defaultParentId: ID? = nil,
		lockParent: Bool = false,
		onSaved: @escaping (LocationDTO) -> Void,
		onCancel: @escaping () -> Void = {}
	) {
		self.location = location
		self.ownerId = ownerId
		self.defaultParentId = defaultParentId
		self.lockParent = lockParent
		self.onSaved = onSaved
		self.onCancel = onCancel

		_kind = State(initialValue: location?.kind ?? .bag)
		_code = State(initialValue: location?.code ?? "")
		_name = State(initialValue: location?.name ?? "")
		_notes = State(initialValue: location?.notes ?? "")
		_parentId = State(initialValue: location?.parentId ?? defaultParentId)
	}

	private var isEditing: Bool { location != nil }

	private var isCodeValid: Bool {
		normalizeLocationCode(code) != nil
	}

	private var canSave: Bool {
		isCodeValid && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
	}

	private var excludedParentIds: Set<ID> {
		guard let location else { return [] }
		return subtreeIds(locations: availableParents, id: location.id)
	}

	var body: some View {
		NavigationStack {
			Form {
				Section("Location Details") {
					Picker("Kind", selection: $kind) {
						ForEach(LocationKind.known, id: \.self) { k in
							Label(k.label, systemImage: k.symbolName).tag(k)
						}
					}
					.onChange(of: kind) { oldKind, newKind in
						if !isEditing && (code.isEmpty || code.contains("-")) {
							let codes = availableParents.map(\.code)
							let usesDefaultName = name.isEmpty || name == defaultName(kind: oldKind, code: code)
							code = nextFreeCode(from: codes, kind: newKind)
							if usesDefaultName {
								name = defaultName(kind: newKind, code: code)
							}
						}
					}

					VStack(alignment: .leading, spacing: 4) {
						TextField("Code (e.g. B-07)", text: $code)
							.font(.body.monospaced())
							.textInputAutocapitalization(.characters)
							.autocorrectionDisabled()
							.onChange(of: code) { _, newCode in
								let upper = newCode.uppercased()
								if upper != newCode { code = upper }
							}
						if !code.isEmpty && !isCodeValid {
							Text("Must be 1-32 letters, numbers or hyphens, starting with a letter or number")
								.font(.caption2)
								.foregroundStyle(.red)
						}
					}

					TextField("Name", text: $name)
				}

				Section("Placement") {
					if lockParent {
						HStack {
							Text("Inside")
							Spacer()
							Text(parentName(for: parentId))
								.foregroundStyle(.secondary)
						}
					} else {
						Picker("Inside", selection: $parentId) {
							Text("None (top-level)").tag(ID?.none)
							ForEach(availableParents.filter { !excludedParentIds.contains($0.id) }) { parent in
								Text("\(parent.code) — \(parent.name)").tag(ID?.some(parent.id))
							}
						}
					}
				}

				Section("Notes") {
					TextField("Notes", text: $notes, axis: .vertical)
						.lineLimit(3...6)
				}
			}
			.navigationTitle(isEditing ? "Edit Location" : "New Location")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") {
						onCancel()
						dismiss()
					}
				}
				ToolbarItem(placement: .confirmationAction) {
					Button(isEditing ? "Save" : "Create") {
						Task { await save() }
					}
					.disabled(!canSave)
				}
			}
			.errorAlert($errorMessage)
			.task {
				await loadParents()
			}
		}
	}

	private func parentName(for id: ID?) -> String {
		guard let id, let found = availableParents.first(where: { $0.id == id }) else {
			return "None"
		}
		return "\(found.code) — \(found.name)"
	}

	private func loadParents() async {
		let effectiveOwner = location?.ownerId ?? ownerId ?? model.me?.id
		do {
			let list = try await model.api.locations(LocationQuery(owner: effectiveOwner, archived: true))
			availableParents = list
			if !isEditing && code.isEmpty {
				code = nextFreeCode(from: list.map(\.code), kind: kind)
				if name.isEmpty {
					name = defaultName(kind: kind, code: code)
				}
			}
		}
		catch { errorMessage = model.message(for: error) }
	}

	private func save() async {
		guard let normalized = normalizeLocationCode(code) else { return }
		let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmedName.isEmpty else { return }

		isSaving = true
		defer { isSaving = false }

		let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)

		do {
			if let location {
				var request = UpdateLocationRequest()
				if kind != location.kind { request.kind = kind }
				if normalized != location.code { request.code = normalized }
				if trimmedName != location.name { request.name = trimmedName }
				if trimmedNotes != (location.notes ?? "") {
					request.notes = trimmedNotes.isEmpty ? .null : .value(trimmedNotes)
				}
				if !lockParent && parentId != location.parentId {
					request.parentId = parentId == nil ? .null : .value(parentId!)
				}

				let updated = try await model.api.updateLocation(id: location.id, request)
				onSaved(updated)
				dismiss()
			} else {
				let request = CreateLocationRequest(
					kind: kind,
					code: normalized,
					name: trimmedName,
					notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
					parentId: parentId,
					ownerId: ownerId ?? model.me?.id
				)
				let created = try await model.api.createLocation(request)
				onSaved(created)
				dismiss()
			}
		} catch {
			errorMessage = model.message(for: error)
		}
	}
}
