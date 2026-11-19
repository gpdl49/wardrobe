import SwiftUI
import WardrobeKit

// Small shared presentation helpers (WP0). Feature packages add their own
// files under UI/ rather than editing this one.

extension LocationKind {
	var label: String {
		switch self {
		case .bag: "Bag"
		case .vacuumBag: "Vacuum bag"
		case .suitcase: "Suitcase"
		case .closet: "Closet"
		case .drawer: "Drawer"
		case .other: "Other"
		default: rawValue.capitalized
		}
	}
	var symbolName: String {
		switch self {
		case .bag, .vacuumBag: "bag"
		case .suitcase: "suitcase"
		case .closet: "cabinet"
		case .drawer: "archivebox"
		default: "shippingbox"
		}
	}
}

extension ItemStatus {
	var label: String { rawValue.capitalized }
}

extension Season {
	var label: String { rawValue.capitalized }
	var symbolName: String {
		switch self {
		case .spring: "leaf"
		case .summer: "sun.max"
		case .autumn: "wind"
		case .winter: "snowflake"
		default: "calendar"
		}
	}
}

extension Color {
	/// `#rrggbb` → Color; gray when malformed.
	init(hex: String) {
		let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
		guard s.count == 6, let v = UInt32(s, radix: 16) else { self = .gray; return }
		self = Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
	}
}

extension View {
	/// Shows `message` (when non-nil) in an alert; clears it on dismiss.
	func errorAlert(_ message: Binding<String?>) -> some View {
		alert("Something went wrong", isPresented: Binding(get: { message.wrappedValue != nil }, set: { if !$0 { message.wrappedValue = nil } })) {
			Button("OK", role: .cancel) {}
		} message: {
			Text(message.wrappedValue ?? "")
		}
	}
}
