package com.znect.cibridge.exporter

import org.json.JSONObject

internal data class CircleCiConnectionStatus(
    val connected: Boolean,
    val message: String
)

/** Validates the authenticated, read-only status response from GET /api/v1/status. */
internal object CircleCiConnectionValidator {
    fun validate(
        response: JSONObject,
        expectedProjectId: String,
        expectedConnectionId: String? = null
    ): CircleCiConnectionStatus {
        require(response.optString("service") == "znect-ci-bridge") {
            "Unexpected service response."
        }
        require(response.optString("provider") == "circleci") {
            "The selected provider is not CircleCI."
        }

        val project = response.optJSONObject("project")
            ?: throw IllegalArgumentException("Project metadata is missing.")
        require(project.optString("id") == expectedProjectId) {
            "The connection response belongs to another project."
        }

        val connection = response.optJSONObject("connection")
            ?: throw IllegalArgumentException("Connection metadata is missing.")
        if (!expectedConnectionId.isNullOrBlank()) {
            require(connection.optString("id") == expectedConnectionId) {
                "The connection response belongs to another CircleCI connection."
            }
        }

        val connected = response.opt("connected")
        require(connected is Boolean) { "Connection status is malformed." }
        if (!connected) {
            require(response.optString("provider_availability") == "unavailable") {
                "Unavailable connection response is inconsistent."
            }
            return CircleCiConnectionStatus(
                false,
                response.optString("error").takeIf { it.isNotBlank() }
                    ?: "CircleCI read probe failed."
            )
        }

        require(response.optString("permissions") == "read-only") {
            "The connection does not confirm read-only permissions."
        }
        require(response.optString("provider_availability") == "available") {
            "CircleCI availability was not confirmed."
        }
        require(connection.optString("status") == "configured") {
            "The CircleCI connection is not configured."
        }
        val probe = response.optJSONObject("read_probe")
            ?: throw IllegalArgumentException("CircleCI read-probe result is missing.")
        val runs = probe.opt("recent_runs_available")
        require(runs is Int || runs is Long) {
            "CircleCI read-probe result is malformed."
        }
        require((runs as Number).toLong() >= 0) {
            "CircleCI read-probe result is invalid."
        }
        return CircleCiConnectionStatus(true, "CircleCI read-only connection is available.")
    }
}
