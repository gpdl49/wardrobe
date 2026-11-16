import SwiftUI
import WardrobeKit

/// A packing or unpacking session summary and the items moved in it.
struct SessionSummaryView: View {
	let sessionId: ID

	@Environment(AppModel.self) private var appModel
	@Environment(Router.self) private var router
	@Environment(\.horizontalSizeClass) private var horizontalSizeClass

	@State private var sessionDetail: PackingSessionDetailDTO?
	@State private var isLoading = true
	@State private var errorMessage: String?

	var body: some View {
		Group {
			if isLoading {
				ProgressView("Loading session summary…")
			} else if let session = sessionDetail {
				sessionContent(session)
			} else {
				ContentUnavailableView(
					"Session Not Found",
					systemImage: "shippingbox.and.arrow.backward",
					description: Text(errorMessage ?? "Could not load session details.")
				)
			}
		}
		.navigationTitle("Session Summary")
		.navigationBarTitleDisplayMode(.inline)
		.task(id: sessionId) {
			await loadSession()
		}
		.errorAlert($errorMessage)
	}

	@ViewBuilder
	private func sessionContent(_ session: PackingSessionDetailDTO) -> some View {
		let isIPad = horizontalSizeClass == .regular

		ScrollView {
			VStack(alignment: .leading, spacing: 20) {
				// Header Card
				VStack(alignment: .leading, spacing: 12) {
					HStack {
						Label(
							session.mode == .pack ? "Packed Container" : "Unpacked Container",
							systemImage: session.mode == .pack ? "arrow.down.to.line.compact" : "arrow.up.from.line.compact"
						)
						.font(.subheadline.weight(.semibold))
						.foregroundStyle(Color.accentColor)

						Spacer()

						if let duration = formattedDuration(from: session.startedAt, to: session.endedAt) {
							Label(duration, systemImage: "clock")
								.font(.caption)
								.foregroundStyle(.secondary)
						}
					}

					HStack(spacing: 8) {
						Image(systemName: session.location.kind.symbolName)
							.font(.title2)
							.foregroundStyle(Color.accentColor)

						VStack(alignment: .leading, spacing: 2) {
							Text(session.location.code)
								.font(.title3.monospaced().weight(.bold))
							Text(session.location.name)
								.font(.subheadline)
								.foregroundStyle(.secondary)
						}
					}

					Divider()

					HStack {
						Text("^[\(session.items.count) item](inflect: true) in this session")
							.font(.subheadline.weight(.medium))
							.foregroundStyle(.secondary)

						Spacer()

						Text(session.startedAt.formatted(date: .abbreviated, time: .shortened))
							.font(.caption)
							.foregroundStyle(.tertiary)
					}
				}
				.padding()
				.background(Color(.secondarySystemGroupedBackground))
				.clipShape(RoundedRectangle(cornerRadius: 16))

				// Items section
				Text("Items")
					.font(.headline)
					.padding(.horizontal, 4)

				if session.items.isEmpty {
					ContentUnavailableView(
						"No items recorded",
						systemImage: "tshirt",
						description: Text("No items were moved during this session.")
					)
					.padding(.vertical, 24)
				} else {
					LazyVGrid(
						columns: [GridItem(.adaptive(minimum: isIPad ? 160 : 110), spacing: 14)],
						spacing: 14
					) {
						ForEach(session.items) { item in
							Button {
								router.open(.item(item.id))
							} label: {
								VStack(alignment: .leading, spacing: 8) {
									RemotePhotoView(photo: item.coverPhoto, variant: .thumb)
										.aspectRatio(1, contentMode: .fill)
										.frame(maxWidth: .infinity)
										.background(Color(.secondarySystemFill))
										.clipShape(RoundedRectangle(cornerRadius: 12))

									VStack(alignment: .leading, spacing: 2) {
										Text(item.name ?? item.category?.name ?? "Unnamed").opacity(item.nameGenerated == true ? 0.6 : 1)
											.font(.subheadline.weight(.semibold))
											.lineLimit(1)
											.foregroundStyle(.primary)

										if let brand = item.brand {
											Text(brand)
												.font(.caption)
												.foregroundStyle(.secondary)
												.lineLimit(1)
										}
									}
									.padding(.horizontal, 2)
								}
								.contentShape(Rectangle())
							}
							.buttonStyle(.plain)
							.accessibilityLabel("View item \(item.name ?? "")")
						}
					}
				}
			}
			.padding()
		}
		.background(Color(.systemGroupedBackground))
	}

	private func loadSession() async {
		isLoading = true
		errorMessage = nil
		do {
			let detail = try await appModel.api.session(id: sessionId)
			sessionDetail = detail
			isLoading = false
		} catch {
			isLoading = false
			errorMessage = appModel.message(for: error)
		}
	}

	private func formattedDuration(from start: Date, to end: Date?) -> String? {
		let endDate = end ?? .now
		let seconds = max(0, Int(endDate.timeIntervalSince(start)))
		if seconds < 60 {
			return "\(seconds)s"
		}
		let minutes = seconds / 60
		if minutes < 60 {
			return "\(minutes) min"
		}
		let hours = minutes / 60
		let remainingMinutes = minutes % 60
		return "\(hours)h \(remainingMinutes)m"
	}
}

#Preview {
	NavigationStack {
		SessionSummaryView(sessionId: "00000000-0000-0000-0000-000000000001")
			.environment(AppModel.preview())
			.environment(Router())
	}
}
