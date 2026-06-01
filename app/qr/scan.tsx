import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Button } from '@/components/ui/Button';

export default function QRScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarcodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const payload = JSON.parse(data);
      if (payload?.type === 'oroya-payment-profile' && payload?.payment_tag) {
        router.replace({
          pathname: '/people/add',
          params: { q: String(payload.payment_tag) },
        });
        return;
      }
    } catch {
      // Invalid QR payloads are handled by resetting the scanner below.
    }

    setScanned(false);
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <HeaderBar title="Scan QR Code" showBack onBack={() => router.back()} />
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#9CA3AF" />
          <Text style={styles.permissionText}>
            Camera permission is required to scan Oroya QR codes.
          </Text>
          <Button title="Grant Camera Permission" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderBar title="Scan QR Code" showBack onBack={() => router.back()} />

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.description}>
            Align an Oroya QR code inside the frame.
          </Text>

          <View style={styles.scannerWrapper} pointerEvents="none">
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <View style={styles.scanLine} />
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.hintText}>
              Scan a profile QR code to find a user securely.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  permissionContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D1A',
  },
  permissionText: {
    ...typography.bodySm,
    color: '#9CA3AF',
    textAlign: 'center',
    marginVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
    backgroundColor: 'transparent',
  },
  description: {
    ...typography.bodySm,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scannerWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: colors.light.primary,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: borderRadius.sm,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: borderRadius.sm,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: borderRadius.sm,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: borderRadius.sm,
  },
  scanLine: {
    position: 'absolute',
    width: '90%',
    height: 3,
    backgroundColor: colors.light.primary,
    shadowColor: colors.light.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  hintText: {
    ...typography.caption,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
