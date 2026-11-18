plugins { id("com.android.application") }
android {
    namespace = "com.znect.cibridge.exporter"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.znect.cibridge.exporter"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies { implementation("androidx.core:core:1.15.0") }
