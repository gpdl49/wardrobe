import Foundation
import Network

/// Monitors network connectivity changes so the upload queue can resume.
public protocol NetworkPathMonitoring: Sendable {
	func start(onUpdate: @escaping @Sendable (Bool) -> Void)
	func cancel()
}

public final class LiveNetworkPathMonitor: NetworkPathMonitoring, @unchecked Sendable {
	private let monitor: NWPathMonitor
	private let queue: DispatchQueue

	public init() {
		self.monitor = NWPathMonitor()
		self.queue = DispatchQueue(label: "xyz.vidur.wardrobe.network-monitor")
	}

	public func start(onUpdate: @escaping @Sendable (Bool) -> Void) {
		monitor.pathUpdateHandler = { path in
			onUpdate(path.status == .satisfied)
		}
		monitor.start(queue: queue)
	}

	public func cancel() {
		monitor.cancel()
	}
}

public final class TestNetworkPathMonitor: NetworkPathMonitoring, @unchecked Sendable {
	private var onUpdate: (@Sendable (Bool) -> Void)?
	private let lock = NSLock()

	public init() {}

	public func start(onUpdate: @escaping @Sendable (Bool) -> Void) {
		lock.lock()
		self.onUpdate = onUpdate
		lock.unlock()
	}

	public func cancel() {
		lock.lock()
		self.onUpdate = nil
		lock.unlock()
	}

	public func triggerUpdate(isSatisfied: Bool) {
		lock.lock()
		let handler = onUpdate
		lock.unlock()
		handler?(isSatisfied)
	}
}
