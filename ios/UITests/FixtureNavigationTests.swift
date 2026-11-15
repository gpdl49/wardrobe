import XCTest
import UIKit

final class FixtureNavigationTests: XCTestCase {
	@MainActor private func selectTab(_ name: String, in app: XCUIApplication) {
		let button = app.buttons[name].firstMatch
		if button.exists {
			button.tap()
		} else {
			let label = app.staticTexts[name].firstMatch
			if !label.exists { app.buttons["Toggle sidebar"].firstMatch.tap() }
			XCTAssertTrue(label.waitForExistence(timeout: 10))
			label.tap()
		}
	}
	@MainActor func testTabsAndDetails() throws {
		let app = XCUIApplication()
		app.launchArguments = ["-fixtures"]
		app.launch()
		if UIDevice.current.userInterfaceIdiom == .pad {
			XCUIDevice.shared.orientation = .landscapeLeft
		}
		XCTAssertTrue(app.staticTexts["Navy cardigan"].waitForExistence(timeout: 30))
		app.staticTexts["Navy cardigan"].firstMatch.tap()
		XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: 5))
		let edit = app.buttons["Edit"].firstMatch
		XCTAssertTrue(edit.waitForExistence(timeout: 10))
		edit.tap()
		XCTAssertTrue(app.navigationBars["Edit item"].waitForExistence(timeout: 10))
		app.buttons["Cancel"].tap()
		app.navigationBars.buttons["BackButton"].firstMatch.tap()
		for tab in ["Locations", "Pack", "Unpack", "Sharing", "Settings", "Catalogue"] {
			var target = app.buttons[tab].firstMatch
			if !target.exists && app.tabBars.buttons["More"].exists {
				if app.navigationBars.buttons["More"].exists {
					app.navigationBars.buttons["More"].tap()
				} else {
					app.tabBars.buttons["More"].tap()
				}
				target = app.staticTexts[tab].firstMatch
			} else if !target.exists && UIDevice.current.userInterfaceIdiom == .pad {
				if !app.staticTexts[tab].exists {
					app.buttons["Toggle sidebar"].firstMatch.tap()
				}
				target = app.staticTexts[tab].firstMatch
			}
			XCTAssertTrue(target.waitForExistence(timeout: 10), "Missing tab \(tab)")
			guard target.exists else { return }
			target.tap()
			let screenshot = XCTAttachment(screenshot: app.screenshot())
			screenshot.name = tab
			screenshot.lifetime = .keepAlways
			add(screenshot)
		}
		if UIDevice.current.userInterfaceIdiom == .pad {
			XCUIDevice.shared.orientation = .portrait
			for tab in ["Locations", "Pack", "Unpack", "Sharing", "Settings", "Catalogue"] {
				selectTab(tab, in: app)
				let screenshot = XCTAttachment(screenshot: app.screenshot())
				screenshot.name = "iPad portrait - \(tab)"
				screenshot.lifetime = .keepAlways
				add(screenshot)
			}
		}
	}
	@MainActor func testLocationAndScannerScreens() {
		let app = XCUIApplication()
		app.launchArguments = ["-fixtures"]
		app.launch()
		XCTAssertTrue(app.staticTexts["Navy cardigan"].waitForExistence(timeout: 30))
		selectTab("Locations", in: app)
		let bag = app.staticTexts["Winter knits"].firstMatch
		XCTAssertTrue(bag.waitForExistence(timeout: 10))
		bag.tap()
		XCTAssertTrue(app.navigationBars["B-07"].waitForExistence(timeout: 10))
		app.buttons["QR Label"].firstMatch.tap()
		XCTAssertTrue(app.navigationBars["QR Label"].waitForExistence(timeout: 10))
		app.buttons["Done"].tap()
		app.navigationBars.buttons["BackButton"].firstMatch.tap()
		if !app.buttons["Scan QR"].exists { app.navigationBars["Locations"].buttons["More"].tap() }
		app.buttons["Scan QR"].firstMatch.tap()
		XCTAssertTrue(app.navigationBars["Scan Location"].waitForExistence(timeout: 10))
		app.buttons["Cancel"].tap()
		if !app.buttons["New Location"].exists { app.navigationBars["Locations"].buttons["More"].tap() }
		app.buttons["New Location"].tap()
		XCTAssertTrue(app.navigationBars["New Location"].waitForExistence(timeout: 10))
		app.buttons["Cancel"].tap()
	}

	@MainActor func testPackingAndUnpackingScreens() {
		let app = XCUIApplication()
		app.launchArguments = ["-fixtures"]
		app.launch()
		XCTAssertTrue(app.staticTexts["Navy cardigan"].waitForExistence(timeout: 30))
		selectTab("Pack", in: app)
		let bag = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Winter knits'")).firstMatch
		XCTAssertTrue(bag.waitForExistence(timeout: 10))
		bag.tap()
		let done = app.buttons["Done"].firstMatch
		XCTAssertTrue(done.waitForExistence(timeout: 10))
		done.tap()
		XCTAssertTrue(app.navigationBars["Session Summary"].waitForExistence(timeout: 10))
		selectTab("Unpack", in: app)
		let unpackBag = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Winter knits'")).firstMatch
		XCTAssertTrue(unpackBag.waitForExistence(timeout: 10))
		unpackBag.tap()
		let selectAll = app.buttons["Select All"]
		XCTAssertTrue(selectAll.waitForExistence(timeout: 10))
		selectAll.tap()
		let move = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Move '")).firstMatch
		XCTAssertTrue(move.waitForExistence(timeout: 10))
		move.tap()
		app.buttons["No location (Unassigned)"].tap()
		XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 10))
		app.buttons["Done"].tap()
		XCTAssertTrue(app.navigationBars["Session Summary"].waitForExistence(timeout: 10))
	}

}
