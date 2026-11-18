package com.znect.cibridge.exporter

import org.json.JSONArray
import org.json.JSONObject

/**
 * Validates the bounded, read-only CircleCI report before it can be exported.
 * Kept independent of Activity/UI code so its contract can be unit-tested.
 */
internal object ReportValidator {
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L
    private val sensitiveKey = Regex("(?i)(token|secret|authorization|password|api[_-]?key)")

    private fun isInteger(value: Any?, min: Long, max: Long): Boolean =
        value is Number && value.toDouble().isFinite() &&
            value.toDouble() % 1.0 == 0.0 &&
            value.toDouble() >= min.toDouble() &&
            value.toDouble() <= max.toDouble()

    fun validate(report: JSONObject, expectedProject: String) {
        require(
            report.opt("service") == "znect-ci-bridge" &&
                isInteger(report.opt("report_version"), 1, 1) &&
                report.opt("provider") == "circleci" &&
                report.opt("permissions") == "read-only" &&
                report.opt("read_only") == true
        ) { "Unsupported report identity, version or permissions." }

        val generatedAt = report.opt("generated_at") as? String
            ?: throw IllegalArgumentException("The report has an invalid generation timestamp.")
        require(generatedAt.isNotBlank() &&
            runCatching { java.time.Instant.parse(generatedAt) }.isSuccess
        ) { "The report has an invalid generation timestamp." }

        val project = report.optJSONObject("project")
            ?: throw IllegalArgumentException("The report has no project metadata.")
        require(project.opt("id") == expectedProject) {
            "The returned project does not match the selected project."
        }

        val connection = report.optJSONObject("connection")
            ?: throw IllegalArgumentException("The report has no connection metadata.")
        require(connection.opt("provider") == "circleci" &&
            (connection.opt("id") as? String)?.isNotBlank() == true
        ) { "The report has invalid CircleCI connection metadata." }

        val runs = report.optJSONObject("runs")
            ?: throw IllegalArgumentException("The report is missing its run section.")
        val runItems = runs.optJSONArray("items")
            ?: throw IllegalArgumentException("The report run list is invalid.")
        val runCount = runs.opt("returned")
        val requestedRuns = runs.opt("requested")
        val failedRuns = runs.opt("failed_count")
        require(
            runItems.length() <= 10 &&
                isInteger(requestedRuns, 1, 10) &&
                isInteger(runCount, 0, 10) &&
                isInteger(failedRuns, 0, 10) &&
                runItems.length().toLong() == (runCount as Number).toLong() &&
                (runCount as Number).toLong() <= (requestedRuns as Number).toLong() &&
                (failedRuns as Number).toLong() <= (runCount as Number).toLong() &&
                containsOnlyObjects(runItems)
        ) { "The report run list exceeds its bounds or has inconsistent counts." }

        val events = report.optJSONObject("events")
            ?: throw IllegalArgumentException("The report is missing its event section.")
        val eventItems = events.optJSONArray("items")
            ?: throw IllegalArgumentException("The report event list is invalid.")
        val eventCount = events.opt("returned")
        val requestedEvents = events.opt("requested")
        val nextCursor = events.opt("next_cursor")
        require(
            eventItems.length() <= 20 &&
                isInteger(requestedEvents, 1, 20) &&
                isInteger(eventCount, 0, 20) &&
                isInteger(nextCursor, 0, MAX_SAFE_INTEGER) &&
                eventItems.length().toLong() == (eventCount as Number).toLong() &&
                (eventCount as Number).toLong() <= (requestedEvents as Number).toLong() &&
                events.opt("available") is Boolean &&
                containsOnlyObjects(eventItems)
        ) { "The report event list exceeds its bounds or has invalid metadata." }

        val completeness = report.optJSONObject("completeness")
            ?: throw IllegalArgumentException("The report is missing completeness metadata.")
        require(
            completeness.opt("runs_limited") is Boolean &&
                completeness.opt("events_available") is Boolean &&
                completeness.opt("events_available") == events.opt("available")
        ) { "The report completeness metadata is inconsistent." }
    }

    private fun containsOnlyObjects(items: JSONArray): Boolean =
        (0 until items.length()).all { items.opt(it) is JSONObject }

    fun containsSensitiveKey(value: Any?): Boolean = when (value) {
        is JSONObject -> {
            val keys = value.keys()
            var found = false
            while (keys.hasNext() && !found) {
                val key = keys.next()
                if (sensitiveKey.containsMatchIn(key) || containsSensitiveKey(value.opt(key))) {
                    found = true
                }
            }
            found
        }
        is JSONArray -> (0 until value.length()).any { containsSensitiveKey(value.opt(it)) }
        else -> false
    }
}
