import { Redirect } from 'expo-router'
import { LogBox } from 'react-native'

LogBox.ignoreLogs([
  'BrowserEngineKit',
  'Failed to terminate process',
  'MediaToolbox',
  'URLAsset',
  'CoreMedia',
  'timebase',
  'VideoToolbox',
  'AudioToolbox',
  'LoudnessManager',
])

export default function Index() {
  return <Redirect href="/home" />
}
