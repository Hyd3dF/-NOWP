import React, { useCallback, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import Animated from 'react-native-reanimated';
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
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
  route: string;
}

const FAB_ACTIONS: FABAction[] = [
  {
    label: 'Send Money',
    icon: 'arrow-up-circle',
    color: colors.light.primary,
    bgColor: '#F0EDFF',
    route: '/send',
  },
  {
    label: 'Receive Money',
    icon: 'arrow-down-circle',
    color: colors.light.success,
    bgColor: colors.light.successLight,
    route: '/receive',
  },
  {
    label: 'Request Money',
    icon: 'notifications',
    color: colors.light.warning,
    bgColor: colors.light.warningLight,
    route: '/send',
  },
  {
    label: 'Show QR Code',
    icon: 'qr-code',
    color: colors.light.secondary,
    bgColor: '#E0FFFE',
    route: '/qr/show',
  },
  {
    label: 'Scan QR Code',
    icon: 'scan',
    color: colors.light.textPrimary,
    bgColor: colors.light.borderLight,
    route: '/qr/scan',
  },
];

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
        opacity={0}
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
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Action Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['45%']}
        enablePanDownToClose
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        style={styles.sheetContainer}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {FAB_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.actionItem,
                  pressed && styles.actionItemPressed,
                ]}
                onPress={() => handleActionPress(action.route)}
              >
                <View
                  style={[
                    styles.actionIconContainer,
                    { backgroundColor: action.bgColor },
                  ]}
                >
                  <Ionicons name={action.icon} size={26} color={action.color} />
                </View>
                <Text style={styles.actionLabel} numberOfLines={2}>
                  {action.label}
                </Text>
              </Pressable>
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
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContainer: {
    zIndex: 999,
  },
  sheetBackground: {
    backgroundColor: colors.light.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  sheetHandle: {
    backgroundColor: colors.light.border,
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  actionItem: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  actionItemPressed: {
    backgroundColor: colors.light.borderLight,
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.light.textPrimary,
    textAlign: 'center',
  },
});
