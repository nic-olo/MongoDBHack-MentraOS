import {Linking, Platform} from "react-native"

/**
 * Helper utility for opening iOS Bluetooth Settings
 * Used during audio pairing flow to guide users to pair Mentra Live glasses
 */
export class BluetoothSettingsHelper {
  /**
   * Opens the iOS Bluetooth Settings page
   * Returns true if successful, false otherwise
   * Only works on iOS - returns false on other platforms
   */
  static async openBluetoothSettings(): Promise<boolean> {
    if (Platform.OS !== "ios") {
      console.warn("BluetoothSettingsHelper: Only supported on iOS")
      return false
    }

    try {
      await Linking.openURL("App-Prefs:Bluetooth")
      return true
    } catch (error) {
      console.error("BluetoothSettingsHelper: Failed to open Bluetooth settings:", error)
      return false
    }
  }
}
