import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val localProperties =
    Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }

android {
    // Deliberately generic -- avoid a package name that reads as a
    // tracking/monitoring app if someone checks Settings > Apps > App info.
    namespace = "com.devicesync.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.devicesync.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        // Baked in at build time -- there's no in-app field for this (see
        // AutoRegisterScreen.kt). Set `serverUrl=http://192.168.1.10:3000` in
        // android/local.properties (gitignored) for a persistent override, or
        // pass `-PserverUrl=...` for a one-off build. Defaults to the
        // emulator's alias for the host machine's localhost, which only
        // works from an emulator, not a physical device.
        val serverUrl =
            (project.findProperty("serverUrl") as String?)
                ?: localProperties.getProperty("serverUrl")
                ?: "http://10.0.2.2:3000"
        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // Pinned to a BOM/AndroidX generation that still targets compileSdk 36 --
    // newer releases require compileSdk 37 + AGP 9.1, which isn't stable yet.
    val composeBom = platform("androidx.compose:compose-bom:2025.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.security:security-crypto:1.1.0")

    implementation("com.google.android.gms:play-services-location:21.4.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.11.0")

    // Community-maintained fork of Google's prebuilt WebRTC AAR --
    // org.webrtc:google-webrtc is no longer published since JCenter shut
    // down. Used for the live camera view (video-only, no audio track).
    implementation("io.getstream:stream-webrtc-android:1.3.10")

    testImplementation("org.jetbrains.kotlin:kotlin-test")
}
