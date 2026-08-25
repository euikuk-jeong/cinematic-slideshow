import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';

import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const AUDIO_GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['audio'];

interface DeviceAudioItem {
  id: string;
  title: string;
}

export interface DeviceMusicPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: { sourceValue: string; title: string }) => void;
}

export function DeviceMusicPickerModal({ visible, onClose, onSelect }: DeviceMusicPickerModalProps) {
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } =
    useMediaLibraryPermission(AUDIO_GRANULAR_PERMISSIONS);
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [tracks, setTracks] = useState<DeviceAudioItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (visible && isReady && (state === 'idle' || state === 'denied')) start();
  }, [visible, isReady, state, start]);

  useEffect(() => {
    if (!visible || state !== 'granted') return;
    let cancelled = false;
    setLoadError(false);
    new MediaLibrary.Query()
      .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.AUDIO)
      .exe()
      .then((assets) => Promise.all(assets.map(async (asset) => ({ id: asset.id, title: await asset.getFilename() }))))
      .then((result) => {
        if (!cancelled) setTracks(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, state]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>기기 음악에서 선택</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>
        {state === 'rationale' && (
          <PermissionRationale variant="audio" onConfirm={confirmRationale} onCancel={onClose} />
        )}
        {(state === 'blocked' || state === 'partial_unsupported') && (
          <PermissionBlocked variant="audio_blocked" onOpenSettings={openSettings} />
        )}
        {state === 'granted' && loadError && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>음악 목록을 불러오지 못했어요</Text>
          </View>
        )}
        {state === 'granted' && !loadError && tracks === null && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}
        {state === 'granted' && !loadError && tracks !== null && (
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>선택할 수 있는 음악 파일이 없어요</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect({ sourceValue: item.id, title: item.title });
                  onClose();
                }}
              >
                <Text style={styles.rowText}>{item.title}</Text>
              </Pressable>
            )}
          />
        )}
        {(state === 'idle' || state === 'requesting') && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.ink,
    },
    closeText: {
      color: c.textSecondary,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: c.textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
    },
    row: {
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    rowText: {
      fontSize: 16,
      color: c.ink,
    },
  });
}
