import SwiftUI

/// Full-screen QR scanner (VisionKit) with a manual-code fallback (WP6).
/// Calls `onScan` once with the raw payload, `onCancel` when dismissed.
struct ScannerView: View {
	var onScan: (String) -> Void
	var onCancel: () -> Void = {}
	var body: some View { PlaceholderScreen(title: "Scan", workPackage: "WP6") }
}
