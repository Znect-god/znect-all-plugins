package com.znect.cibridge.exporter

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection
import java.net.URL
import android.util.Base64

class MainActivity : Activity() {
    private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }
    private val executor = Executors.newSingleThreadExecutor()

    private lateinit var originInput: EditText
    private lateinit var projectInput: EditText
    private lateinit var connectionInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var statusText: TextView
    private lateinit var checkConnectionButton: Button
    private lateinit var fetchButton: Button
    private lateinit var shareButton: Button

    @Volatile private var latestReportFile: File? = null
    @Volatile private var fetching = false
    @Volatile private var destroyed = false
    @Volatile private var activeConnection: HttpsURLConnection? = null
    private var expiredReportCleanupFailed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cleanExpiredReports()
        buildUi()
        loadNonSecretConfiguration()
        shareButton.isEnabled = false
        statusText.text = if (prefs.contains(TOKEN_CIPHERTEXT)) {
            "Credential is configured on this device. It is never shown again."
        } else {
            "Configure the private API origin, project and Bearer token locally."
        }
        if (expiredReportCleanupFailed) {
            statusText.append("\nWarning: expired temporary report cleanup could not be verified. Use Disconnect and clear local data to retry cleanup.")
        }
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(24))
        }
        val scroll = ScrollView(this).apply { addView(root) }

        root.addView(TextView(this).apply {
            text = "Znect CI Bridge"
            textSize = 25f
        })
        root.addView(TextView(this).apply {
            text = "Private report exporter · manual handoff"
            textSize = 14f
            setPadding(0, dp(4), 0, dp(20))
        })

        originInput = field("HTTPS API origin, e.g. https://ci.example.com")
        projectInput = field("Registered project ID")
        connectionInput = field("Connection ID (required if the project has multiple CircleCI connections)")
        tokenInput = field("Bearer token — entered only on this device").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }

        root.addView(label("API origin"))
        root.addView(originInput)
        root.addView(label("Project ID"))
        root.addView(projectInput)
        root.addView(label("Connection ID"))
        root.addView(connectionInput)
        root.addView(label("Bearer token"))
        root.addView(tokenInput)

        root.addView(actionButton("Save configuration") { saveConfiguration() })
        root.addView(actionButton("Disconnect and clear local data") { disconnectCredential() })
        checkConnectionButton = actionButton("Check CircleCI ↔ ChatGPT handoff") { checkConnection() }
        root.addView(checkConnectionButton)
        fetchButton = actionButton("Fetch report") { fetchReport() }
        root.addView(fetchButton)
        shareButton = actionButton("Share report") { shareReport() }
        root.addView(shareButton)

        statusText = TextView(this).apply {
            textSize = 14f
            setPadding(0, dp(18), 0, 0)
            text = "Ready."
        }
        root.addView(statusText)
        setContentView(scroll)
    }

    private fun field(hintText: String): EditText = EditText(this).apply {
        hint = hintText
        textSize = 15f
        singleLine = true
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
    }

    private fun label(value: String) = TextView(this).apply {
        text = value
        textSize = 13f
        setPadding(0, dp(10), 0, 0)
    }

    private fun actionButton(title: String, action: () -> Unit) = Button(this).apply {
        text = title
        setOnClickListener { action() }
        isAllCaps = false
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun loadNonSecretConfiguration() {
        originInput.setText(prefs.getString(ORIGIN, "").orEmpty())
        projectInput.setText(prefs.getString(PROJECT, "").orEmpty())
        connectionInput.setText(prefs.getString(CONNECTION, "").orEmpty())
    }

    private fun saveConfiguration() {
        val origin = normalizeOrigin(originInput.text.toString())
        val project = projectInput.text.toString().trim()
        val connection = connectionInput.text.toString().trim()
        val enteredToken = tokenInput.text.toString().trim()

        if (origin == null) {
            statusText.text = "Invalid origin. Use HTTPS, the standard port, and an origin only (no path, query or fragment)."
            return
        }
        if (!SAFE_ID.matches(project)) {
            statusText.text = "Project ID contains unsupported characters or is empty."
            return
        }
        if (connection.isNotEmpty() && !SAFE_ID.matches(connection)) {
            statusText.text = "Connection ID contains unsupported characters."
            return
        }
        if (enteredToken.isEmpty() && !prefs.contains(TOKEN_CIPHERTEXT)) {
            statusText.text = "Enter the Bearer token locally before saving."
            return
        }
        if (enteredToken.isNotEmpty() && !isValidBearerToken(enteredToken)) {
            statusText.text = "Bearer token format is invalid or exceeds the 4096-character limit."
            return
        }

        try {
            val editor = prefs.edit()
                .putString(ORIGIN, origin)
                .putString(PROJECT, project)
                .putString(CONNECTION, connection)
            if (enteredToken.isNotEmpty()) {
                editor.putString(TOKEN_CIPHERTEXT, encryptToken(enteredToken))
            }
            if (!editor.commit()) throw IllegalStateException("Local configuration could not be saved.")
            tokenInput.text.clear()
            statusText.text = "Configuration saved locally. The token is encrypted by Android Keystore."
        } catch (_: Exception) {
            statusText.text = "Could not securely save the credential. Existing configuration was not verified."
        }
    }

    private fun disconnectCredential() {
        if (fetching) {
            statusText.text = "Wait for the current report request to finish before disconnecting."
            return
        }
        try {
            if (!prefs.edit().clear().commit()) {
                throw IllegalStateException("Local configuration could not be cleared.")
            }
            var keyRemoved = true
            try {
                val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS)
            } catch (_: Exception) {
                keyRemoved = false
            }
            tokenInput.text.clear()
            originInput.text.clear()
            projectInput.text.clear()
            connectionInput.text.clear()
            val reportDir = File(cacheDir, "reports")
            var reportsRemoved = true
            val cachedReports = reportDir.listFiles()
            if (cachedReports == null && reportDir.exists()) {
                reportsRemoved = false
            } else {
                cachedReports?.forEach { file ->
                    val removed = if (file.isDirectory) file.deleteRecursively() else file.delete()
                    if (!removed && file.exists()) reportsRemoved = false
                }
            }
            latestReportFile = null
            shareButton.isEnabled = false
            statusText.text = when {
                keyRemoved && reportsRemoved ->
                    "All local configuration, credential data and temporary reports cleared."
                !keyRemoved && !reportsRemoved ->
                    "Configuration cleared, but Keystore key and cached-report cleanup could not both be verified."
                !keyRemoved ->
                    "Local configuration and reports cleared, but Keystore key cleanup could not be verified."
                else ->
                    "Configuration and Keystore key cleared, but cached-report deletion could not be verified."
            }
        } catch (_: Exception) {
            statusText.text = "Could not clear local configuration. Review app storage before reconnecting."
        }
    }

    /**
     * Verifies the authenticated assistant-facing API path and performs a live,
     * read-only CircleCI probe. This confirms the Bridge handoff path, not that
     * a separate ChatGPT conversation currently has an authenticated session.
     */
    private fun checkConnection() {
        if (fetching) return
        val origin = normalizeOrigin(prefs.getString(ORIGIN, "").orEmpty())
        val project = prefs.getString(PROJECT, "").orEmpty()
        val connection = prefs.getString(CONNECTION, "").orEmpty()
        if (origin == null || !SAFE_ID.matches(project) || !prefs.contains(TOKEN_CIPHERTEXT)) {
            statusText.text = "Save a valid API origin, project ID and credential first."
            return
        }

        fetching = true
        checkConnectionButton.isEnabled = false
        fetchButton.isEnabled = false
        shareButton.isEnabled = false
        statusText.text = "Checking the authenticated ChatGPT handoff and CircleCI read connection…"

        executor.execute {
            try {
                if (destroyed || Thread.currentThread().isInterrupted) return@execute
                val token = decryptToken(prefs.getString(TOKEN_CIPHERTEXT, "") ?: "")
                if (!isValidBearerToken(token)) throw IllegalStateException("Stored credential is invalid. Re-enter it in the app.")
                val status = requestConnectionStatus(origin, project, connection, token)
                if (!status.connected) throw IllegalStateException(status.message)
                // The report endpoint is the same bounded private endpoint intended
                // for the no-MCP ChatGPT handoff; fetching it proves that path works.
                requestReport(origin, project, connection, token)
                if (destroyed || Thread.currentThread().isInterrupted) return@execute
                runOnUiThread {
                    if (!destroyed) {
                        statusText.text = "Connection check successful. Android → CI Bridge → CircleCI read probe is available; the private ChatGPT report endpoint also returned a valid report. This does not prove a separate ChatGPT conversation is currently authenticated."
                        checkConnectionButton.isEnabled = true
                        fetchButton.isEnabled = true
                        fetching = false
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    if (!destroyed) {
                        statusText.text = safeErrorMessage(e)
                        checkConnectionButton.isEnabled = true
                        fetchButton.isEnabled = true
                        shareButton.isEnabled = false
                        fetching = false
                    }
                }
            }
        }
    }

    private data class ConnectionStatus(val connected: Boolean, val message: String)

    private fun requestConnectionStatus(
        origin: String,
        project: String,
        connection: String,
        token: String
    ): ConnectionStatus {
        val query = StringBuilder().append("project_id=").append(enc(project))
        if (connection.isNotBlank()) query.append("&connection_id=").append(enc(connection))
        val conn = (URL("$origin/api/v1/status?$query").openConnection() as HttpsURLConnection).apply {
            requestMethod = "GET"
            instanceFollowRedirects = false
            connectTimeout = 12_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            useCaches = false
        }
        activeConnection = conn
        if (destroyed || Thread.currentThread().isInterrupted) {
            activeConnection = null
            conn.disconnect()
            throw InterruptedException("Activity is no longer active.")
        }
        try {
            val code = conn.responseCode
            if (code in 300..399) throw IllegalStateException("The API redirected the connection check; redirects are blocked.")
            if (code != HttpsURLConnection.HTTP_OK) {
                throw IllegalStateException("Connection check failed with HTTP $code. Check the local configuration and API availability.")
            }
            val mediaType = conn.contentType?.substringBefore(';')?.trim()?.lowercase()
            if (mediaType != "application/json" && mediaType?.endsWith("+json") != true) {
                throw IllegalStateException("Connection check returned an unexpected content type; JSON was required.")
            }
            val body = conn.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(2048)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    if (total > MAX_STATUS_BYTES) throw IllegalStateException("Connection status exceeded the 8 KB safety limit.")
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            val raw = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(body)).toString()
            if (raw.contains(token)) throw IllegalStateException("The connection response unexpectedly contained credential material.")
            val status = CircleCiConnectionValidator.validate(JSONObject(raw), project, connection.takeIf { it.isNotBlank() })
            return ConnectionStatus(status.connected, status.message)
        } finally {
            if (activeConnection === conn) activeConnection = null
            conn.disconnect()
        }
    }

    private fun fetchReport() {
        if (fetching) return
        val origin = normalizeOrigin(prefs.getString(ORIGIN, "").orEmpty())
        val project = prefs.getString(PROJECT, "").orEmpty()
        val connection = prefs.getString(CONNECTION, "").orEmpty()
        if (origin == null || !SAFE_ID.matches(project) || !prefs.contains(TOKEN_CIPHERTEXT)) {
            statusText.text = "Save a valid API origin, project ID and credential first."
            return
        }

        fetching = true
        fetchButton.isEnabled = false
        shareButton.isEnabled = false
        latestReportFile = null
        statusText.text = "Fetching the bounded read-only report…"

        executor.execute {
            try {
                if (destroyed || Thread.currentThread().isInterrupted) return@execute
                val token = decryptToken(prefs.getString(TOKEN_CIPHERTEXT, "") ?: "")
                if (!isValidBearerToken(token)) throw IllegalStateException("Stored credential is invalid. Re-enter it in the app.")
                val report = requestReport(origin, project, connection, token)
                if (destroyed || Thread.currentThread().isInterrupted) return@execute
                val file = writePrivateReport(report)
                if (destroyed || Thread.currentThread().isInterrupted) {
                    file.delete()
                    return@execute
                }
                latestReportFile = file
                runOnUiThread {
                    if (!destroyed) {
                        statusText.text = buildReportSummary(report)
                        shareButton.isEnabled = true
                        fetchButton.isEnabled = true
                        fetching = false
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    if (!destroyed) {
                        statusText.text = safeErrorMessage(e)
                        fetchButton.isEnabled = true
                        shareButton.isEnabled = false
                        fetching = false
                    }
                }
            }
        }
    }

    private fun requestReport(origin: String, project: String, connection: String, token: String): JSONObject {
        val query = StringBuilder()
            .append("project_id=").append(enc(project))
            .append("&run_limit=10&event_limit=20&after=0")
        if (connection.isNotBlank()) query.append("&connection_id=").append(enc(connection))

        val url = URL("$origin/api/v1/report?$query")
        val conn = (url.openConnection() as HttpsURLConnection).apply {
            requestMethod = "GET"
            instanceFollowRedirects = false
            connectTimeout = 12_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            useCaches = false
        }

        activeConnection = conn
        if (destroyed || Thread.currentThread().isInterrupted) {
            activeConnection = null
            conn.disconnect()
            throw InterruptedException("Activity is no longer active.")
        }
        try {
            val code = conn.responseCode
            if (code in 300..399) throw IllegalStateException("The API redirected the request; redirects are blocked.")
            if (code != HttpsURLConnection.HTTP_OK) {
                throw IllegalStateException("Report request failed with HTTP $code. Check the local configuration and API availability.")
            }
            val mediaType = conn.contentType?.substringBefore(';')?.trim()?.lowercase()
            if (mediaType != "application/json" && mediaType?.endsWith("+json") != true) {
                throw IllegalStateException("The API returned an unexpected content type; JSON was required.")
            }
            val body = conn.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    if (total > MAX_REPORT_BYTES) throw IllegalStateException("The report exceeded the 100 KB safety limit.")
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            val raw = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(body)).toString()
            if (raw.contains(token)) throw IllegalStateException("The response unexpectedly contained credential material; export was blocked.")
            val report = JSONObject(raw)
            ReportValidator.validate(report, project, connection.takeIf { it.isNotBlank() })
            if (ReportValidator.containsSensitiveKey(report)) {
                throw IllegalStateException("The response contains a credential-like field; export was blocked.")
            }
            return report
        } finally {
            if (activeConnection === conn) activeConnection = null
            conn.disconnect()
        }
    }

    private fun buildReportSummary(report: JSONObject): String {
        val project = report.getJSONObject("project")
        val runs = report.getJSONObject("runs")
        val events = report.getJSONObject("events")
        val completeness = report.optJSONObject("completeness") ?: JSONObject()
        val generatedAt = report.optString("generated_at")
        val partial = completeness.optBoolean("runs_limited", false) ||
            !completeness.optBoolean("events_available", false)
        return buildString {
            append(if (partial) "Report received — PARTIAL / REVIEW REQUIRED\n" else "Report received — review before sharing\n")
            append("Project: ").append(project.optString("name", project.optString("id"))).append("\n")
            append("Generated: ").append(generatedAt).append("\n")
            append("Runs: ").append(runs.optInt("returned")).append("; failed: ").append(runs.optInt("failed_count")).append("\n")
            append("Events: ").append(events.optInt("returned")).append("; available: ").append(events.optBoolean("available"))
            if (events.has("error")) append("\nEvent note: ").append(events.optString("error"))
            append("\nThe JSON remains in private temporary storage until cleanup.")
        }
    }

    private fun writePrivateReport(report: JSONObject): File {
        val dir = File(cacheDir, "reports")
        if (!dir.exists() && !dir.mkdirs()) {
            throw IllegalStateException("Private report storage could not be created.")
        }
        val temporary = File.createTempFile("znect-ci-report-", ".tmp", dir)
        try {
            temporary.writeText(report.toString(), Charsets.UTF_8)
            val stamp = report.optString("generated_at").replace(Regex("[^A-Za-z0-9]"), "-").take(40)
            val destination = File(dir, "znect-ci-report-$stamp-${System.currentTimeMillis()}.json")
            if (!temporary.renameTo(destination)) {
                throw IllegalStateException("The private report could not be finalized safely.")
            }
            val previousFiles = dir.listFiles()
            if (previousFiles == null) {
                val currentRemoved = destination.delete()
                if (!currentRemoved && destination.exists()) {
                    throw IllegalStateException("Private report storage inspection failed and the current report could not be removed.")
                }
                throw IllegalStateException("Private report storage could not be inspected for cleanup.")
            }
            previousFiles.filter { it != destination }.forEach { oldFile ->
                val removed = if (oldFile.isDirectory) oldFile.deleteRecursively() else oldFile.delete()
                if (!removed && oldFile.exists()) {
                    val currentRemoved = destination.delete()
                    if (!currentRemoved && destination.exists()) {
                        throw IllegalStateException("Previous and current temporary report cleanup could not be verified.")
                    }
                    throw IllegalStateException("Previous temporary report cleanup could not be verified.")
                }
            }
            return destination
        } finally {
            if (temporary.exists() && !temporary.delete() && temporary.exists()) {
                throw IllegalStateException("Temporary report cleanup could not be verified.")
            }
        }
    }

    private fun shareReport() {
        val file = latestReportFile
        if (file == null || !file.exists()) {
            statusText.text = "Fetch a report before sharing."
            shareButton.isEnabled = false
            return
        }
        try {
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newUri(contentResolver, "Znect CI report", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, "Share CI report"))
        } catch (_: Exception) {
            statusText.text = "Android could not open the system sharing menu."
        }
    }

    private fun encryptToken(token: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }

    private fun decryptToken(value: String): String {
        val parts = value.split(":")
        if (parts.size != 2) throw IllegalStateException("Stored credential is invalid. Re-enter it in the app.")
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun normalizeOrigin(raw: String): String? = OriginPolicy.normalize(raw)

    private fun isValidBearerToken(value: String): Boolean = BearerTokenPolicy.isValid(value)

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun cleanExpiredReports() {
        val dir = File(cacheDir, "reports")
        if (!dir.exists()) return
        val files = dir.listFiles()
        if (files == null) {
            expiredReportCleanupFailed = true
            return
        }
        val cutoff = System.currentTimeMillis() - REPORT_TTL_MS
        files.filter { it.lastModified() < cutoff }.forEach { file ->
            val removed = if (file.isDirectory) file.deleteRecursively() else file.delete()
            if (!removed && file.exists()) expiredReportCleanupFailed = true
        }
    }

    private fun safeErrorMessage(error: Exception): String {
        val message = error.message.orEmpty()
        return if (message.contains("HTTP") || message.contains("report", true) ||
            message.contains("origin", true) || message.contains("credential", true) ||
            message.contains("redirect", true) || message.contains("project", true) ||
            message.contains("100 KB")
        ) message else "Could not retrieve the report. Check connectivity and local configuration."
    }

    override fun onDestroy() {
        destroyed = true
        latestReportFile = null
        activeConnection?.disconnect()
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val PREFS = "znect_ci_exporter"
        private const val ORIGIN = "api_origin"
        private const val PROJECT = "project_id"
        private const val CONNECTION = "connection_id"
        private const val TOKEN_CIPHERTEXT = "token_ciphertext"
        private const val KEY_ALIAS = "znect_ci_bridge_report_token_v1"
        private const val MAX_REPORT_BYTES = 100 * 1024
        private const val MAX_STATUS_BYTES = 8 * 1024
        private const val REPORT_TTL_MS = 30 * 60 * 1000L
        private val SAFE_ID = Regex("^[A-Za-z0-9._:-]{1,128}$")
    }
}
