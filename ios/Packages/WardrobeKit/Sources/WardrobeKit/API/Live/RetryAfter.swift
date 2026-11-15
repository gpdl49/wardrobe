import Foundation

enum RetryAfterParser {
	/// Parses an HTTP `Retry-After` header value (either seconds or an HTTP-date)
	/// into seconds from now.
	static func parse(_ header: String?, now: Date = Date()) -> TimeInterval? {
		guard let raw = header?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
			return nil
		}
		if let seconds = TimeInterval(raw), seconds >= 0 {
			return seconds
		}
		let formatters: [DateFormatter] = [
			makeFormatter("EEE, dd MMM yyyy HH:mm:ss zzz"),
			makeFormatter("EEEE, dd-MMM-yy HH:mm:ss zzz"),
			makeFormatter("EEE MMM d HH:mm:ss yyyy")
		]
		for df in formatters {
			if let date = df.date(from: raw) {
				return max(0, date.timeIntervalSince(now))
			}
		}
		return nil
	}

	private static func makeFormatter(_ format: String) -> DateFormatter {
		let df = DateFormatter()
		df.locale = Locale(identifier: "en_US_POSIX")
		df.timeZone = TimeZone(secondsFromGMT: 0)
		df.dateFormat = format
		return df
	}
}
