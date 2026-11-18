package com.znect.cibridge.exporter

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.Assert.assertThrows

class ReportValidatorTest {
    @Test fun acceptsBoundedReadOnlyCircleCiReport() {
        ReportValidator.validate(validReport(), "project-1")
    }

    @Test fun rejectsWrongProvider() {
        val report = validReport().put("provider", "github-actions")
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsWritableReport() {
        val report = validReport().put("read_only", false)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsProjectMismatch() {
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(validReport(), "another-project")
        }
    }

    @Test fun rejectsMoreThanTenRuns() {
        val report = validReport()
        val items = JSONArray()
        repeat(11) { items.put(JSONObject().put("id", "run-$it")) }
        report.getJSONObject("runs").put("items", items).put("returned", 11)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsInconsistentEventCount() {
        val report = validReport()
        report.getJSONObject("events").put("returned", 1)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsMalformedTimestamp() {
        val report = validReport().put("generated_at", "not-a-timestamp")
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsMissingCompletenessMetadata() {
        val report = validReport().remove("completeness")
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun detectsSensitiveKeysRecursively() {
        val report = validReport().put(
            "diagnostics",
            JSONObject().put("nested", JSONArray().put(JSONObject().put("api_key", "hidden")))
        )
        assertTrue(ReportValidator.containsSensitiveKey(report))
    }

    @Test fun allowsOrdinaryDiagnosticFields() {
        assertFalse(ReportValidator.containsSensitiveKey(
            JSONObject().put("diagnostics", JSONObject().put("status", "failed"))
        ))
    }

    private fun validReport() = JSONObject()
        .put("service", "znect-ci-bridge")
        .put("report_version", 1)
        .put("provider", "circleci")
        .put("permissions", "read-only")
        .put("read_only", true)
        .put("generated_at", "2026-11-18T08:00:00Z")
        .put("project", JSONObject().put("id", "project-1"))
        .put("connection", JSONObject().put("provider", "circleci").put("id", "connection-1"))
        .put("runs", JSONObject().put("items", JSONArray()).put("returned", 0))
        .put("events", JSONObject().put("items", JSONArray()).put("returned", 0).put("available", true))
        .put("completeness", JSONObject().put("runs_limited", false).put("events_available", true))
}
