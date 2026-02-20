import { Ionicons } from '@expo/vector-icons'
import {
  type CarUpgrade,
  type UpgradeMode,
  type UpgradeTier,
  type UpgradeType,
  useTeam,
} from '@state/useTeam'
import formatMoney from '@utils/money'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function TogglePill(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.togglePill,
        props.active && styles.togglePillActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.toggleText, props.active && styles.toggleTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

function UpgradeCard({ upgrade, mode }: { upgrade: CarUpgrade; mode: UpgradeMode }) {
  const quoteCarUpgrade = useTeam((s: any) => s.quoteCarUpgrade)
  const upgradeCarByMode = useTeam((s: any) => s.upgradeCarByMode)
  const quoteTierUpgrade = useTeam((s: any) => s.quoteTierUpgrade)
  const upgradeTier = useTeam((s: any) => s.upgradeTier)

  const quote = useMemo(
    () => quoteCarUpgrade(upgrade.type, mode),
    [upgrade.type, upgrade.level, mode],
  )

  const maxed = !!quote && quote.ok === false && quote.reason === 'already_max'
  const levels = quote?.ok ? quote.levels : 0
  const cost = quote?.ok ? quote.cost : 0

  const affordable = React.useMemo(() => {
    return !!quote?.ok && quote.affordable === true && levels > 0
  }, [quote, levels])

  const disabled = React.useMemo(() => {
    return !quote || maxed || !affordable || upgrade.upgrading
  }, [quote, maxed, affordable, upgrade.upgrading])

  const leftTitle = maxed ? 'Max Level' : upgrade.upgrading ? 'Upgrading' : `Buy ${levels}`
  const leftSub = maxed
    ? 'Fully upgraded'
    : upgrade.upgrading
      ? `To level ${upgrade.upgradeTargetLevel}`
      : quote?.ok && !quote.affordable
        ? 'Not enough money'
        : `Level ${upgrade.level} → ${upgrade.level + levels}`

  const handleUpgrade = () => {
    if (disabled) return
    upgradeCarByMode(upgrade.type, mode)
  }

  // Tier upgrade logic
  const tierOrder: UpgradeTier[] = ['basic', 'improved', 'advanced', 'elite', 'ultimate']
  const currentTierIndex = tierOrder.indexOf(upgrade.tier)
  const nextTier = currentTierIndex < tierOrder.length - 1 ? tierOrder[currentTierIndex + 1] : null
  const canTierUpgrade = upgrade.level >= 100 && nextTier !== null && !upgrade.upgrading

  const tierQuote = useMemo(() => {
    if (!canTierUpgrade || !nextTier) return null
    return quoteTierUpgrade(upgrade.type, nextTier)
  }, [upgrade.type, upgrade.tier, upgrade.level, canTierUpgrade, nextTier])

  const tierAffordable = tierQuote?.ok && tierQuote.affordable === true
  const tierDisabled = !canTierUpgrade || !tierQuote?.ok || !tierAffordable

  const handleTierUpgrade = () => {
    if (tierDisabled || !nextTier) return
    upgradeTier(upgrade.type, nextTier)
  }

  const upgradeIcons: Record<UpgradeType, any> = {
    engine: 'speedometer',
    transmission: 'cog',
    suspension: 'git-network',
    brakes: 'stop-circle',
    aerodynamics: 'airplane',
    tires: 'radio-button-on',
  }

  const tierLabels: Record<UpgradeTier, string> = {
    basic: 'Basic',
    improved: 'Improved',
    advanced: 'Advanced',
    elite: 'Elite',
    ultimate: 'Ultimate',
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={upgradeIcons[upgrade.type]} size={20} color="#FFFFFF" />
          <Text style={styles.cardTitle}>
            {upgrade.type.charAt(0).toUpperCase() + upgrade.type.slice(1)}
          </Text>
        </View>
        <View style={styles.tierBadge}>
          <Text style={styles.tierBadgeText}>{tierLabels[upgrade.tier]}</Text>
        </View>
      </View>

      {upgrade.upgrading && upgrade.upgradeProgress !== undefined && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${upgrade.upgradeProgress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {Math.floor(upgrade.upgradeProgress * 100)}% complete
          </Text>
        </View>
      )}

      <View style={styles.bigRow}>
        <Text style={styles.bigValue}>{upgrade.level}</Text>
        <Text style={styles.bigUnit}> / 100</Text>
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

      {canTierUpgrade && nextTier && (
        <View style={styles.tierUpgradeSection}>
          <View style={styles.tierUpgradeLeft}>
            <Ionicons name="arrow-up-circle" size={18} color="rgba(255,255,255,0.70)" />
            <Text style={styles.tierUpgradeText}>Upgrade to {tierLabels[nextTier]}</Text>
          </View>
          <Pressable
            onPress={handleTierUpgrade}
            disabled={tierDisabled}
            style={({ pressed }) => [
              styles.tierUpgradeBtn,
              tierDisabled && styles.tierUpgradeBtnDisabled,
              pressed && !tierDisabled && styles.tierUpgradeBtnPressed,
            ]}
          >
            <Text
              style={[styles.tierUpgradeBtnText, tierDisabled && styles.tierUpgradeBtnTextDisabled]}
            >
              {tierQuote?.ok ? formatMoney(tierQuote.cost) : '...'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default function UpgradesPage() {
  const upgrades = useTeam((s: any) => s.upgrades)
  const tick = useTeam((s: any) => s.tick)

  const [mode, setMode] = useState<UpgradeMode>('x1')

  // Tick every 100ms to update progress bars
  useEffect(() => {
    const interval = setInterval(() => {
      tick(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [tick])

  const totalRating = upgrades.reduce((sum: number, u: any) => sum + u.value, 0)

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Car Upgrades</Text>
          <Text style={styles.pageSubtitle}>
            Total Rating: {(totalRating / upgrades.length).toFixed(1)}
          </Text>
        </View>

        <View style={styles.toggleRow}>
          <TogglePill label="x1" active={mode === 'x1'} onPress={() => setMode('x1')} />
          <TogglePill label="x10" active={mode === 'x10'} onPress={() => setMode('x10')} />
          <TogglePill label="MAX" active={mode === 'max'} onPress={() => setMode('max')} />
        </View>
      </View>

      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsContent}
        showsVerticalScrollIndicator={false}
      >
        {upgrades.map((upgrade: any) => (
          <UpgradeCard key={upgrade.type} upgrade={upgrade} mode={mode} />
        ))}
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

  toggleRow: { flexDirection: 'row', gap: 10 },
  togglePill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  togglePillActive: { backgroundColor: '#0B0F14', borderColor: 'rgba(0,0,0,0.18)' },
  toggleText: { fontWeight: '900', fontSize: 14, color: 'rgba(11,15,20,0.75)' },
  toggleTextActive: { color: '#FFFFFF' },

  pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },

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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },

  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  tierBadgeText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '900' },

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

  tierUpgradeSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tierUpgradeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierUpgradeText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 14,
    fontWeight: '800',
  },

  tierUpgradeBtn: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(245,197,66,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,66,0.3)',
  },
  tierUpgradeBtnPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  tierUpgradeBtnText: { color: '#F5C542', fontWeight: '900', fontSize: 14 },

  tierUpgradeBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tierUpgradeBtnTextDisabled: { color: 'rgba(255,255,255,0.40)' },
})
