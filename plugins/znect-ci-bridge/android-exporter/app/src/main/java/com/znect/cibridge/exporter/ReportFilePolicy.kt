package com.znect.cibridge.exporter

/** Centralized age check for private temporary report files. */
internal object ReportFilePolicy {
    fun isExpired(lastModifiedMillis: Long, nowMillis: Long, ttlMillis: Long): Boolean {
        require(ttlMillis >= 0) { "Report TTL must not be negative." }
        return lastModifiedMillis <= nowMillis - ttlMillis
    }
}
