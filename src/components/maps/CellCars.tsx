import React, { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import type { CarAnim } from './useTrackCars'
import { mulberry32 } from './utils'

type Props = {
  cars: CarAnim[]
  seed?: number
  carW?: number
  carH?: number
}

const PALETTE = [
  '#ff595e',
  '#ffca3a',
  '#1982c4',
  '#6a4c93',
  '#118ab2',
  '#ef476f',
  '#ffd166',
  '#073b4c',
]

function CarView({
  car,
  color,
  carW,
  carH,
}: {
  car: CarAnim
  color: string
  carW: number
  carH: number
}) {
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    transform: [
      { translateX: car.x.value - carW / 2 },
      { translateY: car.y.value - carH / 2 },
      { rotate: `${car.rotDeg.value}deg` },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.car, { width: carW, height: carH, backgroundColor: color }, style]}
    />
  )
}

export function CellCars({ cars, seed = 12345, carW = 6, carH = 10 }: Props) {
  const colors = useMemo(
    () =>
      cars.map((c) => {
        const r = mulberry32(((seed ^ c.id) >>> 0) as number)()
        return PALETTE[Math.floor(r * PALETTE.length)]
      }),
    [cars, seed],
  )

  return (
    <Animated.View pointerEvents="none" style={styles.overlay}>
      {cars.map((c, i) => (
        <CarView key={c.id} car={c} color={colors[i]} carW={carW} carH={carH} />
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
