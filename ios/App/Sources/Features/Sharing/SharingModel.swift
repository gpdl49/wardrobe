import Foundation
import Observation
import WardrobeKit

/// State and business logic for `SharingView` (WP8).
@MainActor
@Observable
final class SharingModel {
	// MARK: - State

	var shares: [ShareDTO] = []
	var sharedWithMe: [SharedWithMeDTO] = []
	var locations: [LocationDTO] = []
	var isLoading: Bool = false
	var errorMessage: String?

	// Add share form
	var grantee: String = ""
	var access: ShareAccess = .view
	var selectedLocationId: ID?
	var isSubmitting: Bool = false
	var formError: String?

	// Revoke confirmation
	var shareToRevoke: ShareDTO?
	var showRevokeConfirmation: Bool = false

	private let api: any WardrobeAPI

	// MARK: - Initialization

	init(api: any WardrobeAPI) {
		self.api = api
	}

	// MARK: - Loading

	func load(appModel: AppModel? = nil) async {
		isLoading = true
		errorMessage = nil
		do {
			async let sharesTask = api.shares()
			async let sharedWithMeTask = api.sharedWithMe()
			async let locationsTask = api.locations(LocationQuery(archived: false))

			let (loadedShares, loadedSharedWithMe, loadedLocations) = try await (sharesTask, sharedWithMeTask, locationsTask)
			self.shares = loadedShares
			self.sharedWithMe = loadedSharedWithMe
			self.locations = loadedLocations
			if let appModel {
				await appModel.refreshShares()
			}
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
		isLoading = false
	}

	// MARK: - Form Validation & Creation

	func validateForm() -> Bool {
		let trimmed = grantee.trimmingCharacters(in: .whitespacesAndNewlines)
		if trimmed.isEmpty {
			formError = "Enter an email or username"
			return false
		}
		formError = nil
		return true
	}

	@discardableResult
	func createShare(appModel: AppModel? = nil) async -> Bool {
		guard validateForm() else { return false }
		let trimmedGrantee = grantee.trimmingCharacters(in: .whitespacesAndNewlines)
		isSubmitting = true
		formError = nil

		do {
			let req = CreateShareRequest(grantee: trimmedGrantee, access: access, locationId: selectedLocationId)
			let newShare = try await api.createShare(req)
			shares.append(newShare)
			grantee = ""
			selectedLocationId = nil
			access = .view
			isSubmitting = false
			if let appModel {
				await appModel.refreshShares()
			}
			return true
		} catch let apiError as APIError {
			isSubmitting = false
			// 422: unknown grantee / self / invalid location
			// 409: already shared with that user
			formError = apiError.message
			return false
		} catch {
			isSubmitting = false
			formError = error.localizedDescription
			return false
		}
	}

	// MARK: - Updating Access

	func updateShare(share: ShareDTO, newAccess: ShareAccess, appModel: AppModel? = nil) async {
		guard share.access != newAccess else { return }
		do {
			let updated = try await api.updateShare(id: share.id, access: newAccess)
			if let index = shares.firstIndex(where: { $0.id == share.id }) {
				shares[index] = updated
			}
			if let appModel {
				await appModel.refreshShares()
			}
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}

	// MARK: - Revoking

	func requestRevoke(share: ShareDTO) {
		shareToRevoke = share
		showRevokeConfirmation = true
	}

	func confirmRevoke(appModel: AppModel? = nil) async {
		guard let share = shareToRevoke else { return }
		shareToRevoke = nil
		showRevokeConfirmation = false

		do {
			try await api.deleteShare(id: share.id)
			shares.removeAll { $0.id == share.id }
			if let appModel {
				await appModel.refreshShares()
			}
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}

	// MARK: - Switching to Shared Wardrobe

	func selectSharedWithMe(_ share: SharedWithMeDTO, appModel: AppModel, router: Router) {
		let targetScope = WardrobeScope(
			ownerId: share.owner.id,
			title: share.location.map { "\(share.owner.displayName): \($0.name)" } ?? share.owner.displayName,
			access: share.access == .edit ? .edit : .view,
			location: share.location
		)
		appModel.scope = targetScope
		router.tab = .catalogue
	}
}
