import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit
import WardrobeKit

// MARK: - QR Generator

/// Generates a sharp UIImage QR code using CoreImage `CIQRCodeGenerator`.
public enum QRCodeGenerator {
	private static let context = CIContext()

	public static func generateQRCode(from url: URL, targetSize: CGFloat = 400) -> UIImage? {
		let filter = CIFilter.qrCodeGenerator()
		filter.message = Data(url.absoluteString.utf8)
		filter.correctionLevel = "M"

		guard let outputImage = filter.outputImage else { return nil }

		let scale = targetSize / max(outputImage.extent.size.width, 1)
		let transformed = outputImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

		guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else { return nil }
		return UIImage(cgImage: cgImage)
	}
}

// MARK: - Printable Card View

/// Visual layout of the physical label containing the QR code, location code, and location name.
struct LocationLabelCardView: View {
	let location: LocationDTO
	let qrImage: UIImage?

	var body: some View {
		VStack(spacing: 20) {
			if let qrImage {
				Image(uiImage: qrImage)
					.interpolation(.none)
					.resizable()
					.scaledToFit()
					.frame(width: 200, height: 200)
			} else {
				Rectangle()
					.fill(.quaternary)
					.frame(width: 200, height: 200)
					.overlay { ProgressView() }
			}

			VStack(spacing: 4) {
				Text(location.code)
					.font(.system(.title, design: .monospaced, weight: .bold))
					.foregroundStyle(.primary)

				if location.name != location.code {
					Text(location.name)
						.font(.headline)
						.foregroundStyle(.secondary)
				}
			}

			Text("Wardrobe")
				.font(.caption2.weight(.semibold))
				.textCase(.uppercase)
				.foregroundStyle(.tertiary)
				.tracking(1.5)
		}
		.padding(28)
		.background(Color.white)
		.clipShape(RoundedRectangle(cornerRadius: 16))
		.overlay(
			RoundedRectangle(cornerRadius: 16)
				.stroke(Color.gray.opacity(0.3), lineWidth: 1)
		)
	}
}

// MARK: - Sheet

/// Displays a QR label sheet for a location with options to share, save to Photos, or print.
struct LocationLabelSheet: View {
	@Environment(\.dismiss) private var dismiss

	let location: LocationDTO
	let baseURL: URL

	@State private var qrImage: UIImage?
	@State private var renderedLabel: UIImage?
	@State private var showSavedAlert = false

	private var labelURL: URL {
		DeepLink.labelURL(ownerId: location.ownerId, code: location.code, baseURL: baseURL)
	}

	var body: some View {
		NavigationStack {
			VStack(spacing: 24) {
				Spacer()

				LocationLabelCardView(location: location, qrImage: qrImage)
					.shadow(color: .black.opacity(0.08), radius: 10, y: 4)

				Spacer()

				VStack(spacing: 12) {
					HStack(spacing: 16) {
						if let renderedLabel {
							ShareLink(
								item: Image(uiImage: renderedLabel),
								preview: SharePreview("Label \(location.code)", image: Image(uiImage: renderedLabel))
							) {
								Label("Share", systemImage: "square.and.arrow.up")
									.frame(maxWidth: .infinity)
							}
							.buttonStyle(.bordered)
							.controlSize(.large)
						}

						Button {
							saveToPhotos()
						} label: {
							Label("Save", systemImage: "photo.badge.arrow.down")
								.frame(maxWidth: .infinity)
						}
						.buttonStyle(.bordered)
						.controlSize(.large)
						.disabled(renderedLabel == nil)

						Button {
							printLabel()
						} label: {
							Label("Print", systemImage: "printer")
								.frame(maxWidth: .infinity)
						}
						.buttonStyle(.borderedProminent)
						.controlSize(.large)
						.disabled(renderedLabel == nil)
					}
				}
				.padding(.horizontal)
				.padding(.bottom, 12)
			}
			.padding()
			.navigationTitle("QR Label")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .confirmationAction) {
					Button("Done") { dismiss() }
				}
			}
			.task {
				generateImages()
			}
			.alert("Saved to Photos", isPresented: $showSavedAlert) {
				Button("OK", role: .cancel) {}
			} message: {
				Text("The QR label for \(location.code) was saved to your Photos library.")
			}
		}
	}

	@MainActor
	private func generateImages() {
		let qr = QRCodeGenerator.generateQRCode(from: labelURL)
		self.qrImage = qr

		let card = LocationLabelCardView(location: location, qrImage: qr)
			.environment(\.colorScheme, .light)
		let renderer = ImageRenderer(content: card)
		renderer.scale = 3.0
		self.renderedLabel = renderer.uiImage
	}

	private func saveToPhotos() {
		guard let renderedLabel else { return }
		UIImageWriteToSavedPhotosAlbum(renderedLabel, nil, nil, nil)
		showSavedAlert = true
	}

	private func printLabel() {
		guard let renderedLabel else { return }
		let printController = UIPrintInteractionController.shared
		let printInfo = UIPrintInfo(dictionary: nil)
		printInfo.outputType = .general
		printInfo.jobName = "Wardrobe Label \(location.code)"
		printController.printInfo = printInfo
		printController.printingItem = renderedLabel
		printController.present(animated: true)
	}
}
