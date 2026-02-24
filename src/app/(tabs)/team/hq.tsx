import { Ionicons } from '@expo/vector-icons'
import { useTeam } from '@state/useTeam'
import formatMoney from '@utils/money'
import { router } from 'expo-router'
import React, { useEffect, useMemo } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function formatTime(seconds: number) {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export default function HQPage() {
  const hq = useTeam((s: any) => s.hq)
  const quoteHQUpgrade = useTeam((s: any) => s.quoteHQUpgrade)
  const upgradeHQ = useTeam((s: any) => s.upgradeHQ)
  const tick = useTeam((s: any) => s.tick)

  // Tick every 100ms to update progress bars
  useEffect(() => {
    const interval = setInterval(() => {
      tick(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [tick])

  const quote = quoteHQUpgrade()

  const timeReduction = Math.min(90, hq.level * 2)

  const maxed = !!quote && quote.ok === false && quote.reason === 'already_max'
  const cost = quote?.ok ? quote.cost : 0
  const time = quote?.ok ? quote.time : 0
  const affordable = quote?.ok && quote.affordable === true

  const disabled = useMemo(() => {
    return !quote || maxed || !affordable || hq.upgrading
  }, [quote, maxed, affordable, hq.upgrading])

  const leftTitle = maxed ? 'Max Level' : hq.upgrading ? 'Upgrading' : 'Upgrade'
  const leftSub = maxed
    ? '90% time reduction unlocked'
    : hq.upgrading
      ? `To level ${hq.upgradeTargetLevel}`
      : quote?.ok
        ? `Level ${hq.level} → ${quote.toLevel}`
        : ''

  const handleUpgrade = () => {
    if (disabled) return
    upgradeHQ()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.replace('/team')} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Headquarters</Text>
          <Text style={styles.pageSubtitle}>
            Level {hq.level} • {hq.maxDriverRating}★ max • {timeReduction}% faster builds
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>HQ Level</Text>
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>Lv {hq.level}</Text>
            </View>
          </View>

          {hq.upgrading && hq.upgradeProgress !== undefined && (
            <View style={styles.progressSection}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${hq.upgradeProgress * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {Math.floor(hq.upgradeProgress * 100)}% complete
              </Text>
            </View>
          )}

          <View style={styles.bigRow}>
            <Text style={styles.bigValue}>{hq.maxDriverRating}★</Text>
            <Text style={styles.bigUnit}> max driver</Text>
          </View>

          <View style={styles.cardBottomRow}>
            <View style={styles.leftInfo}>
              <Text style={styles.buyLeft}>{leftTitle}</Text>
              <Text style={styles.buyLeftSub}>{leftSub}</Text>
            </View>

            <Pressable
              onPress={handleUpgrade}
              disabled={disabled}
              style={({ pressed }) => [
                styles.buyBtnSmall,
                disabled && styles.buyBtnSmallDisabled,
                pressed && !disabled && styles.buyBtnSmallPressed,
              ]}
            >
              <Text style={[styles.buyBtnSmallText, disabled && styles.buyBtnSmallTextDisabled]}>
                {maxed ? 'MAX' : quote?.ok ? formatMoney(cost) : '...'}
              </Text>
              <Ionicons name="disc-outline" size={22} color="#F5C542" />
            </Pressable>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color="rgba(255,255,255,0.70)" />
            <Text style={styles.infoTitle}>Build Time Reduction</Text>
          </View>
          <Text style={styles.infoText}>
            Each HQ level reduces hiring and upgrade times by 2%, up to a maximum of 90%.
          </Text>
          <Text style={styles.infoText}>
            Current reduction: <Text style={styles.infoHighlight}>{timeReduction}%</Text>
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="star" size={20} color="rgba(255,255,255,0.70)" />
            <Text style={styles.infoTitle}>Driver Unlocks</Text>
          </View>
          <Text style={styles.infoText}>
            • Level 1+: 2★ drivers{'\n'}• Level 5+: 3★ drivers{'\n'}• Level 10+: 4★ drivers{'\n'}•
            Level 20+: 5★ drivers
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  backIcon: { fontSize: 28, lineHeight: 28, fontWeight: '400', color: '#0B0F14' },
  backText: { fontSize: 16, fontWeight: '800', color: '#0B0F14' },

  header: { gap: 6 },
  pageTitle: { fontSize: 26, fontWeight: '900', color: '#0B0F14', letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 15, color: 'rgba(11,15,20,0.65)', fontWeight: '800' },

  cardsScroll: { flex: 1 },
  cardsContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
  },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 2 },
    }),
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },

  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  levelPillText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '900' },

  progressSection: {
    marginTop: 12,
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F5C542',
    borderRadius: 3,
  },
  progressText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    fontWeight: '800',
  },

  bigRow: { marginTop: 10, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bigValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  bigUnit: { color: 'rgba(255,255,255,0.60)', fontSize: 16, fontWeight: '800' },

  cardBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leftInfo: { flex: 1, minWidth: 0 },

  buyLeft: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  buyLeftSub: { marginTop: 4, color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '800' },

  buyBtnSmall: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 118,
  },
  buyBtnSmallPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  buyBtnSmallText: { color: '#0B0F14', fontWeight: '900', fontSize: 18 },

  buyBtnSmallDisabled: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  buyBtnSmallTextDisabled: { color: 'rgba(255,255,255,0.55)' },

  infoCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(46,46,46,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  infoText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  infoHighlight: {
    color: '#F5C542',
    fontWeight: '900',
  },
})
