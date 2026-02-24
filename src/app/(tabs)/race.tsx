import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function RaceTab() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Racing Feature</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
        <Text style={styles.description}>
          The racing feature is currently being developed. Focus on building your team with the best
          drivers and car upgrades!
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0B0F14',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F5C542',
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(11,15,20,0.60)',
    textAlign: 'center',
    lineHeight: 24,
  },
})
