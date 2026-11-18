package com.znect.cibridge.exporter

import java.net.URI

/**
 * Accepts only an HTTPS origin. API paths and query parameters are owned by the app,
 * never by user-supplied URL input.
 */
internal object OriginPolicy {
    fun normalize(raw: String): String? = try {
        val uri = URI(raw.trim())
        if (!uri.scheme.equals("https", ignoreCase = true) ||
            uri.host.isNullOrBlank() ||
            uri.rawUserInfo != null ||
            uri.rawQuery != null ||
            uri.rawFragment != null ||
            (uri.rawPath.isNotEmpty() && uri.rawPath != "/") ||
            (uri.port != -1 && uri.port != 443)
        ) {
            null
        } else {
            "https://" + uri.host.lowercase()
        }
    } catch (_: Exception) {
        null
    }
}
