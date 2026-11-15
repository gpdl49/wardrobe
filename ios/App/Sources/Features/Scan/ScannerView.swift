import AVFoundation
import SwiftUI
#if canImport(VisionKit)
import VisionKit
#endif
import WardrobeKit

/// Full-screen QR scanner (VisionKit) with a manual-code fallback (WP6).
/// Calls `onScan` once with the raw payload, `onCancel` when dismissed.
public struct ScannerView: View {
	@Environment(AppModel.self) private var model
	@Environment(\.dismiss) private var dismiss

	public var onScan: (String) -> Void
	public var onCancel: () -> Void = {}

	@State private var scanModel = ScanModel()
	@State private var isCameraAvailable: Bool = false
	@State private var showManualFallback: Bool = false
	@State private var cameraPermissionChecked: Bool = false

	public init(onScan: @escaping (String) -> Void, onCancel: @escaping () -> Void = {}) {
		self.onScan = onScan
		self.onCancel = onCancel
	}

	public var body: some View {
		NavigationStack {
			ZStack {
				#if canImport(VisionKit)
				if isCameraAvailable && !showManualFallback {
					DataScannerRepresentable { payload in
						handleScan(payload)
					}
					.ignoresSafeArea(edges: .bottom)

					// Guidance overlay
					VStack {
						Text("Point camera at a Wardrobe QR label")
							.font(.subheadline.weight(.medium))
							.padding(.horizontal, 16)
							.padding(.vertical, 8)
							.background(.ultraThinMaterial)
							.clipShape(Capsule())
							.padding(.top, 24)

						Spacer()

						Button {
							showManualFallback = true
						} label: {
							Label("Enter code manually", systemImage: "keyboard")
								.padding(.horizontal, 16)
								.padding(.vertical, 10)
								.background(.ultraThinMaterial)
								.clipShape(Capsule())
						}
						.padding(.bottom, 32)
					}
				} else {
					manualEntryView
				}
				#else
				manualEntryView
				#endif
			}
			.navigationTitle("Scan Location")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") {
						onCancel()
						dismiss()
					}
				}
				if isCameraAvailable && showManualFallback {
					ToolbarItem(placement: .primaryAction) {
						Button("Use Camera") {
							showManualFallback = false
						}
					}
				}
			}
			.task {
				checkAvailability()
			}
		}
	}

	private var manualEntryView: some View {
		VStack(spacing: 24) {
			ContentUnavailableView {
				Label("Enter Location Code", systemImage: "qrcode.viewfinder")
			} description: {
				Text("Camera scanning is unavailable. Type a location code from your wardrobe (e.g. B-07) or paste a Wardrobe label URL.")
			}

			VStack(spacing: 16) {
				TextField("Code (e.g. B-07)", text: $scanModel.manualInput)
					.font(.title2.monospaced())
					.multilineTextAlignment(.center)
					.textInputAutocapitalization(.characters)
					.autocorrectionDisabled()
					.padding()
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 12))

				if let err = scanModel.errorMessage {
					Text(err)
						.font(.subheadline)
						.foregroundStyle(.red)
				}

				HStack(spacing: 12) {
					Button {
						pasteFromClipboard()
					} label: {
						Label("Paste", systemImage: "doc.on.clipboard")
							.frame(maxWidth: .infinity)
					}
					.buttonStyle(.bordered)
					.controlSize(.large)

					Button {
						submitManual()
					} label: {
						Text("Submit")
							.bold()
							.frame(maxWidth: .infinity)
					}
					.buttonStyle(.borderedProminent)
					.controlSize(.large)
				}
			}
			.padding(.horizontal, 32)

			Spacer()
		}
		.padding(.top, 24)
	}

	private func checkAvailability() {
		#if canImport(VisionKit)
		let supported = DataScannerViewController.isSupported
		let available = DataScannerViewController.isAvailable
		let authStatus = AVCaptureDevice.authorizationStatus(for: .video)

		if supported && available && (authStatus == .authorized || authStatus == .notDetermined) {
			if authStatus == .notDetermined {
				AVCaptureDevice.requestAccess(for: .video) { granted in
					Task { @MainActor in
						self.isCameraAvailable = granted
						self.showManualFallback = !granted
					}
				}
			} else {
				self.isCameraAvailable = true
				self.showManualFallback = false
			}
		} else {
			self.isCameraAvailable = false
			self.showManualFallback = true
		}
		#else
		self.isCameraAvailable = false
		self.showManualFallback = true
		#endif
	}

	private func handleScan(_ payload: String) {
		guard scanModel.recordScan() else { return }
		onScan(payload)
		dismiss()
	}

	private func submitManual() {
		guard let result = scanModel.processInput(baseURL: model.config.baseURL, ownerId: model.me?.id) else {
			return
		}
		handleScan(result)
	}

	private func pasteFromClipboard() {
		if let string = UIPasteboard.general.string {
			scanModel.manualInput = string.trimmingCharacters(in: .whitespacesAndNewlines)
		}
	}
}

// MARK: - VisionKit Representable

#if canImport(VisionKit)
struct DataScannerRepresentable: UIViewControllerRepresentable {
	let onScan: (String) -> Void

	func makeUIViewController(context: Context) -> DataScannerViewController {
		let scanner = DataScannerViewController(
			recognizedDataTypes: [.barcode(symbologies: [.qr])],
			qualityLevel: .balanced,
			recognizesMultipleItems: false,
			isGuidanceEnabled: true,
			isHighlightingEnabled: true
		)
		scanner.delegate = context.coordinator
		try? scanner.startScanning()
		return scanner
	}

	func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

	static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
		uiViewController.stopScanning()
	}

	func makeCoordinator() -> Coordinator {
		Coordinator(onScan: onScan)
	}

	final class Coordinator: NSObject, DataScannerViewControllerDelegate {
		let onScan: (String) -> Void
		private var handled = false

		init(onScan: @escaping (String) -> Void) {
			self.onScan = onScan
		}

		func dataScanner(
			_ dataScanner: DataScannerViewController,
			didAdd addedItems: [RecognizedItem],
			allItems: [RecognizedItem]
		) {
			guard !handled else { return }
			for item in addedItems {
				if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue {
					handled = true
					Task { @MainActor in
						self.onScan(payload)
					}
					break
				}
			}
		}
	}
}
#endif

#Preview {
	ScannerView(onScan: { _ in })
		.environment(AppModel.preview())
}

