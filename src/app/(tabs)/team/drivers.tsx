import { Ionicons } from '@expo/vector-icons'
import { type Driver, useTeam } from '@state/useTeam'
import formatMoney from '@utils/money'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const SCREEN_WIDTH = Dimensions.get('window').width

// Pre-generated driver names to avoid flickering
const DRIVER_NAMES = [
  'Alex Morgan',
  'Jordan Lee',
  'Taylor Swift',
  'Casey Jones',
  'Riley Cooper',
  'Morgan Freeman',
  'Jamie Fox',
  'Quinn Martin',
  'Reese Walker',
  'Dakota Blue',
  'Cameron Diaz',
  'Avery Johnson',
  'Blake Shelton',
  'Charlie Brown',
  'Drew Barrymore',
]

interface DriverOption {
  name: string
  rating: number
}

function StarRating({ rating, maxRating = 5 }: { rating: number; maxRating?: number }) {
  return (
    <View style={styles.starRating}>
      {Array.from({ length: maxRating }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < rating ? 'star' : 'star-outline'}
          size={20}
          color={i < rating ? '#FFD700' : 'rgba(255,255,255,0.30)'}
        />
      ))}
    </View>
  )
}

function DriverCard({ driver, onFire }: { driver: Driver; onFire: () => void }) {
  const isHiring = driver.hiringProgress !== undefined

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{driver.name}</Text>
        {!isHiring && (
          <Pressable
            onPress={onFire}
            style={({ pressed }) => [styles.fireBtn, pressed && styles.fireBtnPressed]}
            hitSlop={10}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </Pressable>
        )}
      </View>

      {isHiring && driver.hiringProgress !== undefined && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${driver.hiringProgress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {Math.floor(driver.hiringProgress * 100)}% complete
          </Text>
        </View>
      )}

      <View style={styles.ratingRow}>
        <StarRating rating={driver.rating} />
        <Text style={styles.ratingText}>{driver.rating}★ Driver</Text>
      </View>

      <View style={styles.driverMeta}>
        <Text style={styles.driverMetaText}>
          {isHiring ? 'Hiring in progress...' : 'Ready to race'}
        </Text>
      </View>
    </View>
  )
}

function EmptyDriverSlot({ onHire }: { onHire: () => void }) {
  return (
    <Pressable
      onPress={onHire}
      style={({ pressed }) => [styles.card, styles.emptyCard, pressed && styles.emptyCardPressed]}
    >
      <View style={styles.emptyContent}>
        <Ionicons name="add-circle" size={48} color="rgba(255,255,255,0.40)" />
        <Text style={styles.emptyText}>Hire a Driver</Text>
      </View>
    </Pressable>
  )
}

export default function DriversPage() {
  const hq = useTeam((s: any) => s.hq)
  const drivers = useTeam((s: any) => s.drivers)
  const quoteDriver = useTeam((s: any) => s.quoteDriver)
  const hireDriver = useTeam((s: any) => s.hireDriver)
  const fireDriver = useTeam((s: any) => s.fireDriver)
  const tick = useTeam((s: any) => s.tick)

  const [showHireCarousel, setShowHireCarousel] = useState(false)
  const [customName, setCustomName] = useState('')
  const scrollViewRef = useRef<ScrollView>(null)

  // Generate 5 random driver options (memoized to avoid regeneration)
  const driverOptions = useMemo<DriverOption[]>(() => {
    const options: DriverOption[] = []
    const usedNames = new Set<string>()

    for (let i = 0; i < 5; i++) {
      let name: string
      do {
        name = DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)]
      } while (usedNames.has(name))
      usedNames.add(name)

      const rating = Math.min(hq.maxDriverRating, Math.floor(Math.random() * 3) + 2) // 2-4 stars, capped by HQ
      options.push({ name, rating })
    }

    return options
  }, [showHireCarousel]) // Only regenerate when carousel is opened

  // Tick every 100ms to update progress bars
  useEffect(() => {
    const interval = setInterval(() => {
      tick(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [tick])

  const hiredDrivers = drivers.filter((d: any) => d.hiringProgress === undefined)
  const hiringDrivers = drivers.filter((d: any) => d.hiringProgress !== undefined)
  const allDrivers = [...hiringDrivers, ...hiredDrivers]

  const handleHire = (option: DriverOption, useCustomName: boolean = false) => {
    const name = useCustomName && customName.trim() ? customName.trim() : option.name

    const result = hireDriver(name, option.rating)
    if (!result.ok) {
      if (result.reason === 'not_enough_money') {
        alert('Not enough money!')
      } else if (result.reason === 'slots_full') {
        alert('All driver slots are full!')
      } else if (result.reason === 'rating_too_high') {
        alert(`Upgrade your HQ to unlock ${option.rating}-star drivers!`)
      }
      return
    }

    setShowHireCarousel(false)
    setCustomName('')
  }

  const handleFire = (driverId: string, driverName: string) => {
    if (confirm(`Are you sure you want to fire ${driverName}?`)) {
      fireDriver(driverId)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Drivers</Text>
          <Text style={styles.pageSubtitle}>
            {allDrivers.length}/2 slots • Max {hq.maxDriverRating}★ rating
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsContent}
        showsVerticalScrollIndicator={false}
      >
        {allDrivers.map((driver) => (
          <DriverCard
            key={driver.id}
            driver={driver}
            onFire={() => handleFire(driver.id, driver.name)}
          />
        ))}
        {allDrivers.length < 2 && <EmptyDriverSlot onHire={() => setShowHireCarousel(true)} />}

        {showHireCarousel && (
          <View style={styles.carouselSection}>
            <View style={styles.carouselHeader}>
              <Text style={styles.carouselTitle}>Available Drivers</Text>
              <Pressable
                onPress={() => setShowHireCarousel(false)}
                style={styles.closeCarousel}
                hitSlop={10}
              >
                <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.70)" />
              </Pressable>
            </View>

            <Text style={styles.carouselSubtitle}>Swipe to browse • Tap to hire</Text>

            <ScrollView
              ref={scrollViewRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
              snapToInterval={SCREEN_WIDTH - 52}
              decelerationRate="fast"
            >
              {driverOptions.map((option, idx) => {
                const quote = quoteDriver(option.rating)
                const affordable = quote.ok && quote.affordable
                const disabled = !quote.ok || !affordable

                return (
                  <View key={idx} style={styles.carouselCard}>
                    <View style={styles.carouselCardInner}>
                      <View style={styles.carouselDriverInfo}>
                        <Text style={styles.carouselDriverName}>{option.name}</Text>
                        <StarRating rating={option.rating} />
                      </View>

                      <View style={styles.customNameSection}>
                        <Text style={styles.customNameLabel}>Custom name (optional):</Text>
                        <TextInput
                          style={styles.customNameInput}
                          value={customName}
                          onChangeText={setCustomName}
                          placeholder="Leave blank to use suggested"
                          placeholderTextColor="rgba(255,255,255,0.40)"
                        />
                      </View>

                      <View style={styles.carouselStats}>
                        <View style={styles.carouselStat}>
                          <Ionicons name="disc-outline" size={18} color="#F5C542" />
                          <Text style={styles.carouselStatText}>
                            {quote.ok ? formatMoney(quote.cost) : '???'}
                          </Text>
                        </View>
                        <View style={styles.carouselStat}>
                          <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.70)" />
                          <Text style={styles.carouselStatText}>
                            {quote.ok ? `${Math.floor(quote.time)}s` : '???'}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => handleHire(option, !!customName.trim())}
                        disabled={disabled}
                        style={({ pressed }) => [
                          styles.hireBtn,
                          disabled && styles.hireBtnDisabled,
                          pressed && !disabled && styles.hireBtnPressed,
                        ]}
                      >
                        <Text style={[styles.hireBtnText, disabled && styles.hireBtnTextDisabled]}>
                          {disabled ? 'Not Affordable' : 'Hire Driver'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )
              })}
            </ScrollView>
          </View>
        )}
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
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', flex: 1 },

  fireBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,59,48,0.15)',
  },
  fireBtnPressed: { transform: [{ scale: 0.95 }], opacity: 0.9 },

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

  starRating: {
    flexDirection: 'row',
    gap: 4,
  },

  ratingRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ratingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '800',
  },

  driverMeta: {
    marginTop: 8,
  },
  driverMetaText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 14,
    fontWeight: '700',
  },

  emptyCard: {
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(46,46,46,0.5)',
    borderStyle: 'dashed',
  },
  emptyCardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  emptyContent: {
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '800',
  },

  carouselSection: {
    marginTop: 12,
    gap: 12,
  },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  carouselTitle: {
    color: '#0B0F14',
    fontSize: 20,
    fontWeight: '900',
  },
  closeCarousel: {
    padding: 4,
  },
  carouselSubtitle: {
    color: 'rgba(11,15,20,0.60)',
    fontSize: 14,
    fontWeight: '700',
  },

  carouselContent: {
    paddingVertical: 8,
    gap: 16,
  },
  carouselCard: {
    width: SCREEN_WIDTH - 52,
  },
  carouselCardInner: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 16,
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

  carouselDriverInfo: {
    gap: 8,
  },
  carouselDriverName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  customNameSection: {
    gap: 6,
  },
  customNameLabel: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 13,
    fontWeight: '700',
  },
  customNameInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  carouselStats: {
    flexDirection: 'row',
    gap: 16,
  },
  carouselStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carouselStatText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '800',
  },

  hireBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  hireBtnPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  hireBtnText: {
    color: '#0B0F14',
    fontSize: 17,
    fontWeight: '900',
  },

  hireBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  hireBtnTextDisabled: {
    color: 'rgba(255,255,255,0.55)',
  },
})
