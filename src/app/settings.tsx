import React, { useMemo } from 'react'
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useOnboarding } from '../state/useOnboarding'
import { useMoney } from '../state/useMoney'
import { useTracks } from '../state/useTracks'
import { useEvents } from '../state/useEvents'
import { useTrackMaps } from '../state/useTrackMaps'
import { useSettings } from '../state/useSettings'

export default function SettingsScreen() {
  const resetOnboarding = useOnboarding((s) => s.reset)
  const resetMoney = useMoney((s) => s.reset)
  const resetTracks = useTracks((s) => s.reset)
  const resetEvents = useEvents((s) => s.reset)
  const resetMaps = useTrackMaps((s) => s.resetAll)
  const resetSettings = useSettings((s) => s.reset)

  const enlargedLeader = useSettings((s) => s.enlargedLeader)
  const setEnlargedLeader = useSettings((s) => s.setEnlargedLeader)
  const enableAds = useSettings((s) => s.enableAds)
  const setEnableAds = useSettings((s) => s.setEnableAds)

  const toggleLabel = useMemo(() => (enlargedLeader ? 'On' : 'Off'), [enlargedLeader])
  const adsToggleLabel = useMemo(() => (enableAds ? 'On' : 'Off'), [enableAds])

  function doReset() {
    resetOnboarding()
    resetMoney()
    resetTracks()
    resetEvents()
    resetMaps()
    resetSettings()
    router.replace('/')
  }

  function handleReset() {
    Alert.alert(
      'Reset everything?',
      'This will clear all progress, tracks, events, maps, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: doReset },
      ],
    )
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Enlarged leader</Text>
            <Text style={styles.rowSubtitle}>
              Makes the race leader easier to spot on the track.
            </Text>
          </View>

          <Pressable
            onPress={() => setEnlargedLeader(!enlargedLeader)}
            style={({ pressed }) => [
              styles.pill,
              enlargedLeader ? styles.pillOn : styles.pillOff,
              pressed && styles.pressed,
            ]}
            hitSlop={10}
          >
            <Text
              style={[styles.pillText, enlargedLeader ? styles.pillTextOn : styles.pillTextOff]}
            >
              {toggleLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Enable ads</Text>
            <Text style={styles.rowSubtitle}>Optionally watch ads to earn rewards.</Text>
          </View>

          <Pressable
            onPress={() => setEnableAds(!enableAds)}
            style={({ pressed }) => [
              styles.pill,
              enableAds ? styles.pillOn : styles.pillOff,
              pressed && styles.pressed,
            ]}
            hitSlop={10}
          >
            <Text style={[styles.pillText, enableAds ? styles.pillTextOn : styles.pillTextOff]}>
              {adsToggleLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ✅ Tips section */}
      <View style={styles.cardTips}>
        <Text style={styles.tipsTitle}>Tips</Text>

        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>
            Make sure to edit the track in the <Text style={styles.tipStrong}>Map</Text> section.
          </Text>
        </View>

        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>
            <Text style={styles.tipStrong}>Capacity</Text> and{' '}
            <Text style={styles.tipStrong}>Entertainment</Text> impact profit the most.
          </Text>
        </View>

        <View style={styles.tipItem}>
          <Text style={styles.tipBullet}>•</Text>
          <Text style={styles.tipText}>
            <Text style={styles.tipStrong}>Safety</Text> can be used to get the highest rating out
            of each track.
          </Text>
        </View>
      </View>

      <View style={styles.cardDanger}>
        <Text style={styles.dangerTitle}>Danger zone</Text>
        <Text style={styles.dangerSubtitle}>
          Resetting will remove all saved progress on this device.
        </Text>

        <Pressable
          onPress={handleReset}
          style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
        >
          <Text style={styles.dangerBtnText}>Reset everything</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    gap: 14,
    backgroundColor: '#0B0D12',
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginTop: 4,
  },

  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  rowText: {
    flex: 1,
    gap: 3,
  },

  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  rowSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pillOn: {
    backgroundColor: 'rgba(70, 255, 170, 0.18)',
    borderColor: 'rgba(70, 255, 170, 0.35)',
  },

  pillOff: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },

  pillText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  pillTextOn: {
    color: '#7DFFBF',
  },

  pillTextOff: {
    color: 'rgba(255,255,255,0.75)',
  },

  // ✅ Tips styles
  cardTips: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(120, 170, 255, 0.22)',
    backgroundColor: 'rgba(120, 170, 255, 0.10)',
    gap: 10,
  },

  tipsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  tipItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },

  tipBullet: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '900',
    marginTop: 1,
  },

  tipText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 18,
  },

  tipStrong: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  cardDanger: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 80, 80, 0.22)',
    backgroundColor: 'rgba(255, 80, 80, 0.10)',
    gap: 10,
  },

  dangerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  dangerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 18,
  },

  dangerBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 80, 80, 0.95)',
  },

  dangerBtnText: {
    color: '#0B0D12',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
})
