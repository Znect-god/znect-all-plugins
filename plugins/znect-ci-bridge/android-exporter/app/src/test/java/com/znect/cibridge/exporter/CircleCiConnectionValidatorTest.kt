package com.znect.cibridge.exporter

import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CircleCiConnectionValidatorTest {
    @Test fun acceptsSuccessfulReadOnlyCircleCiProbe() {
        val result = CircleCiConnectionValidator.validate(validStatus(), "project-1", "connection-1")
        assertTrue(result.connected)
    }

    @Test fun returnsUnavailableProviderStatusWithoutCallingItConnected() {
        val response = validStatus()
            .put("connected", false)
            .put("provider_availability", "unavailable")
            .put("error", "Provider read probe failed.")
        response.remove("permissions")
        response.remove("read_probe")
        val result = CircleCiConnectionValidator.validate(response, "project-1")
        assertFalse(result.connected)
        assertEquals("Provider read probe failed.", result.message)
    }

    @Test fun rejectsWrongProvider() {
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(validStatus().put("provider", "github-actions"), "project-1")
        }
    }

    @Test fun rejectsWritablePermissionClaim() {
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(validStatus().put("permissions", "read-write"), "project-1")
        }
    }

    @Test fun rejectsProjectMismatch() {
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(validStatus(), "other-project")
        }
    }

    @Test fun rejectsConnectionMismatch() {
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(validStatus(), "project-1", "other-connection")
        }
    }

    @Test fun rejectsConnectedResponseWithoutAvailableProvider() {
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(validStatus().put("provider_availability", "unknown"), "project-1")
        }
    }

    @Test fun rejectsMissingReadProbe() {
        val response = validStatus()
        response.remove("read_probe")
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(response, "project-1")
        }
    }

    @Test fun rejectsMalformedConnectionFlag() {
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(validStatus().put("connected", "true"), "project-1")
        }
    }

    @Test fun rejectsNegativeRecentRunCount() {
        val response = validStatus().put("read_probe", JSONObject().put("recent_runs_available", -1))
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(response, "project-1")
        }
    }

    @Test fun rejectsFractionalRecentRunCount() {
        val response = validStatus().put("read_probe", JSONObject().put("recent_runs_available", 1.5))
        assertThrows(IllegalArgumentException::class.java) {
            CircleCiConnectionValidator.validate(response, "project-1")
        }
    }

    private fun validStatus() = JSONObject()
        .put("service", "znect-ci-bridge")
        .put("connected", true)
        .put("provider", "circleci")
        .put("project", JSONObject().put("id", "project-1").put("status", "registered"))
        .put("connection", JSONObject().put("id", "connection-1").put("status", "configured"))
        .put("provider_availability", "available")
        .put("permissions", "read-only")
        .put("read_probe", JSONObject().put("recent_runs_available", 1))
}
