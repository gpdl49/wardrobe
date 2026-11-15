import Foundation
#if canImport(Darwin)
import Darwin
#endif

enum UserAgent {
	/// Constructs `Wardrobe-iOS/<CFBundleShortVersionString> (<build>; iOS <version>; <model>)`.
	static func format(bundle: Bundle = .main) -> String {
		let version = (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
			.flatMap { $0.isEmpty ? nil : $0 } ?? "1.0.0"
		let build = (bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
			.flatMap { $0.isEmpty ? nil : $0 } ?? "1"
		let os = ProcessInfo.processInfo.operatingSystemVersion
		let osVersion = os.patchVersion == 0
			? "\(os.majorVersion).\(os.minorVersion)"
			: "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"
		var sysinfo = utsname()
		uname(&sysinfo)
		let machine = withUnsafePointer(to: &sysinfo.machine) { ptr in
			String(cString: UnsafeRawPointer(ptr).assumingMemoryBound(to: CChar.self))
		}
		let model = machine.isEmpty ? "iPhone" : machine
		return "Wardrobe-iOS/\(version) (\(build); iOS \(osVersion); \(model))"
	}
}
