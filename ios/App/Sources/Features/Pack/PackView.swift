import PhotosUI
import SwiftUI
import WardrobeKit

/// Pack tab root: choose/scan a container, then enter rapid capture.
struct PackView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(UploadQueue.self) private var uploads
	@Environment(Router.self) private var router
	@Environment(\.horizontalSizeClass) private var horizontalSizeClass

	@State private var model: PackModel?
	@State private var cropPhotos = false
	@State private var pendingCrop: PendingPhoto?

	var body: some View {
		Group {
			if let model {
				packContent(model)
			} else {
				ProgressView("Loading…")
			}
		}
		.task(id: appModel.me?.sub) {
			if let me = appModel.me {
				let packModel = PackModel(
					api: appModel.api,
					uploads: uploads,
					userSub: me.sub,
					ownerId: appModel.scope?.ownerId
				)
				packModel.appModel = appModel
				self.model = packModel
				await packModel.loadInitialData()
			}
		}
	}

	@ViewBuilder
	private func packContent(_ model: PackModel) -> some View {
		switch model.phase {
		case .loading:
			ProgressView("Loading…")
				.navigationTitle("Pack")

		case .resuming(let active):
			resumingView(model, active: active)
				.navigationTitle("Resume Packing")

		case .chooseLocation:
			PackLocationPickerView(
				title: "Pack",
				subtitle: "Which bag or suitcase are you packing?",
				locations: model.locations,
				preferKinds: LocationKind.packContainers,
				onSelect: { loc in
					model.chooseLocation(loc)
				},
				onScanTap: {
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

		case .starting(let location, _):
			startingView(model, location: location)
				.navigationTitle("Starting…")
				.errorAlert(Bindable(model).errorMessage)

		case .capturing(let active):
			captureView(model, active: active)
				.navigationBarBackButtonHidden(true)
				.sheet(isPresented: Bindable(model).showExistingItemSearch) {
					AddExistingItemSheet(
						api: appModel.api,
						ownerId: appModel.scope?.ownerId,
						location: active.location,
						sessionId: active.session.id,
						onAdded: { item in
							model.addedExistingItems.append(item)
						}
					)
				}
				.fullScreenCover(item: $pendingCrop) { photo in
					PhotoCropView(data: photo.data) { data in
						if photo.isLabel { model.captureLabelPhoto(data: data) }
						else { model.capturePhoto(data: data) }
					}
				}
				.errorAlert(Bindable(model).errorMessage)

		case .summary(let sessionId):
			SessionSummaryView(sessionId: sessionId)
				.toolbar {
					ToolbarItem(placement: .cancellationAction) {
						Button("Pack Another") {
							model.resetToChoose()
						}
					}
				}
		}
	}

	// MARK: - Resuming View

	@ViewBuilder
	private func resumingView(_ model: PackModel, active: ActiveSession) -> some View {
		VStack(spacing: 24) {
			Spacer()

			Image(systemName: "shippingbox.and.arrow.backward")
				.font(.system(size: 64))
				.foregroundStyle(Color.accentColor)

			VStack(spacing: 8) {
				Text("Packing in Progress")
					.font(.title2.weight(.bold))

				Text("A session for \(active.location.code) (\(active.location.name)) was interrupted.")
					.font(.subheadline)
					.foregroundStyle(.secondary)
					.multilineTextAlignment(.center)
					.padding(.horizontal)
			}

			VStack(spacing: 12) {
				Button {
					model.resumeActiveSession(active)
				} label: {
					Text("Resume Packing")
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

	// MARK: - Starting View

	@ViewBuilder
	private func startingView(_ model: PackModel, location: LocationRef) -> some View {
		VStack(spacing: 20) {
			Spacer()

			if model.isStarting {
				ProgressView()
					.controlSize(.large)
				Text("Starting to pack \(location.code)…")
					.font(.headline)
			} else if let error = model.errorMessage {
				Image(systemName: "exclamationmark.triangle.fill")
					.font(.system(size: 48))
					.foregroundStyle(.yellow)

				Text("Could not start session")
					.font(.headline)

				Text(error)
					.font(.subheadline)
					.foregroundStyle(.secondary)
					.multilineTextAlignment(.center)
					.padding(.horizontal)

				HStack(spacing: 16) {
					Button("Try Again") {
						Task { await model.retryStart() }
					}
					.buttonStyle(.borderedProminent)

					Button("Pick Another") {
						model.cancelStart()
					}
					.buttonStyle(.bordered)
				}
			}

			Spacer()
		}
		.padding()
	}

	// MARK: - Capture View

	@ViewBuilder
	private func captureView(_ model: PackModel, active: ActiveSession) -> some View {
		let isIPadRegular = horizontalSizeClass == .regular

		Group {
			if isIPadRegular {
				ipadCaptureLayout(model, active: active)
			} else {
				iphoneCaptureLayout(model, active: active)
			}
		}
		.toolbar {
			ToolbarItem(placement: .topBarLeading) {
				VStack(alignment: .leading, spacing: 1) {
					Text("Packing into")
						.font(.caption2)
						.foregroundStyle(.secondary)
					HStack(spacing: 4) {
						Text(active.location.code)
							.font(.subheadline.monospaced().weight(.bold))
						Text(active.location.name)
							.font(.subheadline)
							.foregroundStyle(.secondary)
					}
				}
			}

			ToolbarItem(placement: .topBarTrailing) {
				HStack(spacing: 8) {
					Toggle(isOn: $cropPhotos) { Label("Crop photos", systemImage: "crop") }.toggleStyle(.button)
						.labelStyle(.iconOnly)
						.accessibilityHint("Choose whether to crop each photo before upload")
					Button {
						model.showExistingItemSearch = true
					} label: {
						Label("Add Existing", systemImage: "magnifyingglass")
					}

					Button {
						Task {
							await model.finishPacking()
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
	}

	// MARK: - iPhone Layout

	@ViewBuilder
	private func iphoneCaptureLayout(_ model: PackModel, active: ActiveSession) -> some View {
		let captures = model.sessionCaptures(sessionId: active.session.id)

		VStack(spacing: 0) {
			// Camera viewport
			CameraCaptureView { photoData in
				acceptPhoto(photoData, model: model)
			}
			.frame(maxHeight: .infinity)
			.clipped()

			// Bottom control deck
			VStack(spacing: 12) {
				// Captures thumbnail strip
				if !captures.isEmpty {
					capturesStrip(model, captures: captures)
				}

				// Selected item editor
				if let selectedId = model.selectedJobId,
					let selectedJob = captures.first(where: { $0.id == selectedId })
				{
					selectedItemEditor(model, job: selectedJob)
				}

				// Shutter control & stats
				HStack {
					VStack(alignment: .leading, spacing: 2) {
						Text("\(captures.count + model.addedExistingItems.count) items")
							.font(.headline)
						let pending = captures.filter { $0.phase != .done && $0.phase != .failed }.count
						if pending > 0 {
							Text("\(pending) uploading")
								.font(.caption)
								.foregroundStyle(.secondary)
						}
					}

					Spacer()

					PhotosPicker(selection: Binding(
						get: { nil },
						set: { item in
							guard let item else { return }
							Task {
								if let data = try? await item.loadTransferable(type: Data.self) {
									acceptPhoto(data, model: model)
								}
							}
						}
					), matching: .images) {
						Image(systemName: "photo.badge.plus")
							.font(.title2)
							.frame(width: 44, height: 44)
							.background(Color(.secondarySystemFill))
							.clipShape(Circle())
					}
					.accessibilityLabel("Pick photo from library")

					PhotosPicker(selection: Binding(
						get: { nil },
						set: { item in
							guard let item else { return }
							Task {
								if let data = try? await item.loadTransferable(type: Data.self) {
									acceptPhoto(data, model: model, isLabel: true)
								}
							}
						}
					), matching: .images) {
						Image(systemName: "tag")
							.font(.title3)
							.frame(width: 44, height: 44)
							.background(Color(.secondarySystemFill))
							.clipShape(Circle())
					}
					.accessibilityLabel("Add care label photo")
					.disabled(model.selectedJobId == nil)
				}
				.padding(.horizontal)
				.padding(.bottom, 8)
			}
			.background(Color(.systemBackground))
		}
	}

	// MARK: - iPad Layout

	@ViewBuilder
	private func ipadCaptureLayout(_ model: PackModel, active: ActiveSession) -> some View {
		let captures = model.sessionCaptures(sessionId: active.session.id)

		HStack(spacing: 0) {
			// Left side: camera viewport
			ZStack(alignment: .bottom) {
				CameraCaptureView { photoData in
					acceptPhoto(photoData, model: model)
				}
				.frame(maxWidth: .infinity, maxHeight: .infinity)

				// Bottom camera bar
				HStack {
					VStack(alignment: .leading, spacing: 2) {
						Text("\(captures.count + model.addedExistingItems.count) items packed")
							.font(.headline)
							.foregroundStyle(.white)
					}

					Spacer()

					PhotosPicker(selection: Binding(
						get: { nil },
						set: { item in
							guard let item else { return }
							Task {
								if let data = try? await item.loadTransferable(type: Data.self) {
									acceptPhoto(data, model: model)
								}
							}
						}
					), matching: .images) {
						Label("Library", systemImage: "photo.on.rectangle")
							.padding(.horizontal, 14)
							.padding(.vertical, 8)
							.background(.ultraThinMaterial)
							.foregroundStyle(.white)
							.clipShape(Capsule())
					}
				}
				.padding()
				.background(LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom))
			}

			Divider()

			// Right side: details and captures
			VStack(spacing: 16) {
				if !captures.isEmpty {
					capturesStrip(model, captures: captures)
						.padding(.top, 8)
				}

				if let selectedId = model.selectedJobId,
					let selectedJob = captures.first(where: { $0.id == selectedId })
				{
					selectedItemEditor(model, job: selectedJob)
						.padding(.horizontal)
				} else {
					ContentUnavailableView(
						"No Item Selected",
						systemImage: "camera",
						description: Text("Snap clothes with the camera to start packing.")
					)
				}

				Spacer()

				// Status overview
				let pending = captures.filter { $0.phase != .done && $0.phase != .failed }.count
				let failed = captures.filter { $0.phase == .failed }.count
				if failed > 0 {
					HStack {
						Text("\(failed) uploads failed")
							.font(.subheadline)
							.foregroundStyle(.red)
						Spacer()
						Button("Retry All") {
							for job in captures where job.phase == .failed {
								uploads.retry(jobId: job.id)
							}
						}
						.buttonStyle(.bordered)
					}
					.padding()
					.background(Color.red.opacity(0.1))
					.clipShape(RoundedRectangle(cornerRadius: 10))
					.padding(.horizontal)
				} else if pending > 0 {
					Text("\(pending) items uploading in background…")
						.font(.caption)
						.foregroundStyle(.secondary)
				}
			}
			.frame(width: 360)
			.background(Color(.systemGroupedBackground))
		}
	}

	private func acceptPhoto(_ data: Data, model: PackModel, isLabel: Bool = false) {
		if cropPhotos { pendingCrop = PendingPhoto(data: data, isLabel: isLabel) }
		else if isLabel { model.captureLabelPhoto(data: data) }
		else { model.capturePhoto(data: data) }
	}

	// MARK: - Reusable Capture Components

	@ViewBuilder
	private func capturesStrip(_ model: PackModel, captures: [UploadJob]) -> some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 10) {
				ForEach(captures.reversed()) { job in
					let isSelected = job.id == model.selectedJobId
					Button {
						model.selectJob(job.id)
					} label: {
						ZStack(alignment: .bottomTrailing) {
							RoundedRectangle(cornerRadius: 10)
								.fill(Color(.secondarySystemFill))
								.frame(width: 64, height: 64)
								.overlay {
									Image(systemName: "tshirt")
										.font(.title2)
										.foregroundStyle(.secondary)
								}

							statusBadge(phase: job.phase)
								.padding(4)
						}
						.overlay(
							RoundedRectangle(cornerRadius: 10)
								.stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2.5)
						)
					}
					.accessibilityLabel("Captured item, \(job.phase.rawValue)")
				}
			}
			.padding(.horizontal)
			.padding(.vertical, 4)
		}
	}

	@ViewBuilder
	private func statusBadge(phase: UploadJob.Phase) -> some View {
		switch phase {
		case .waiting:
			Image(systemName: "clock.fill")
				.font(.caption2)
				.foregroundStyle(.secondary)
		case .running:
			ProgressView()
				.controlSize(.mini)
		case .failed:
			Image(systemName: "exclamationmark.circle.fill")
				.font(.caption2)
				.foregroundStyle(.red)
		case .done:
			Image(systemName: "checkmark.circle.fill")
				.font(.caption2)
				.foregroundStyle(.green)
		}
	}

	@ViewBuilder
	private func selectedItemEditor(_ model: PackModel, job: UploadJob) -> some View {
		VStack(alignment: .leading, spacing: 10) {
			HStack {
				TextField("Item name (optional)", text: Binding(
					get: { model.quickName },
					set: { model.updateQuickFields(name: $0, categoryId: model.quickCategoryId) }
				))
				.textFieldStyle(.roundedBorder)

				if job.phase == .failed {
					Button("Retry") {
						uploads.retry(jobId: job.id)
					}
					.buttonStyle(.bordered)
					.controlSize(.small)
				}
			}

			CategoryChipsView(
				categories: model.categories,
				selection: Binding(
					get: { model.quickCategoryId },
					set: { model.updateQuickFields(name: model.quickName, categoryId: $0) }
				)
			)
		}
		.padding(.horizontal)
	}
}

#Preview {
	let model = AppModel.preview()
	NavigationStack {
		PackView()
			.environment(model)
			.environment(model.uploads)
			.environment(model.router)
	}
}

private struct PendingPhoto: Identifiable {
	let id = UUID()
	let data: Data
	let isLabel: Bool
}
