package com.znect.cibridge.exporter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OriginPolicyTest {
    @Test fun acceptsHttpsOriginAndNormalizesHost() {
        assertEquals("https://ci.example.com", OriginPolicy.normalize(" HTTPS://CI.EXAMPLE.COM/ "))
    }

    @Test fun acceptsExplicitStandardHttpsPort() {
        assertEquals("https://ci.example.com", OriginPolicy.normalize("https://ci.example.com:443"))
    }

    @Test fun rejectsHttp() {
        assertNull(OriginPolicy.normalize("http://ci.example.com"))
    }

    @Test fun rejectsNonStandardPort() {
        assertNull(OriginPolicy.normalize("https://ci.example.com:8443"))
    }

    @Test fun rejectsPath() {
        assertNull(OriginPolicy.normalize("https://ci.example.com/private"))
    }

    @Test fun rejectsQueryAndFragment() {
        assertNull(OriginPolicy.normalize("https://ci.example.com?token=abc"))
        assertNull(OriginPolicy.normalize("https://ci.example.com#fragment"))
    }

    @Test fun rejectsEmbeddedCredentials() {
        assertNull(OriginPolicy.normalize("https://user:password@ci.example.com"))
    }

    @Test fun rejectsMalformedOrigin() {
        assertNull(OriginPolicy.normalize("not a url"))
        assertNull(OriginPolicy.normalize(""))
    }
}
