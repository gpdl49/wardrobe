// swift-tools-version: 6.2
import PackageDescription

// Platform-independent core of the Wardrobe iOS app: API models and client,
// OIDC sign-in, the photo upload queue and image helpers. It builds for macOS
// too so `swift test` runs on the Mac without a simulator.
let package = Package(
	name: "WardrobeKit",
	platforms: [.iOS(.v26), .macOS(.v26)],
	products: [
		.library(name: "WardrobeKit", targets: ["WardrobeKit"]),
		.library(name: "WardrobeKitTesting", targets: ["WardrobeKitTesting"]),
	],
	targets: [
		.target(name: "WardrobeKit"),
		.target(name: "WardrobeKitTesting", dependencies: ["WardrobeKit"]),
		.testTarget(
			name: "WardrobeKitTests",
			dependencies: ["WardrobeKit", "WardrobeKitTesting"]
		),
	],
	swiftLanguageModes: [.v6]
)
