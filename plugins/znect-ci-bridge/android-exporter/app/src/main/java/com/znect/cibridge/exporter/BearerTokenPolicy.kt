package com.znect.cibridge.exporter

/** Validates the RFC 6750 b64token character set before a credential is used. */
internal object BearerTokenPolicy {
    private val pattern = Regex("^[A-Za-z0-9._~+/-]+=*$")

    fun isValid(value: String): Boolean = value.length in 1..4096 && pattern.matches(value)
}
