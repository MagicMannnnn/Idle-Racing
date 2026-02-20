import { Ionicons } from '@expo/vector-icons'
import { useTeam } from '@state/useTeam'
import { router } from 'expo-router'
import React, { useEffect } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function TeamCard({
  icon,
  title,
  bigValue,
  bigUnit,
  subtitle,
  onPress,
  upgrading,
}: {
  icon: string
  title: string
  bigValue: string
  bigUnit: string
  subtitle: string
  onPress: () => void
  upgrading?: boolean
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={icon as any} size={20} color="#FFFFFF" />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {upgrading && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Upgrading</Text>
          </View>
        )}
      </View>

      <View style={styles.bigRow}>
        <Text style={styles.bigValue}>{bigValue}</Text>
        <Text style={styles.bigUnit}>{bigUnit}</Text>
      </View>

      <View style={styles.cardBottomRow}>
        <View style={styles.leftInfo}>
          <Text style={styles.subtitleText}>{subtitle}</Text>
        </View>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.viewBtn, pressed && styles.viewBtnPressed]}
        >
          <Text style={styles.viewBtnText}>View</Text>
          <Ionicons name="chevron-forward" size={18} color="#0B0F14" />
        </Pressable>
      </View>
    </View>
  )
}

export default function TeamIndex() {
  const hq = useTeam((s: any) => s.hq)
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const tick = useTeam((s: any) => s.tick)

  // Tick every 100ms to update progress bars
  useEffect(() => {
    const interval = setInterval(() => {
      tick(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [tick])

  const hiredDrivers = drivers.filter((d: any) => d.hiringProgress === undefined)
  const hiringDrivers = drivers.filter((d: any) => d.hiringProgress !== undefined)

  const avgDriverRating =
    hiredDrivers.length > 0
      ? hiredDrivers.reduce((sum: number, d: any) => sum + d.rating, 0) / hiredDrivers.length
      : 0

  const carRating = upgrades.reduce((sum: number, u: any) => sum + u.value, 0) / upgrades.length

  const activeUpgrades = upgrades.filter((u: any) => u.upgrading).length

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Text style={styles.pageTitle}>My Team</Text>
        <Text style={styles.pageSubtitle}>Headquarters • Drivers • Upgrades</Text>
      </View>

      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsContent}
        showsVerticalScrollIndicator={false}
      >
        <TeamCard
          icon="business"
          title="Headquarters"
          bigValue={`Level ${hq.level}`}
          bigUnit=""
          subtitle={`Unlocks ${hq.maxDriverRating}★ drivers • Reduces build time`}
          onPress={() => router.push('/team/hq' as any)}
          upgrading={hq.upgrading}
        />

        <TeamCard
          icon="people"
          title="Drivers"
          bigValue={`${hiredDrivers.length}`}
          bigUnit=" / 2"
          subtitle={
            hiringDrivers.length > 0
              ? `${hiringDrivers.length} driver${hiringDrivers.length > 1 ? 's' : ''} hiring...`
              : avgDriverRating > 0
                ? `Average rating: ${avgDriverRating.toFixed(1)}★`
                : 'No drivers hired yet'
          }
          onPress={() => router.push('/team/drivers' as any)}
          upgrading={hiringDrivers.length > 0}
        />

        <TeamCard
          icon="car-sport"
          title="Car Upgrades"
          bigValue={carRating.toFixed(1)}
          bigUnit=""
          subtitle={
            activeUpgrades > 0
              ? `${activeUpgrades} component${activeUpgrades > 1 ? 's' : ''} upgrading...`
              : `${upgrades.length} components ready for racing`
          }
          onPress={() => router.push('/team/upgrades' as any)}
          upgrading={activeUpgrades > 0}
        />
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
    gap: 6,
  },

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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,149,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
  },
  statusPillText: { color: '#FF9500', fontSize: 12, fontWeight: '900' },

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

  subtitleText: { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontWeight: '800' },

  viewBtn: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 90,
  },
  viewBtnPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  viewBtnText: { color: '#0B0F14', fontWeight: '900', fontSize: 16 },
})
