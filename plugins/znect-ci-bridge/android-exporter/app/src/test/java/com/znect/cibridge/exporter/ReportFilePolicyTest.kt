package com.znect.cibridge.exporter

import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ReportFilePolicyTest {
    @Test fun acceptsReportYoungerThanTtl() {
        assertFalse(ReportFilePolicy.isExpired(9_000L, 10_000L, 2_000L))
    }

    @Test fun expiresReportAtExactTtlBoundary() {
        assertTrue(ReportFilePolicy.isExpired(8_000L, 10_000L, 2_000L))
    }

    @Test fun expiresReportOlderThanTtl() {
        assertTrue(ReportFilePolicy.isExpired(7_999L, 10_000L, 2_000L))
    }

    @Test fun doesNotExpireFutureDatedFile() {
        assertFalse(ReportFilePolicy.isExpired(10_001L, 10_000L, 2_000L))
    }

    @Test fun rejectsNegativeTtl() {
        assertThrows(IllegalArgumentException::class.java) {
            ReportFilePolicy.isExpired(9_000L, 10_000L, -1L)
        }
    }
}
