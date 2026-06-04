import React, { useCallback, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  Animated as RNAnimated,
} from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';

const TAB_BAR_HEIGHT = 60;
const FAB_SIZE = 56;

interface TabItemConfig {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
}

const TAB_ITEMS: TabItemConfig[] = [
  { name: 'home', label: 'Home', icon: 'home', iconOutline: 'home-outline' },
  { name: 'people', label: 'People', icon: 'people', iconOutline: 'people-outline' },
  { name: 'activity', label: 'Activity', icon: 'receipt', iconOutline: 'receipt-outline' },
  { name: 'profile', label: 'Profile', icon: 'person', iconOutline: 'person-outline' },
];

interface FABAction {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradientColors: readonly [string, string];
  iconColor: string;
  route: string;
}

const FAB_ACTIONS: FABAction[] = [
  {
    label: 'Send to User',
    subtitle: 'Transfer to an Oroya friend',
    icon: 'paper-plane',
    gradientColors: ['#EDE9FE', '#DDD6FE'],
    iconColor: '#7C3AED',
    route: '/send',
  },
  {
    label: 'External Wallet',
    subtitle: 'Withdraw to crypto wallet',
    icon: 'wallet-outline',
    gradientColors: ['#FEE2E2', '#FECACA'],
    iconColor: '#DC2626',
    route: '/withdrawal',
  },
  {
    label: 'Receive Money',
    subtitle: 'Get paid by someone',
    icon: 'download-outline',
    gradientColors: ['#D1FAE5', '#A7F3D0'],
    iconColor: '#059669',
    route: '/receive',
  },
  {
    label: 'Deposit Crypto',
    subtitle: 'Add funds to your wallet',
    icon: 'add-circle-outline',
    gradientColors: ['#FEF3C7', '#FDE68A'],
    iconColor: '#D97706',
    route: '/deposit',
  },
  {
    label: 'Show QR Code',
    subtitle: 'Let others scan your code',
    icon: 'qr-code-outline',
    gradientColors: ['#CFFAFE', '#A5F3FC'],
    iconColor: '#0891B2',
    route: '/qr/show',
  },
  {
    label: 'Scan QR Code',
    subtitle: 'Scan to pay or connect',
    icon: 'scan-outline',
    gradientColors: ['#F3F4F6', '#E5E7EB'],
    iconColor: '#374151',
    route: '/qr/scan',
  },
];

// --- Animated Action Row ---
function ActionRow({
  action,
  onPress,
  isLast,
}: {
  action: FABAction;
  onPress: () => void;
  isLast: boolean;
}) {
  const scale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  return (
    <RNAnimated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.actionRow,
          pressed && styles.actionRowPressed,
          !isLast && styles.actionRowBorder,
        ]}
      >
        <LinearGradient
          colors={action.gradientColors as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionIconCircle}
        >
          <Ionicons name={action.icon} size={22} color={action.iconColor} />
        </LinearGradient>
        <View style={styles.actionTextContainer}>
          <Text style={styles.actionRowLabel}>{action.label}</Text>
          <Text style={styles.actionRowSubtitle}>{action.subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.light.textTertiary} />
      </Pressable>
    </RNAnimated.View>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isSheetOpen = React.useRef(false);

  const handleFabPress = useCallback(() => {
    isSheetOpen.current = !isSheetOpen.current;
    if (isSheetOpen.current) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
      isSheetOpen.current = false;
    }
  }, []);

  const handleActionPress = useCallback((route: string) => {
    bottomSheetRef.current?.close();
    isSheetOpen.current = false;
    setTimeout(() => {
      router.push(route as any);
    }, 200);
  }, [router]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    [],
  );

  // Split tabs: 2 left, 2 right (with FAB in center)
  const leftTabs = state.routes.slice(0, 2);
  const rightTabs = state.routes.slice(2, 4);

  const renderTabItem = (route: any, index: number, offset: number = 0) => {
    const actualIndex = index + offset;
    const { options } = descriptors[route.key];
    const isFocused = state.index === actualIndex;
    const config = TAB_ITEMS[actualIndex];

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        style={styles.tabItem}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
      >
        <Animated.View style={styles.tabItemInner}>
          <Ionicons
            name={isFocused ? config.icon : config.iconOutline}
            size={22}
            color={isFocused ? colors.light.primary : colors.light.textTertiary}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: isFocused ? colors.light.primary : colors.light.textTertiary,
                fontWeight: isFocused ? '600' : '400',
              },
            ]}
          >
            {config.label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <>
      <View
        style={[
          styles.tabBarContainer,
          { paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm },
        ]}
      >
        {/* Tab bar background */}
        <View style={styles.tabBarInner}>
          {/* Left tabs */}
          <View style={styles.tabGroup}>
            {leftTabs.map((route: any, i: number) => renderTabItem(route, i, 0))}
          </View>

          {/* FAB spacer */}
          <View style={styles.fabSpacer} />

          {/* Right tabs */}
          <View style={styles.tabGroup}>
            {rightTabs.map((route: any, i: number) => renderTabItem(route, i, 2))}
          </View>
        </View>

        {/* FAB Button */}
        <View style={styles.fabWrapper}>
          <Pressable onPress={handleFabPress} style={styles.fabButton}>
            <LinearGradient
              colors={['#7C3AED', '#6C5CE7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {/* Action Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['58%']}
        enablePanDownToClose
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        style={styles.sheetContainer}
      >
        <BottomSheetView style={styles.sheetContent}>
          {/* Sheet Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <View style={styles.sheetTitleIcon}>
                <Ionicons name="flash" size={16} color={colors.light.primary} />
              </View>
              <Text style={styles.sheetTitle}>Quick Actions</Text>
            </View>
            <Text style={styles.sheetSubtitle}>What would you like to do?</Text>
          </View>

          {/* Action List */}
          <View style={styles.actionsList}>
            {FAB_ACTIONS.map((action, index) => (
              <ActionRow
                key={action.label}
                action={action}
                onPress={() => handleActionPress(action.route)}
                isLast={index === FAB_ACTIONS.length - 1}
              />
            ))}
          </View>
        </BottomSheetView>
      </BottomSheet>
    </>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="people" options={{ title: 'People' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // ─── Tab Bar ───
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.light.tabBarBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.tabBarBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tabBarInner: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: '100%',
  },
  fabSpacer: {
    width: FAB_SIZE + spacing.lg,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tabLabel: {
    ...typography.tabLabel,
    letterSpacing: 0.1,
  },

  // ─── FAB ───
  fabWrapper: {
    position: 'absolute',
    top: -FAB_SIZE / 2 + 4,
    left: '50%',
    marginLeft: -FAB_SIZE / 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    ...shadows.fab,
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    overflow: 'hidden',
  },
  fabGradient: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Bottom Sheet ───
  sheetContainer: {
    zIndex: 999,
  },
  sheetBackground: {
    backgroundColor: colors.light.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  sheetHandle: {
    backgroundColor: colors.light.border,
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing['2xl'],
  },

  // ─── Sheet Header ───
  sheetHeader: {
    marginBottom: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  sheetTitleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginLeft: 36,
  },

  // ─── Action List ───
  actionsList: {
    backgroundColor: colors.light.background,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.light.surface,
  },
  actionRowPressed: {
    backgroundColor: colors.light.borderLight,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextContainer: {
    flex: 1,
  },
  actionRowLabel: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  actionRowSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
    fontSize: 11,
  },
});
