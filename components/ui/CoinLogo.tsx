import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { getLogoUrl } from '@/services/api/payments';

interface CoinLogoProps {
  symbol: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function CoinLogo({ symbol, size = 32, style }: CoinLogoProps) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const logoUrl = useMemo(() => getLogoUrl(normalizedSymbol), [normalizedSymbol]);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [logoUrl]);

  const initials = normalizedSymbol.slice(0, 3);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.fallbackText,
          {
            fontSize: size <= 32 ? 9 : 10,
            lineHeight: size <= 32 ? 11 : 12,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {initials}
      </Text>
      {!hasError ? (
        <Image
          source={{ uri: logoUrl }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              opacity: isLoaded ? 1 : 0,
            },
          ]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.light.borderLight,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  fallbackText: {
    ...typography.caption,
    color: colors.light.textSecondary,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.light.surface,
  },
});
