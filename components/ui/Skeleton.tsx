import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height,
  borderRadius = 8,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.8,
        duration: 850,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.4,
        duration: 850,
        useNativeDriver: true,
      }),
    ]);

    Animated.loop(pulse).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.light.skeleton,
  },
});
