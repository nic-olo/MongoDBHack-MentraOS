import {ScrollView} from "react-native"

import {MicrophoneSelector} from "@/components/glasses/settings/MicrophoneSelector"
import {Header, Screen} from "@/components/ignite"
import {Spacer} from "@/components/ui"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS, useSetting} from "@/stores/settings"
import {$styles} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {PermissionFeatures, requestFeaturePermissions} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"

export default function MicrophoneScreen() {
  const {theme, themed} = useAppTheme()
  const {goBack} = useNavigationHistory()
  const [preferredMic, setPreferredMic] = useSetting(SETTINGS.preferred_mic.key)

  const setMic = async (val: string) => {
    if (val === "phone") {
      // We're potentially about to enable the mic, so request permission
      const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE)
      if (!hasMicPermission) {
        // Permission denied, don't toggle the setting
        console.log("Microphone permission denied, cannot enable phone microphone")
        showAlert(
          "Microphone Permission Required",
          "Microphone permission is required to use the phone microphone feature. Please grant microphone permission in settings.",
          [{text: "OK"}],
          {
            iconName: "microphone",
            iconColor: "#2196F3",
          },
        )
        return
      }
    }

    await setPreferredMic(val)
  }

  return (
    <Screen preset="fixed" style={themed($styles.screen)}>
      <Header titleTx="microphoneSettings:title" leftIcon="chevron-left" onLeftPress={goBack} />
      <Spacer height={theme.spacing.s6} />
      <ScrollView>
        <MicrophoneSelector preferredMic={preferredMic} onMicChange={setMic} />
      </ScrollView>
    </Screen>
  )
}
