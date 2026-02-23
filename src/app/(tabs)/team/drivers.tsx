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
const CARD_WIDTH = Platform.OS === 'web' ? Math.min(380, SCREEN_WIDTH - 52) : SCREEN_WIDTH - 52

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
  'Sam Rivera',
  'Jordan Hayes',
  'Skylar Reed',
  'Parker Stone',
  'Rowan Chase',
  'Sage Mitchell',
  'Phoenix Wright',
  'River Banks',
  'Kai Fisher',
  'Ellis Grant',
  'Ashton Cole',
  'Logan Pierce',
  'Harper Quinn',
  'Finley Brooks',
  'Kendall Fox',
  'Hayden Cruz',
  'Emerson Gray',
  'Reagan Mills',
  'Sawyer Hart',
  'Peyton Rose',
  'Sutton Vale',
  'Jules Knight',
  'Marley Stone',
  'London Ray',
  'Brooklyn West',
  'Eden Cross',
  'Lennox Page',
  'Armani Blake',
  'Jaden Storm',
  'Remy Lane',
]

interface DriverOption {
  name: string
  rating: number
  contractLength: number // in milliseconds
}

function StarRating({ rating, maxRating = 5 }: { rating: number; maxRating?: number }) {
  return (
    <View style={styles.starRating}>
      {Array.from({ length: maxRating }).map((_, i) => {
        const starFill = Math.max(0, Math.min(1, rating - i))

        // Full star
        if (starFill >= 1) {
          return <Ionicons key={i} name="star" size={20} color="#FFD700" />
        }
        // Partial star
        if (starFill > 0) {
          return (
            <View key={i} style={{ position: 'relative' }}>
              <Ionicons name="star-outline" size={20} color="rgba(255,255,255,0.30)" />
              <View
                style={{
                  position: 'absolute',
                  overflow: 'hidden',
                  width: 20 * starFill,
                }}
              >
                <Ionicons name="star" size={20} color="#FFD700" />
              </View>
            </View>
          )
        }
        // Empty star
        return <Ionicons key={i} name="star-outline" size={20} color="rgba(255,255,255,0.30)" />
      })}
    </View>
  )
}

function DriverCard({ driver, onFire }: { driver: Driver; onFire: () => void }) {
  const isHiring = driver.hiringProgress !== undefined
  const [now, setNow] = useState(Date.now())

  // Update time every second for contract countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTimeRemaining = (expiresAt: number) => {
    const remaining = Math.max(0, expiresAt - now)
    const totalSeconds = Math.floor(remaining / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s remaining`
    } else {
      return `${seconds}s remaining`
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.driverNumber}>
          <Text style={styles.driverNumberText}>#{driver.number}</Text>
        </View>
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
        <Text style={styles.ratingText}>{driver.rating.toFixed(2)}★ Driver</Text>
      </View>

      <View style={styles.driverMeta}>
        {isHiring ? (
          <Text style={styles.driverMetaText}>Hiring in progress...</Text>
        ) : driver.contractExpiresAt ? (
          <View style={styles.contractInfo}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.60)" />
            <Text style={styles.driverMetaText}>
              Contract: {formatTimeRemaining(driver.contractExpiresAt)}
            </Text>
          </View>
        ) : (
          <Text style={styles.driverMetaText}>Ready to race</Text>
        )}
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
  const [driverNumber, setDriverNumber] = useState<string>('')
  const scrollViewRef = useRef<ScrollView>(null)

  // Generate driver options ensuring at least one per 0.5 rating range (memoized)
  const driverOptions = useMemo<DriverOption[]>(() => {
    const options: DriverOption[] = []
    const usedNames = new Set<string>()

    // Calculate required 0.5 ranges from 0.5 up to max rating
    const requiredRanges: number[] = []
    for (let r = 0.5; r <= hq.maxDriverRating; r += 0.5) {
      requiredRanges.push(r)
    }

    // Ensure at least one driver per 0.5 rating range
    requiredRanges.forEach((baseRating) => {
      let name: string
      do {
        name = DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)]
      } while (usedNames.has(name))
      usedNames.add(name)

      // Generate rating within ±0.25 of the base rating, to 2 decimal places
      const minR = Math.max(0.5, baseRating - 0.25)
      const maxR = Math.min(hq.maxDriverRating, baseRating + 0.25)
      const rating = parseFloat((minR + Math.random() * (maxR - minR)).toFixed(2))

      // Random contract length between 30 and 120 minutes, in milliseconds
      const contractMinutes = 30 + Math.random() * 90 // 30-120 minutes
      const contractLength = Math.round(contractMinutes * 60 * 1000)

      options.push({ name, rating, contractLength })
    })

    // Fill remaining slots with random drivers (up to 5 total)
    while (options.length < 5) {
      let name: string
      do {
        name = DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)]
      } while (usedNames.has(name))
      usedNames.add(name)

      // Random rating across full range
      const rating = parseFloat((0.5 + Math.random() * (hq.maxDriverRating - 0.5)).toFixed(2))

      // Random contract length
      const contractMinutes = 30 + Math.random() * 90
      const contractLength = Math.round(contractMinutes * 60 * 1000)

      options.push({ name, rating, contractLength })
    }

    return options
  }, [showHireCarousel, hq.maxDriverRating]) // Only regenerate when carousel is opened

  // Set random driver number when carousel opens
  useEffect(() => {
    if (showHireCarousel && !driverNumber) {
      setDriverNumber(String(Math.floor(Math.random() * 100) + 1))
    }
  }, [showHireCarousel])

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
    const number = driverNumber
      ? Math.max(1, Math.min(100, parseInt(driverNumber) || 1))
      : undefined

    const result = hireDriver(name, option.rating, option.contractLength, number)
    if (!result.ok) {
      if (result.reason === 'not_enough_money') {
        alert('Not enough money!')
      } else if (result.reason === 'slots_full') {
        alert('All driver slots are full!')
      } else if (result.reason === 'rating_too_high') {
        alert(`Upgrade your HQ to unlock ${option.rating}-star drivers!`)
      } else if (result.reason === 'number_taken') {
        alert(`Driver number ${number} is already in use! Please choose a different number.`)
      }
      return
    }

    setShowHireCarousel(false)
    setCustomName('')
    setDriverNumber('')
  }

  const handleFire = (driverId: string, driverName: string) => {
    if (confirm(`Are you sure you want to fire ${driverName}?`)) {
      fireDriver(driverId)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.replace('/team')} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Drivers</Text>
          <Text style={styles.pageSubtitle}>
            {allDrivers.length}/{hq.maxDriverRating} slots • Max {hq.maxDriverRating}★ rating
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
        {allDrivers.length < hq.maxDriverRating && (
          <EmptyDriverSlot onHire={() => setShowHireCarousel(true)} />
        )}

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
              showsHorizontalScrollIndicator={Platform.OS === 'web'}
              contentContainerStyle={styles.carouselContent}
              snapToInterval={Platform.OS === 'web' ? undefined : CARD_WIDTH}
              decelerationRate="fast"
              style={Platform.OS === 'web' ? { maxWidth: '100%' } : undefined}
            >
              {driverOptions.map((option, idx) => {
                const quote = quoteDriver(option.rating, option.contractLength)
                const affordable = quote.ok && quote.affordable
                const disabled = !quote.ok || !affordable

                return (
                  <View key={idx} style={styles.carouselCard}>
                    <View style={styles.carouselCardInner}>
                      <View style={styles.carouselDriverInfo}>
                        <Text style={styles.carouselDriverName}>{option.name}</Text>
                        <View style={styles.ratingRow}>
                          <StarRating rating={option.rating} />
                          <Text style={styles.carouselRatingText}>{option.rating.toFixed(2)}★</Text>
                        </View>
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

                      <View style={styles.customNameSection}>
                        <Text style={styles.customNameLabel}>Driver number (1-100):</Text>
                        <View style={styles.numberInputRow}>
                          <TextInput
                            style={[styles.customNameInput, styles.numberInput]}
                            value={driverNumber}
                            onChangeText={setDriverNumber}
                            placeholder="Auto"
                            placeholderTextColor="rgba(255,255,255,0.40)"
                            keyboardType="numeric"
                            maxLength={3}
                          />
                          <Pressable
                            style={styles.randomBtn}
                            onPress={() =>
                              setDriverNumber(String(Math.floor(Math.random() * 100) + 1))
                            }
                          >
                            <Ionicons name="shuffle" size={18} color="#FFFFFF" />
                          </Pressable>
                        </View>
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
                            {quote.ok ? `${Math.floor(quote.time)}s hire` : '???'}
                          </Text>
                        </View>
                        <View style={styles.carouselStat}>
                          <Ionicons
                            name="calendar-outline"
                            size={18}
                            color="rgba(255,255,255,0.70)"
                          />
                          <Text style={styles.carouselStatText}>
                            {quote.ok
                              ? `${Math.round(quote.contractLength / 60000)}min contract`
                              : '???'}
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

  driverNumber: {
    backgroundColor: '#F5C542',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 42,
    alignItems: 'center',
  },
  driverNumberText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '900',
  },

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
  contractInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    ...(Platform.OS === 'web' && {
      flexDirection: 'row',
    }),
  },
  carouselCard: {
    width: CARD_WIDTH,
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
  carouselRatingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
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
  numberInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  numberInput: {
    flex: 1,
  },
  randomBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 10,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  carouselStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  carouselStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carouselStatText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
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
