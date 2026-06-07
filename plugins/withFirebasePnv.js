const fs = require('node:fs');
const path = require('node:path');
const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');

const PNV_DEPENDENCY = 'implementation("com.google.firebase:firebase-pnv:16.1.0")';

function withFirebasePnv(config) {
  config = withAppBuildGradle(config, (modConfig) => {
    if (!modConfig.modResults.contents.includes('com.google.firebase:firebase-pnv')) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    // Firebase Phone Number Verification for Android development builds.\n    ${PNV_DEPENDENCY}`,
      );
    }
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = modConfig.android?.package || 'com.oroya.app';
      const projectRoot = modConfig.modRequest.platformProjectRoot;
      const sourceRoot = path.join(
        projectRoot,
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
      );
      fs.mkdirSync(sourceRoot, { recursive: true });

      fs.writeFileSync(
        path.join(sourceRoot, 'FirebasePhoneNumberVerificationModule.kt'),
        buildModuleSource(packageName),
      );
      fs.writeFileSync(
        path.join(sourceRoot, 'FirebasePhoneNumberVerificationPackage.kt'),
        buildPackageSource(packageName),
      );

      const mainApplicationPath = path.join(sourceRoot, 'MainApplication.kt');
      if (fs.existsSync(mainApplicationPath)) {
        const current = fs.readFileSync(mainApplicationPath, 'utf8');
        const updated = addPackageToMainApplication(current);
        if (updated !== current) {
          fs.writeFileSync(mainApplicationPath, updated);
        }
      }

      return modConfig;
    },
  ]);

  return config;
}

function addPackageToMainApplication(contents) {
  if (contents.includes('FirebasePhoneNumberVerificationPackage()')) {
    return contents;
  }

  const packageListPattern = /(val packages = PackageList\(this\)\.packages\s*)/;
  if (packageListPattern.test(contents)) {
    return contents.replace(
      packageListPattern,
      `$1\n    packages.add(FirebasePhoneNumberVerificationPackage())\n`,
    );
  }

  const returnPattern = /return PackageList\(this\)\.packages/;
  if (returnPattern.test(contents)) {
    return contents.replace(
      returnPattern,
      'return PackageList(this).packages.apply { add(FirebasePhoneNumberVerificationPackage()) }',
    );
  }

  return contents;
}

function buildModuleSource(packageName) {
  return `package ${packageName}

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.pnv.FirebasePhoneNumberVerification

class FirebasePhoneNumberVerificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "FirebasePhoneNumberVerification"

  @ReactMethod
  fun getVerifiedPhoneNumber(privacyPolicyUrl: String, promise: Promise) {
    val activity = getCurrentActivity()
    if (activity == null) {
      promise.reject("firebase_pnv_activity_missing", "Android activity is not available.")
      return
    }

    if (!privacyPolicyUrl.startsWith("https://")) {
      promise.reject("firebase_pnv_privacy_policy_missing", "A HTTPS privacy policy URL is required.")
      return
    }

    val fpnv = FirebasePhoneNumberVerification.getInstance()

    fpnv
      .getVerificationSupportInfo()
      .addOnSuccessListener { results ->
        if (!results.any { it.isSupported() }) {
          promise.reject("firebase_pnv_unsupported", "Firebase PNV is not supported by this device or carrier.")
          return@addOnSuccessListener
        }

        fpnv
          .getVerifiedPhoneNumber(activity)
          .addOnSuccessListener { result ->
            val response = Arguments.createMap()
            response.putString("phoneNumber", result.getPhoneNumber())
            response.putString("token", result.getToken())
            promise.resolve(response)
          }
          .addOnFailureListener { error ->
            promise.reject("firebase_pnv_verification_failed", error.message ?: "Firebase PNV failed.", error)
          }
      }
      .addOnFailureListener { error ->
        promise.reject("firebase_pnv_support_check_failed", error.message ?: "Firebase PNV support check failed.", error)
      }
  }
}
`;
}

function buildPackageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FirebasePhoneNumberVerificationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(FirebasePhoneNumberVerificationModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

module.exports = createRunOncePlugin(withFirebasePnv, 'with-firebase-pnv', '1.0.0');
