import { Image, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { getInitials } from '../../utils/format';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  style?: StyleProp<any>;
}

/**
 * Deterministic color palette for initials-based avatars.
 * A name string is hashed to pick from this palette.
 */
const AVATAR_COLORS = [
  '#6C5CE7',
  '#00CEC9',
  '#E17055',
  '#FDCB6E',
  '#0984E3',
  '#D63031',
  '#00B894',
  '#E84393',
  '#636E72',
  '#2D3436',
  '#A29BFE',
  '#74B9FF',
];

const getColorFromName = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

export const Avatar: React.FC<AvatarProps> = ({
  uri,
  name,
  size = 44,
  style,
}) => {
  const initials = getInitials(name);
  const backgroundColor = getColorFromName(name);
  const fontSize = size * 0.38;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.initialsContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.light.border,
  },
  initialsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
