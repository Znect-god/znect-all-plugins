package com.znect.cibridge.exporter

import org.json.JSONArray
import org.json.JSONObject

/**
 * Validates the bounded, read-only CircleCI report before it can be exported.
 * Kept independent of Activity/UI code so its contract can be unit-tested.
 */
internal object ReportValidator {
    private val sensitiveKey = Regex("(?i)(token|secret|authorization|password|api[_-]?key)")

    fun validate(report: JSONObject, expectedProject: String) {
        require(
            report.optString("service") == "znect-ci-bridge" &&
                report.optInt("report_version", -1) == 1 &&
                report.optString("provider") == "circleci" &&
                report.optString("permissions") == "read-only" &&
                report.optBoolean("read_only", false)
        ) { "Unsupported report identity, version or permissions." }

        val generatedAt = report.optString("generated_at")
        require(generatedAt.isNotBlank() &&
            runCatching { java.time.Instant.parse(generatedAt) }.isSuccess
        ) { "The report has an invalid generation timestamp." }

        val project = report.optJSONObject("project")
            ?: throw IllegalArgumentException("The report has no project metadata.")
        require(project.optString("id") == expectedProject) {
            "The returned project does not match the selected project."
        }

        val connection = report.optJSONObject("connection")
            ?: throw IllegalArgumentException("The report has no connection metadata.")
        require(connection.optString("provider") == "circleci" &&
            connection.optString("id").isNotBlank()
        ) { "The report has invalid CircleCI connection metadata." }

        val runs = report.optJSONObject("runs")
            ?: throw IllegalArgumentException("The report is missing its run section.")
        val runItems = runs.optJSONArray("items")
            ?: throw IllegalArgumentException("The report run list is invalid.")
        require(runItems.length() <= 10 && runs.optInt("returned", -1) == runItems.length()) {
            "The report run list exceeds its bounds or has an invalid count."
        }

        val events = report.optJSONObject("events")
            ?: throw IllegalArgumentException("The report is missing its event section.")
        val eventItems = events.optJSONArray("items")
            ?: throw IllegalArgumentException("The report event list is invalid.")
        require(eventItems.length() <= 20 &&
            events.optInt("returned", -1) == eventItems.length() &&
            events.opt("available") is Boolean
        ) { "The report event list exceeds its bounds or has invalid metadata." }

        require(report.optJSONObject("completeness") != null) {
            "The report is missing completeness metadata."
        }
    }

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
