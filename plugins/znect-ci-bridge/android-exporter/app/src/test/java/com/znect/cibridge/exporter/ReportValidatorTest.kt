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

    @Test fun acceptsTheSelectedConnection() {
        ReportValidator.validate(validReport(), "project-1", "connection-1")
    }

    @Test fun rejectsAReportFromAnotherConnection() {
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(validReport(), "project-1", "connection-2")
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
        val report = validReport()
        report.remove("completeness")
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


    @Test fun rejectsRunFailureCountAboveReturnedCount() {
        val report = validReport()
        report.getJSONObject("runs").put("failed_count", 1)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsNonObjectRunEntries() {
        val report = validReport()
        report.getJSONObject("runs")
            .put("items", JSONArray().put("not-an-object"))
            .put("returned", 1)
            .put("requested", 10)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsInconsistentCompletenessMetadata() {
        val report = validReport()
        report.getJSONObject("completeness").put("events_available", false)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsNumericStringsInsteadOfJsonNumbers() {
        val report = validReport()
        report.getJSONObject("runs").put("returned", "0")
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsStringReportVersion() {
        val report = validReport().put("report_version", "1")
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsStringEventCursor() {
        val report = validReport()
        report.getJSONObject("events").put("next_cursor", "0")
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsEventCursorOutsideJsonSafeIntegerRange() {
        val report = validReport()
        report.getJSONObject("events").put("next_cursor", 9_007_199_254_740_992L)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
    }

    @Test fun rejectsRequestedLimitsOutsideContract() {
        val report = validReport()
        report.getJSONObject("events").put("requested", 21)
        assertThrows(IllegalArgumentException::class.java) {
            ReportValidator.validate(report, "project-1")
        }
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
        .put("runs", JSONObject().put("items", JSONArray()).put("returned", 0).put("requested", 10).put("failed_count", 0))
        .put("events", JSONObject().put("items", JSONArray()).put("returned", 0).put("requested", 20).put("next_cursor", 0).put("available", true))
        .put("completeness", JSONObject().put("runs_limited", false).put("events_available", true))
}
