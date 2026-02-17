import React, { use, useMemo } from 'react'
import { View, Text, Pressable, Alert, StyleSheet, ScrollView, Platform } from 'react-native'
import Slider from '@react-native-community/slider'
import { router, useNavigation } from 'expo-router'
import { useOnboarding } from '../state/useOnboarding'
import { useMoney } from '../state/useMoney'
import { useTracks } from '../state/useTracks'
import { useEvents } from '../state/useEvents'
import { useTrackMaps } from '../state/useTrackMaps'
import { useSettings } from '../state/useSettings'
import { usePrestige } from '../state/usePrestige'

const DEFAULT_SPEED_VARIANCE = 12
const DEFAULT_MAX_CAR_COUNT = 20

export default function SettingsScreen() {
  const navigation = useNavigation()

  const resetOnboarding = useOnboarding((s: any) => s.reset)
  const resetMoney = useMoney((s: any) => s.reset)
  const resetTracks = useTracks((s: any) => s.reset)
  const resetEvents = useEvents((s: any) => s.reset)
  const resetMaps = useTrackMaps((s: any) => s.resetAll)
  const resetSettings = useSettings((s: any) => s.reset)
  const resetPrestige = usePrestige((s: any) => s.reset)

  const enlargedLeader = useSettings((s: any) => s.enlargedLeader)
  const setEnlargedLeader = useSettings((s: any) => s.setEnlargedLeader)

  const enableAds = useSettings((s: any) => s.enableAds)
  const setEnableAds = useSettings((s: any) => s.setEnableAds)

  const speedVariance = useSettings((s: any) => s.speedVariance)
  const setSpeedVariance = useSettings((s: any) => s.setSpeedVariance)
  const resetSpeedVariance = useSettings((s: any) => s.resetSpeedVariance)

  const maxCarCount = useSettings((s: any) => s.maxCarCount)
  const setMaxCarCount = useSettings((s: any) => s.setMaxCarCount)
  const resetMaxCarCount = useSettings((s: any) => s.resetMaxCarCount)

  const toggleLabel = useMemo(() => (enlargedLeader ? 'On' : 'Off'), [enlargedLeader])
  const adsToggleLabel = useMemo(() => (enableAds ? 'On' : 'Off'), [enableAds])

  const isWeb = Platform.OS === 'web'

  function doReset() {
    resetOnboarding()
    resetMoney()
    resetTracks()
    resetEvents()
    resetMaps()
    resetSettings()
    resetPrestige()
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

  const speedIsDefault = speedVariance === DEFAULT_SPEED_VARIANCE
  const maxCarIsDefault = maxCarCount === DEFAULT_MAX_CAR_COUNT

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
              <Text style={styles.rowSubtitle}>
                {isWeb
                  ? 'Ads are only supported on the app version.'
                  : 'Optionally watch ads to earn rewards.'}
              </Text>
            </View>

            <Pressable
              onPress={() => !isWeb && setEnableAds(!enableAds)}
              disabled={isWeb}
              style={({ pressed }) => [
                styles.pill,
                enableAds && !isWeb ? styles.pillOn : styles.pillOff,
                isWeb && styles.pillDisabled,
                pressed && !isWeb && styles.pressed,
              ]}
              hitSlop={10}
            >
              <Text
                style={[
                  styles.pillText,
                  enableAds && !isWeb ? styles.pillTextOn : styles.pillTextOff,
                  isWeb && styles.pillTextDisabled,
                ]}
              >
                {!isWeb ? adsToggleLabel : 'Off'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Race speed variance</Text>
              <Text style={styles.rowSubtitle}>
                Adds randomness to car pace during races. Higher = more variation.
              </Text>
            </View>

            <View style={styles.valuePill}>
              <Text style={styles.valuePillText}>{Math.round(speedVariance)}</Text>
            </View>
          </View>

          <View style={styles.sliderWrap}>
            <Slider
              value={speedVariance}
              minimumValue={1}
              maximumValue={50}
              step={1}
              onValueChange={setSpeedVariance}
              minimumTrackTintColor="rgba(120, 170, 255, 0.95)"
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor="#FFFFFF"
            />

            <View style={styles.sliderMetaRow}>
              <Text style={styles.sliderMeta}>1</Text>
              <Text style={styles.sliderMeta}>50</Text>
            </View>

            <Pressable
              onPress={resetSpeedVariance}
              disabled={speedIsDefault}
              style={({ pressed }) => [
                styles.secondaryBtn,
                speedIsDefault && styles.secondaryBtnDisabled,
                pressed && !speedIsDefault && styles.pressed,
              ]}
            >
              <Text
                style={[styles.secondaryBtnText, speedIsDefault && styles.secondaryBtnTextDisabled]}
              >
                Reset to default ({DEFAULT_SPEED_VARIANCE})
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Maximum car count</Text>
              <Text style={styles.rowSubtitle}>
                Limit car count to help performance or add variation to races.
              </Text>
            </View>

            <View style={styles.valuePill}>
              <Text style={styles.valuePillText}>{Math.round(maxCarCount)}</Text>
            </View>
          </View>

          <View style={styles.sliderWrap}>
            <Slider
              value={maxCarCount}
              minimumValue={5}
              maximumValue={100}
              step={1}
              onValueChange={setMaxCarCount}
              minimumTrackTintColor="rgba(120, 170, 255, 0.95)"
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor="#FFFFFF"
            />

            <View style={styles.sliderMetaRow}>
              <Text style={styles.sliderMeta}>5</Text>
              <Text style={styles.sliderMeta}>100</Text>
            </View>

            <Pressable
              onPress={resetMaxCarCount}
              disabled={maxCarIsDefault}
              style={({ pressed }) => [
                styles.secondaryBtn,
                maxCarIsDefault && styles.secondaryBtnDisabled,
                pressed && !maxCarIsDefault && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.secondaryBtnText,
                  maxCarIsDefault && styles.secondaryBtnTextDisabled,
                ]}
              >
                Reset to default ({DEFAULT_MAX_CAR_COUNT})
              </Text>
            </Pressable>
          </View>
        </View>

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

          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>
              Track upgrades are only applied once the current event has finished.
            </Text>
          </View>

          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Better events are available for higher rated tracks.</Text>
          </View>

          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>
              Use a range of events to keep your tracks active, while other events are in cooldown.
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
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B0D12',
  },

  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
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
    gap: 12,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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

  pillDisabled: {
    opacity: 0.4,
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

  pillTextDisabled: {
    color: 'rgba(255,255,255,0.5)',
  },

  valuePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuePillText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  sliderWrap: {
    gap: 10,
  },

  sliderMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  sliderMeta: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
  },

  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  secondaryBtnDisabled: {
    opacity: 0.6,
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  secondaryBtnTextDisabled: {
    color: 'rgba(255,255,255,0.75)',
  },

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
