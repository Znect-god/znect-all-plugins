package com.znect.cibridge.exporter

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BearerTokenPolicyTest {
    @Test fun acceptsRfc6750CharactersIncludingUnderscore() {
        assertTrue(BearerTokenPolicy.isValid("CCIPAT_example_token_123-._~+/=="))
    }

    @Test fun rejectsWhitespaceAndHeaderInjection() {
        assertFalse(BearerTokenPolicy.isValid("token with spaces"))
        assertFalse(BearerTokenPolicy.isValid("token\r\nX-Injected: yes"))
    }

    @Test fun rejectsEmptyAndOversizedValues() {
        assertFalse(BearerTokenPolicy.isValid(""))
        assertFalse(BearerTokenPolicy.isValid("a".repeat(4097)))
        assertTrue(BearerTokenPolicy.isValid("a".repeat(4096)))
    }
}
