import Foundation

/// Maps API failures to user-visible text per `AppModel.message(for:)`.
@MainActor
func userFacingAPIError(_ error: Error, appModel: AppModel?) -> String? {
	if let appModel {
		return appModel.message(for: error)
	}
	return (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
}
