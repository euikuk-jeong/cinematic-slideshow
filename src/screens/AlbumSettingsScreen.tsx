import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import {
  getAlbumByDeviceId,
  getMusicTrackById,
  getSlideshowSettingsByAlbumId,
  insertAlbum,
  upsertMusicTrack,
  upsertSlideshowSettings,
} from '../db/client';
import type { Album, MusicSourceType, OrderMode, RepeatMode } from '../db/types';
import type { RootStackParamList } from '../../App';
import { DeviceMusicPickerModal } from './DeviceMusicPickerModal';

const TRANSITION_INTERVAL_MIN_SEC = 2;
const TRANSITION_INTERVAL_MAX_SEC = 10;

interface SelectedMusic {
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
}

type AlbumSettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'AlbumSettings'>;

export function AlbumSettingsScreen({ route }: AlbumSettingsScreenProps) {
  const { deviceAlbumId, displayName } = route.params;

  const [loading, setLoading] = useState(true);
  const [album, setAlbum] = useState<Album | null>(null);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(4);
  const [orderMode, setOrderMode] = useState<OrderMode>('sequential');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('loop');
  const [selectedMusic, setSelectedMusic] = useState<SelectedMusic | null>(null);
  const [devicePickerVisible, setDevicePickerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await getAlbumByDeviceId(deviceAlbumId);
      const resolvedAlbum = existing ?? (await insertAlbum(deviceAlbumId, displayName));
      const settings = await getSlideshowSettingsByAlbumId(resolvedAlbum.id);
      if (cancelled) return;

      setAlbum(resolvedAlbum);
      if (settings) {
        setTransitionIntervalSec(settings.transitionIntervalSec);
        setOrderMode(settings.orderMode);
        setRepeatMode(settings.repeatMode);
        if (settings.musicTrackId != null) {
          const track = await getMusicTrackById(settings.musicTrackId);
          if (!cancelled && track) {
            setSelectedMusic({ sourceType: track.sourceType, sourceValue: track.sourceValue, title: track.title });
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceAlbumId, displayName]);

  async function persist(overrides: {
    transitionIntervalSec?: number;
    orderMode?: OrderMode;
    repeatMode?: RepeatMode;
    selectedMusic?: SelectedMusic | null;
  }) {
    if (!album) return;
    const next = {
      transitionIntervalSec,
      orderMode,
      repeatMode,
      selectedMusic,
      ...overrides,
    };
    let musicTrackId: number | null = null;
    if (next.selectedMusic) {
      const track = await upsertMusicTrack(
        next.selectedMusic.sourceType,
        next.selectedMusic.sourceValue,
        next.selectedMusic.title
      );
      musicTrackId = track.id;
    }
    await upsertSlideshowSettings(album.id, next.transitionIntervalSec, next.orderMode, next.repeatMode, musicTrackId);
  }

  if (loading || !album) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  function handleOrderModeChange(mode: OrderMode) {
    setOrderMode(mode);
    persist({ orderMode: mode });
  }

  function handleRepeatModeChange(mode: RepeatMode) {
    setRepeatMode(mode);
    persist({ repeatMode: mode });
  }

  function handleSlidingComplete(value: number) {
    const rounded = Math.round(value);
    setTransitionIntervalSec(rounded);
    persist({ transitionIntervalSec: rounded });
  }

  function handleSelectMusic(music: SelectedMusic | null) {
    setSelectedMusic(music);
    persist({ selectedMusic: music });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>전환 간격</Text>
      <Text style={styles.sectionValue}>{transitionIntervalSec}초</Text>
      <Slider
        minimumValue={TRANSITION_INTERVAL_MIN_SEC}
        maximumValue={TRANSITION_INTERVAL_MAX_SEC}
        step={1}
        value={transitionIntervalSec}
        onSlidingComplete={handleSlidingComplete}
      />

      <Text style={styles.sectionTitle}>순서</Text>
      <View style={styles.row}>
        <ToggleButton label="순차" active={orderMode === 'sequential'} onPress={() => handleOrderModeChange('sequential')} />
        <ToggleButton label="랜덤" active={orderMode === 'random'} onPress={() => handleOrderModeChange('random')} />
      </View>

      <Text style={styles.sectionTitle}>반복</Text>
      <View style={styles.row}>
        <ToggleButton label="1회 재생" active={repeatMode === 'once'} onPress={() => handleRepeatModeChange('once')} />
        <ToggleButton label="무한 반복" active={repeatMode === 'loop'} onPress={() => handleRepeatModeChange('loop')} />
      </View>

      <Text style={styles.sectionTitle}>배경음악</Text>
      <ToggleButton label="없음" active={selectedMusic === null} onPress={() => handleSelectMusic(null)} fullWidth />
      {BUNDLED_MUSIC_TRACKS.map((track) => (
        <ToggleButton
          key={track.category}
          label={`${track.title} (${track.artist})`}
          active={selectedMusic?.sourceType === 'bundled' && selectedMusic.sourceValue === track.category}
          onPress={() => handleSelectMusic({ sourceType: 'bundled', sourceValue: track.category, title: track.title })}
          fullWidth
        />
      ))}
      {Platform.OS === 'android' && (
        <ToggleButton
          label={
            selectedMusic?.sourceType === 'device' ? `기기 음악: ${selectedMusic.title ?? selectedMusic.sourceValue}` : '기기에서 선택'
          }
          active={selectedMusic?.sourceType === 'device'}
          onPress={() => setDevicePickerVisible(true)}
          fullWidth
        />
      )}

      {Platform.OS === 'android' && (
        <DeviceMusicPickerModal
          visible={devicePickerVisible}
          onClose={() => setDevicePickerVisible(false)}
          onSelect={(track) => handleSelectMusic({ sourceType: 'device', sourceValue: track.sourceValue, title: track.title })}
        />
      )}
    </ScrollView>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  fullWidth,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      style={[styles.toggleButton, active && styles.toggleButtonActive, fullWidth && styles.toggleButtonFullWidth]}
      onPress={onPress}
    >
      <Text style={[styles.toggleButtonText, active && styles.toggleButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionValue: {
    fontSize: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  toggleButtonFullWidth: {
    alignSelf: 'stretch',
  },
  toggleButtonActive: {
    borderColor: '#FC836D',
    backgroundColor: '#FFF1EE',
  },
  toggleButtonText: {
    fontSize: 14,
    textAlign: 'center',
  },
  toggleButtonTextActive: {
    color: '#FC836D',
    fontWeight: '600',
  },
});
