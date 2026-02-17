import React from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import type { CarAnim } from './useTrackCars'
import { useSettings } from '../../state/useSettings'

type Props = {
  cars: CarAnim[]
  carW?: number
  carH?: number
  leaderId?: number | null
}

function CarView({
  car,
  carW,
  carH,
  leaderId,
}: {
  car: CarAnim
  carW: number
  carH: number
  leaderId?: number | null
}) {
  const enlargedLeader = useSettings((s: any) => s.enlargedLeader)
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    transform: [
      { translateX: car.x.value - carW / 2 },
      { translateY: car.y.value - carH / 2 },
      { rotate: `${car.rotDeg.value}deg` },
      { scale: car.id === leaderId ? (enlargedLeader ? 1.3 : 1) : 1 },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.car, { width: carW, height: carH, backgroundColor: car.colorHex }, style]}
    />
  )
}

export function CellCars({ cars, carW = 6, carH = 10, leaderId = null }: Props) {
  return (
    <Animated.View pointerEvents="none" style={styles.overlay}>
      {cars.map((c) => (
        <CarView key={c.id} car={c} carW={carW} carH={carH} leaderId={leaderId} />
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  car: {
    borderRadius: 2,
  },
})
