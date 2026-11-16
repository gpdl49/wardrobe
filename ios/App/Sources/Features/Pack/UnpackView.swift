import SwiftUI
import WardrobeKit

/// Unpack tab root: choose/scan a container, multi-select items, and move them to closets/drawers.
struct UnpackView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(Router.self) private var router
	@Environment(\.horizontalSizeClass) private var horizontalSizeClass

	@State private var model: UnpackModel?

	var body: some View {
		Group {
			if let model {
				unpackContent(model)
			} else {
				ProgressView("Loading…")
			}
		}
		.task(id: appModel.me?.sub) {
			if let me = appModel.me {
				let unpackModel = UnpackModel(
					api: appModel.api,
					userSub: me.sub,
					ownerId: appModel.scope?.ownerId
				)
				unpackModel.appModel = appModel
				self.model = unpackModel
				await unpackModel.loadInitialData()
			}
		}
	}

	@ViewBuilder
	private func unpackContent(_ model: UnpackModel) -> some View {
		switch model.phase {
		case .loading:
			ProgressView("Loading…")
				.navigationTitle("Unpack")

		case .resuming(let active):
			resumingView(model, active: active)
				.navigationTitle("Resume Unpacking")

		case .chooseSource:
			PackLocationPickerView(
				title: "Unpack",
				subtitle: "Which bag or suitcase are you unpacking?",
				locations: model.sourceLocations,
				preferKinds: [.bag, .suitcase],
				onSelect: { loc in
					Task { await model.chooseSourceLocation(loc) }
				},
				onScanTap: {
					model.scannerTarget = .source
					model.showScanner = true
				}
			)
			.sheet(isPresented: Bindable(model).showScanner) {
				ScannerView(
					onScan: { raw in
						Task {
							await model.resolveScannedCode(raw, baseURL: appModel.config.baseURL)
						}
					},
					onCancel: {
						model.showScanner = false
					}
				)
			}
			.errorAlert(Bindable(model).errorMessage)

		case .unpacking(let source):
			unpackingView(model, source: source)
				.navigationBarBackButtonHidden(true)
				.sheet(isPresented: Bindable(model).isChoosingDestination) {
					destinationPickerSheet(model, source: source)
				}
				.sheet(isPresented: Bindable(model).showScanner) {
					ScannerView(
						onScan: { raw in
							Task {
								await model.resolveScannedCode(raw, baseURL: appModel.config.baseURL)
							}
						},
						onCancel: {
							model.showScanner = false
						}
					)
				}
				.errorAlert(Bindable(model).errorMessage)

		case .summary(let sessionId):
			SessionSummaryView(sessionId: sessionId)
				.toolbar {
					ToolbarItem(placement: .cancellationAction) {
						Button("Unpack Another") {
							model.resetToChoose()
						}
					}
				}
		}
	}

	// MARK: - Resuming View

	@ViewBuilder
	private func resumingView(_ model: UnpackModel, active: ActiveSession) -> some View {
		VStack(spacing: 24) {
			Spacer()

			Image(systemName: "shippingbox.and.arrow.backward")
				.font(.system(size: 64))
				.foregroundStyle(Color.accentColor)

			VStack(spacing: 8) {
				Text("Unpacking in Progress")
					.font(.title2.weight(.bold))

				Text("A session for \(active.location.code) (\(active.location.name)) was interrupted.")
					.font(.subheadline)
					.foregroundStyle(.secondary)
					.multilineTextAlignment(.center)
					.padding(.horizontal)
			}

			VStack(spacing: 12) {
				Button {
					Task { await model.resumeActiveSession(active) }
				} label: {
					Text("Resume Unpacking")
						.font(.headline)
						.frame(maxWidth: .infinity)
						.padding()
						.background(Color.accentColor)
						.foregroundStyle(.white)
						.clipShape(RoundedRectangle(cornerRadius: 14))
				}

				Button(role: .destructive) {
					Task { await model.discardActiveSession(active) }
				} label: {
					Text("Discard Session")
						.font(.headline)
						.frame(maxWidth: .infinity)
						.padding()
						.background(Color(.secondarySystemFill))
						.clipShape(RoundedRectangle(cornerRadius: 14))
				}
			}
			.padding(.horizontal, 32)

			Spacer()
		}
		.padding()
	}

	// MARK: - Unpacking Items View

	@ViewBuilder
	private func unpackingView(_ model: UnpackModel, source: LocationDetailDTO) -> some View {
		let all = model.items
		let allSelected = !all.isEmpty && model.selectedItemIds.count == all.count
		let isIPadRegular = horizontalSizeClass == .regular

		VStack(spacing: 0) {
			// Undo banner if last move exists
			if let lastMove = model.lastMove {
				undoBanner(model, source: source, lastMove: lastMove)
			}

			ScrollView {
				VStack(alignment: .leading, spacing: 16) {
					if all.isEmpty {
						ContentUnavailableView(
							"\(source.code) is empty",
							systemImage: "tray",
							description: Text("There are no items inside this container to unpack.")
						)
						.padding(.top, 40)
					} else {
						// Selection controls header
						HStack {
							Text("\(model.selectedItemIds.count) of \(all.count) selected")
								.font(.subheadline)
								.foregroundStyle(.secondary)

							Spacer()

							Button(allSelected ? "Select None" : "Select All") {
								if allSelected {
									model.selectNone()
								} else {
									model.selectAll()
								}
							}
							.font(.subheadline.weight(.semibold))
						}
						.padding(.horizontal)
						.padding(.top, 8)

						// Items Grid
						LazyVGrid(
							columns: [GridItem(.adaptive(minimum: isIPadRegular ? 140 : 105), spacing: 12)],
							spacing: 12
						) {
							ForEach(all) { item in
								itemTile(model, item: item)
							}
						}
						.padding(.horizontal)
						.padding(.bottom, 90)
					}
				}
			}

			// Floating bottom move button
			if !all.isEmpty {
				VStack {
					Button {
						Task {
							await model.prepareDestinationChoice()
						}
					} label: {
						HStack {
							Image(systemName: "arrow.right.circle.fill")
							Text(
								model.selectedItemIds.isEmpty
									? "Select items to move"
									: "Move \(model.selectedItemIds.count) item\(model.selectedItemIds.count == 1 ? "" : "s")…"
							)
						}
						.font(.headline)
						.frame(maxWidth: .infinity)
						.padding()
						.background(model.selectedItemIds.isEmpty ? Color(.secondarySystemFill) : Color.accentColor)
						.foregroundStyle(model.selectedItemIds.isEmpty ? Color.secondary : Color.white)
						.clipShape(RoundedRectangle(cornerRadius: 16))
					}
					.disabled(model.selectedItemIds.isEmpty || model.busy)
					.padding(.horizontal)
					.padding(.bottom, 8)
				}
				.background(.ultraThinMaterial)
			}
		}
		.toolbar {
			ToolbarItem(placement: .topBarLeading) {
				VStack(alignment: .leading, spacing: 1) {
					Text("Unpacking \(source.kind.label.lowercased())")
						.font(.caption2)
						.foregroundStyle(.secondary)
					HStack(spacing: 4) {
						Text(source.code)
							.font(.subheadline.monospaced().weight(.bold))
						Text(source.name)
							.font(.subheadline)
							.foregroundStyle(.secondary)
					}
				}
			}

			ToolbarItem(placement: .topBarTrailing) {
				Button {
					Task {
						await model.finishUnpacking()
					}
				} label: {
					if model.isFinishing {
						ProgressView()
							.controlSize(.small)
					} else {
						Text("Done")
							.font(.headline)
					}
				}
				.disabled(model.isFinishing)
			}
		}
	}

	@ViewBuilder
	private func itemTile(_ model: UnpackModel, item: ItemSummaryDTO) -> some View {
		let isSelected = model.selectedItemIds.contains(item.id)

		Button {
			model.toggleItemSelection(item.id)
		} label: {
			ZStack(alignment: .bottomLeading) {
				RemotePhotoView(photo: item.coverPhoto, variant: .thumb)
					.aspectRatio(1, contentMode: .fill)
					.frame(maxWidth: .infinity)
					.background(Color(.secondarySystemFill))
					.clipShape(RoundedRectangle(cornerRadius: 12))

				LinearGradient(
					colors: [.clear, .black.opacity(0.65)],
					startPoint: .center,
					endPoint: .bottom
				)
				.clipShape(RoundedRectangle(cornerRadius: 12))

				Text(item.name ?? item.category?.name ?? "Unnamed").opacity(item.nameGenerated == true ? 0.6 : 1)
					.font(.caption.weight(.medium))
					.foregroundStyle(.white)
					.lineLimit(1)
					.padding(8)

				if isSelected {
					VStack {
						HStack {
							Spacer()
							Image(systemName: "checkmark.circle.fill")
								.font(.title3)
								.foregroundStyle(Color.accentColor)
								.background(Circle().fill(.white))
								.padding(6)
						}
						Spacer()
					}
				}
			}
			.overlay(
				RoundedRectangle(cornerRadius: 12)
					.stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2.5)
			)
		}
		.buttonStyle(.plain)
		.accessibilityLabel("\(item.name ?? "Item"), \(isSelected ? "selected" : "not selected")")
	}

	@ViewBuilder
	private func undoBanner(
		_ model: UnpackModel,
		source: LocationDetailDTO,
		lastMove: (items: [ItemSummaryDTO], toLocation: LocationRef?)
	) -> some View {
		HStack {
			Image(systemName: "arrow.uturn.backward.circle.fill")
				.foregroundStyle(.green)

			if let to = lastMove.toLocation {
				Text("Moved \(lastMove.items.count) to **\(to.code)**")
					.font(.subheadline)
			} else {
				Text("Moved \(lastMove.items.count) out of container")
					.font(.subheadline)
			}

			Spacer()

			Button("Undo") {
				Task {
					await model.undoLastMove(source: source)
				}
			}
			.font(.subheadline.weight(.semibold))
			.disabled(model.busy)
		}
		.padding()
		.background(Color.green.opacity(0.12))
	}

	// MARK: - Destination Picker Sheet

	@ViewBuilder
	private func destinationPickerSheet(_ model: UnpackModel, source: LocationDetailDTO) -> some View {
		NavigationStack {
			List {
				Section {
					Button {
						Task {
							await model.moveSelectedItems(to: nil, source: source)
						}
					} label: {
						Label("No location (Unassigned)", systemImage: "tray.and.arrow.down")
							.font(.headline)
							.foregroundStyle(.primary)
					}
				}

				let preferred = model.destinationLocations.filter {
					$0.id != source.id && ($0.kind == .closet || $0.kind == .drawer)
				}
				let others = model.destinationLocations.filter {
					$0.id != source.id && $0.kind != .closet && $0.kind != .drawer
				}

				if !preferred.isEmpty {
					Section("Closets & Drawers") {
						ForEach(preferred) { loc in
							destinationRow(model, loc: loc, source: source)
						}
					}
				}

				if !others.isEmpty {
					Section("Other Locations") {
						ForEach(others) { loc in
							destinationRow(model, loc: loc, source: source)
						}
					}
				}
			}
			.navigationTitle("Move to…")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") {
						model.isChoosingDestination = false
					}
				}
				ToolbarItem(placement: .primaryAction) {
					Button {
						model.scannerTarget = .destination
						model.showScanner = true
					} label: {
						Label("Scan QR", systemImage: "qrcode.viewfinder")
					}
				}
			}
		}
	}

	@ViewBuilder
	private func destinationRow(_ model: UnpackModel, loc: LocationDTO, source: LocationDetailDTO) -> some View {
		let isViewOnly = loc.access == .view
		Button {
			if !isViewOnly {
				Task {
					await model.moveSelectedItems(to: loc, source: source)
				}
			}
		} label: {
			HStack(spacing: 12) {
				Image(systemName: loc.kind.symbolName)
					.font(.title3)
					.foregroundStyle(isViewOnly ? .secondary : Color.accentColor)
					.frame(width: 32)

				VStack(alignment: .leading, spacing: 2) {
					Text(loc.code)
						.font(.headline.monospaced())
						.foregroundStyle(isViewOnly ? .secondary : .primary)
					Text(loc.name)
						.font(.subheadline)
						.foregroundStyle(.secondary)
				}

				Spacer()

				if isViewOnly {
					Text("View only")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
			}
		}
		.disabled(isViewOnly)
	}
}

#Preview {
	let model = AppModel.preview()
	NavigationStack {
		UnpackView()
			.environment(model)
			.environment(model.uploads)
			.environment(model.router)
	}
}
