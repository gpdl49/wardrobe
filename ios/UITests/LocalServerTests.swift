import XCTest

final class LocalServerTests: XCTestCase {
	@MainActor func testCreateLocationAndItem() throws {
		guard ProcessInfo.processInfo.environment["WARDROBE_LIVE_REVIEW"] == "1" else {
			throw XCTSkip("Requires the local development server")
		}
		let app = XCUIApplication()
		app.launchArguments = ["-devServer", "http://localhost:3000"]
		app.launch()
		XCTAssertTrue(app.buttons["Locations"].waitForExistence(timeout: 30))
		app.buttons["Locations"].tap()
		let newLocation = app.buttons["New Location"].firstMatch
		XCTAssertTrue(newLocation.waitForExistence(timeout: 10))
		newLocation.tap()
		XCTAssertTrue(app.navigationBars["New Location"].waitForExistence(timeout: 10))
		let code = app.textFields["Code (e.g. B-07)"]
		let name = app.textFields["Name"]
		code.tap()
		code.press(forDuration: 1.2)
		if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
		code.typeText("T-" + String(UUID().uuidString.prefix(6)))
		name.tap()
		name.press(forDuration: 1.2)
		if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
		name.typeText("Terra review bag")
		app.buttons["Create"].tap()
		XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Terra review bag'")).firstMatch.waitForExistence(timeout: 15))
		app.buttons["Catalogue"].tap()
		app.buttons["Add new item"].tap()
		let itemName = app.textFields["Name (e.g. Navy cardigan)"]
		XCTAssertTrue(itemName.waitForExistence(timeout: 10))
		itemName.tap()
		itemName.typeText("Terra review item")
		app.buttons["Create without photo"].tap()
		XCTAssertTrue(app.staticTexts["Terra review item"].waitForExistence(timeout: 15))
	}
	@MainActor func testPhotoUploadSurvivesRelaunch() throws {
		guard ProcessInfo.processInfo.environment["WARDROBE_LIVE_REVIEW"] == "1" else {
			throw XCTSkip("Requires the local development server and a simulator photo")
		}
		let app = XCUIApplication()
		app.launchArguments = ["-devServer", "http://localhost:3000"]
		app.launch()
		let add = app.buttons["Add new item"]
		XCTAssertTrue(add.waitForExistence(timeout: 30))
		add.tap()
		let name = app.textFields["Name (e.g. Navy cardigan)"]
		XCTAssertTrue(name.waitForExistence(timeout: 10))
		name.tap()
		let itemName = "Terra photo " + String(UUID().uuidString.prefix(8))
		name.typeText(itemName)
		app.buttons["Choose photo"].tap()
		// The system Photos picker is hosted outside the app's accessibility tree.
		sleep(2)
		app.coordinate(withNormalizedOffset: CGVector(dx: 0.16, dy: 0.43)).tap()
		let create = app.buttons["Create item"]
		XCTAssertTrue(create.waitForExistence(timeout: 15))
		if ProcessInfo.processInfo.environment["WARDROBE_OFFLINE_REVIEW"] == "1" {
			print("STOP SERVER NOW")
			sleep(20)
		}
		create.tap()
		app.terminate()
		if ProcessInfo.processInfo.environment["WARDROBE_OFFLINE_REVIEW"] == "1" {
			print("RESTART SERVER NOW")
			sleep(30)
		}
		app.launch()
		XCTAssertTrue(app.staticTexts[itemName].waitForExistence(timeout: 60))
	}

	@MainActor func testExternalItemLink() throws {
		guard ProcessInfo.processInfo.environment["WARDROBE_LIVE_REVIEW"] == "1" else {
			throw XCTSkip("Requires an external simctl openurl call")
		}
		let app = XCUIApplication()
		app.launchArguments = ["-fixtures"]
		app.launch()
		XCTAssertTrue(app.staticTexts["Navy cardigan"].waitForExistence(timeout: 30))
		print("OPEN ITEM LINK NOW")
		sleep(20)
		let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
		if springboard.buttons["Open"].waitForExistence(timeout: 3) { springboard.buttons["Open"].tap() }
		XCTAssertTrue(app.navigationBars["Navy cardigan"].waitForExistence(timeout: 10))
	}

	@MainActor func testShareWithLocalUser() throws {
		guard ProcessInfo.processInfo.environment["WARDROBE_LIVE_REVIEW"] == "1" else {
			throw XCTSkip("Requires the local development server and a second user")
		}
		let app = XCUIApplication()
		app.launchArguments = ["-devServer", "http://localhost:3000"]
		app.launch()
		let more = app.tabBars.buttons["More"]
		XCTAssertTrue(more.waitForExistence(timeout: 30))
		more.tap()
		app.staticTexts["Sharing"].tap()
		let grantee = app.textFields["Email or username"]
		XCTAssertTrue(grantee.waitForExistence(timeout: 10))
		grantee.tap()
		grantee.typeText("terra-friend@example.test")
		app.buttons["Share"].tap()
		XCTAssertTrue(app.staticTexts["terra-friend"].waitForExistence(timeout: 15))
	}

	@MainActor func testPackAndUnpackWithLocalServer() throws {
		guard ProcessInfo.processInfo.environment["WARDROBE_LIVE_REVIEW"] == "1" else {
			throw XCTSkip("Requires local review items and locations")
		}
		let app = XCUIApplication()
		app.launchArguments = ["-devServer", "http://localhost:3000"]
		app.launch()
		let pack = app.buttons["Pack"].firstMatch
		XCTAssertTrue(pack.waitForExistence(timeout: 30))
		pack.tap()
		let bag = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Terra review bag'")).firstMatch
		XCTAssertTrue(bag.waitForExistence(timeout: 10))
		bag.tap()
		let add = app.buttons["Add Existing"]
		XCTAssertTrue(add.waitForExistence(timeout: 10))
		add.tap()
		let search = app.searchFields.firstMatch
		search.tap()
		search.typeText("Terra review item")
		let packItem = app.buttons["Pack Terra review item"].firstMatch
		XCTAssertTrue(packItem.waitForExistence(timeout: 15))
		packItem.tap()
		if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
		else { app.buttons["close"].tap() }
		if !app.buttons["Done"].isHittable {
			if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
			else { app.swipeDown() }
		}
		XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 10))
		app.buttons["Done"].tap()
		XCTAssertTrue(app.navigationBars["Session Summary"].waitForExistence(timeout: 15))
		app.buttons["Unpack"].firstMatch.tap()
		let source = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Terra review bag'")).firstMatch
		XCTAssertTrue(source.waitForExistence(timeout: 10))
		source.tap()
		let selectAll = app.buttons["Select All"]
		XCTAssertTrue(selectAll.waitForExistence(timeout: 10))
		selectAll.tap()
		app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Move '")).firstMatch.tap()
		app.buttons["No location (Unassigned)"].tap()
		XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 15))
		app.buttons["Done"].tap()
		XCTAssertTrue(app.navigationBars["Session Summary"].waitForExistence(timeout: 15))
	}

	@MainActor func testUpdateAndRevokeLocalShare() throws {
		guard ProcessInfo.processInfo.environment["WARDROBE_LIVE_REVIEW"] == "1" else {
			throw XCTSkip("Requires the local review share")
		}
		let app = XCUIApplication()
		app.launchArguments = ["-devServer", "http://localhost:3000"]
		app.launch()
		let more = app.tabBars.buttons["More"]
		XCTAssertTrue(more.waitForExistence(timeout: 30))
		more.tap()
		app.staticTexts["Sharing"].tap()
		let row = app.staticTexts["terra-friend"]
		XCTAssertTrue(row.waitForExistence(timeout: 10))
		app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Access for terra-friend'")).firstMatch.tap()
		app.buttons["Can edit"].tap()
		row.swipeLeft()
		app.buttons["Revoke"].tap()
		app.buttons["Stop sharing"].tap()
		XCTAssertTrue(app.staticTexts["Not shared with anyone yet"].waitForExistence(timeout: 15))
	}

}
