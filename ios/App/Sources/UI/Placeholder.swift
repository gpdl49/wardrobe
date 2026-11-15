import SwiftUI

/// Stand-in body for a screen whose work package has not landed yet.
struct PlaceholderScreen: View {
	let title: String
	let workPackage: String
	var body: some View {
		ContentUnavailableView(title, systemImage: "hammer", description: Text("Built in \(workPackage)."))
			.navigationTitle(title)
	}
}
