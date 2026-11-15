@preconcurrency import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

// MARK: - Camera Controller

@MainActor
final class CameraCaptureController: NSObject, ObservableObject {
	enum CameraStatus {
		case unconfigured
		case ready
		case unauthorized
		case unavailable
	}

	@Published var status: CameraStatus = .unconfigured
	@Published var isCapturing = false

	/// Owned exclusively by `sessionQueue` (Apple's AVCapture threading model).
	nonisolated(unsafe) private let captureSession = AVCaptureSession()
	nonisolated private let sessionQueue = DispatchQueue(label: "xyz.vidur.wardrobe.camera.session")
	nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()

	var session: AVCaptureSession { captureSession }
	private var captureContinuation: CheckedContinuation<Data?, Never>?

	override init() {
		super.init()
		checkPermissionsAndConfigure()
	}

	func checkPermissionsAndConfigure() {
		#if targetEnvironment(simulator)
		status = .unavailable
		#else
		switch AVCaptureDevice.authorizationStatus(for: .video) {
		case .authorized:
			configureSession()
		case .notDetermined:
			AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
				Task { @MainActor [weak self] in
					if granted {
						self?.configureSession()
					} else {
						self?.status = .unauthorized
					}
				}
			}
		case .denied, .restricted:
			status = .unauthorized
		@unknown default:
			status = .unavailable
		}
		#endif
	}

	private func configureSession() {
		sessionQueue.async { [weak self] in
			guard let self else { return }
			self.captureSession.beginConfiguration()
			self.captureSession.sessionPreset = .photo

			guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
				let input = try? AVCaptureDeviceInput(device: device)
			else {
				self.captureSession.commitConfiguration()
				Task { @MainActor in
					self.status = .unavailable
				}
				return
			}

			if self.captureSession.canAddInput(input) {
				self.captureSession.addInput(input)
			}

			if self.captureSession.canAddOutput(self.photoOutput) {
				self.captureSession.addOutput(self.photoOutput)
			}

			self.captureSession.commitConfiguration()
			self.captureSession.startRunning()
			Task { @MainActor in
				self.status = .ready
			}
		}
	}

	func stopSession() {
		sessionQueue.async { [weak self] in
			guard let self, self.captureSession.isRunning else { return }
			self.captureSession.stopRunning()
		}
	}

	func capturePhoto() async -> Data? {
		guard status == .ready, !isCapturing else { return nil }
		isCapturing = true
		defer { isCapturing = false }

		return await withCheckedContinuation { continuation in
			self.captureContinuation = continuation
			// AVCapturePhotoOutput is used on the session queue, as Apple's
			// AVCam sample does; neither object is touched elsewhere meanwhile.
			nonisolated(unsafe) let settings = AVCapturePhotoSettings()
			nonisolated(unsafe) let output = self.photoOutput
			self.sessionQueue.async {
				output.capturePhoto(with: settings, delegate: self)
			}
		}
	}
}

extension CameraCaptureController: AVCapturePhotoCaptureDelegate {
	nonisolated func photoOutput(
		_ output: AVCapturePhotoOutput,
		didFinishProcessingPhoto photo: AVCapturePhoto,
		error: (any Error)?
	) {
		let data = photo.fileDataRepresentation()
		Task { @MainActor in
			self.captureContinuation?.resume(returning: data)
			self.captureContinuation = nil
		}
	}
}

// MARK: - Camera Preview Layer

struct CameraPreviewView: UIViewRepresentable {
	let session: AVCaptureSession

	func makeUIView(context: Context) -> CameraPreviewUIView {
		let view = CameraPreviewUIView()
		view.previewLayer.session = session
		view.previewLayer.videoGravity = .resizeAspectFill
		return view
	}

	func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {}
}

final class CameraPreviewUIView: UIView {
	override class var layerClass: AnyClass {
		AVCaptureVideoPreviewLayer.self
	}

	var previewLayer: AVCaptureVideoPreviewLayer {
		layer as! AVCaptureVideoPreviewLayer
	}
}

// MARK: - Camera Capture Container View

/// Full-screen camera view with a shutter button, screen awake lock, and PhotosPicker fallback.
struct CameraCaptureView: View {
	let onCapture: (Data) -> Void

	@StateObject private var controller = CameraCaptureController()
	@State private var selectedPhotoItem: PhotosPickerItem?
	@State private var isPickerPresented = false

	var body: some View {
		ZStack {
			Color.black.ignoresSafeArea()

			switch controller.status {
			case .ready:
				CameraPreviewView(session: controller.session)
					.ignoresSafeArea()

			case .unavailable, .unauthorized, .unconfigured:
				fallbackView
			}
		}
		.onAppear {
			UIApplication.shared.isIdleTimerDisabled = true
		}
		.onDisappear {
			UIApplication.shared.isIdleTimerDisabled = false
			controller.stopSession()
		}
		.onChange(of: selectedPhotoItem) { _, newItem in
			guard let newItem else { return }
			Task {
				if let data = try? await newItem.loadTransferable(type: Data.self) {
					onCapture(data)
				}
				selectedPhotoItem = nil
			}
		}
	}

	@ViewBuilder
	private var fallbackView: some View {
		VStack(spacing: 20) {
			Image(systemName: "camera.fill")
				.font(.system(size: 60))
				.foregroundStyle(.secondary)

			Text(controller.status == .unauthorized ? "Camera access is restricted." : "Camera preview unavailable.")
				.font(.headline)
				.foregroundStyle(.white)

			Text("You can still choose photos from your library or simulate a capture.")
				.font(.subheadline)
				.foregroundStyle(.secondary)
				.multilineTextAlignment(.center)
				.padding(.horizontal)

			PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
				Label("Choose from Library", systemImage: "photo.on.rectangle")
					.font(.headline)
					.padding(.horizontal, 20)
					.padding(.vertical, 12)
					.background(Color.accentColor)
					.foregroundStyle(.white)
					.clipShape(RoundedRectangle(cornerRadius: 12))
			}

			#if targetEnvironment(simulator) || DEBUG
			Button {
				// Provide a placeholder 1x1 JPEG for simulated capture in previews and simulator
				let renderer = UIGraphicsImageRenderer(size: CGSize(width: 400, height: 400))
				let image = renderer.image { ctx in
					UIColor.systemGray.setFill()
					ctx.fill(CGRect(x: 0, y: 0, width: 400, height: 400))
				}
				if let jpeg = image.jpegData(compressionQuality: 0.85) {
					onCapture(jpeg)
				}
			} label: {
				Label("Simulate Capture", systemImage: "camera.badge.ellipsis")
					.font(.subheadline.weight(.semibold))
					.foregroundStyle(.white.opacity(0.8))
			}
			#endif
		}
		.padding()
	}

	/// Trigger photo capture on the live camera session.
	func takePhoto() {
		Task {
			if let data = await controller.capturePhoto() {
				onCapture(data)
			}
		}
	}
}
