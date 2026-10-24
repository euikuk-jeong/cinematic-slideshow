import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';

import { getAppSetting, setAppSetting } from '../db/client';
import type { OrderMode, RepeatMode } from '../db/types';
import type { PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';
import {
  FALLBACK_ORDER_MODE,
  FALLBACK_REPEAT_MODE,
  FALLBACK_SORT_CRITERION,
  FALLBACK_SORT_DIRECTION,
  FALLBACK_TRANSITION_INTERVAL_SEC,
  defaultMusicTrackKey,
  parseDefaultMusicTracks,
  resolveSlideshowDefaults,
  serializeDefaultMusicTracks,
  SLIDESHOW_DEFAULT_MUSIC_TRACKS_KEY,
  SLIDESHOW_DEFAULT_ORDER_MODE_KEY,
  SLIDESHOW_DEFAULT_REPEAT_MODE_KEY,
  SLIDESHOW_DEFAULT_SORT_CRITERION_KEY,
  SLIDESHOW_DEFAULT_SORT_DIRECTION_KEY,
  SLIDESHOW_DEFAULT_TRANSITION_INTERVAL_SEC_KEY,
  TRANSITION_INTERVAL_MAX_SEC,
  TRANSITION_INTERVAL_MIN_SEC,
  type DefaultMusicTrack,
} from '../settings/slideshowDefaults';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { MusicPickerModal } from './MusicPickerModal';

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: PhotoSortCriterion; labelKey: string }> = [
  { criterion: 'creation_time', labelKey: 'common:sortCriterion.captureTime' },
  { criterion: 'filename', labelKey: 'common:sortCriterion.filename' },
];

const SORT_DIRECTION_OPTIONS: ReadonlyArray<{ direction: PhotoSortDirection; labelKey: string }> = [
  { direction: 'desc', labelKey: 'common:sortDirection.descending' },
  { direction: 'asc', labelKey: 'common:sortDirection.ascending' },
];

export function SlideshowDefaultsScreen() {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('slideshowDefaults');
  const styles = useMemo(() => createStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(FALLBACK_TRANSITION_INTERVAL_SEC);
  const [orderMode, setOrderMode] = useState<OrderMode>(FALLBACK_ORDER_MODE);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(FALLBACK_REPEAT_MODE);
  const [sortCriterion, setSortCriterion] = useState<PhotoSortCriterion>(FALLBACK_SORT_CRITERION);
  const [sortDirection, setSortDirection] = useState<PhotoSortDirection>(FALLBACK_SORT_DIRECTION);
  const [musicTracks, setMusicTracks] = useState<DefaultMusicTrack[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting(SLIDESHOW_DEFAULT_TRANSITION_INTERVAL_SEC_KEY),
      getAppSetting(SLIDESHOW_DEFAULT_ORDER_MODE_KEY),
      getAppSetting(SLIDESHOW_DEFAULT_REPEAT_MODE_KEY),
      getAppSetting(SLIDESHOW_DEFAULT_SORT_CRITERION_KEY),
      getAppSetting(SLIDESHOW_DEFAULT_SORT_DIRECTION_KEY),
      getAppSetting(SLIDESHOW_DEFAULT_MUSIC_TRACKS_KEY),
    ]).then(([transitionIntervalSecRaw, orderModeRaw, repeatModeRaw, sortCriterionRaw, sortDirectionRaw, musicTracksRaw]) => {
      if (cancelled) return;
      const defaults = resolveSlideshowDefaults({
        transitionIntervalSec: transitionIntervalSecRaw,
        orderMode: orderModeRaw,
        repeatMode: repeatModeRaw,
        sortCriterion: sortCriterionRaw,
        sortDirection: sortDirectionRaw,
      });
      setTransitionIntervalSec(defaults.transitionIntervalSec);
      setOrderMode(defaults.orderMode);
      setRepeatMode(defaults.repeatMode);
      setSortCriterion(defaults.sortCriterion);
      setSortDirection(defaults.sortDirection);
      setMusicTracks(parseDefaultMusicTracks(musicTracksRaw));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleOrderModeChange(mode: OrderMode) {
    setOrderMode(mode);
    await setAppSetting(SLIDESHOW_DEFAULT_ORDER_MODE_KEY, mode);
  }

  async function handleRepeatModeChange(mode: RepeatMode) {
    setRepeatMode(mode);
    await setAppSetting(SLIDESHOW_DEFAULT_REPEAT_MODE_KEY, mode);
  }

  async function handleSortCriterionChange(criterion: PhotoSortCriterion) {
    setSortCriterion(criterion);
    await setAppSetting(SLIDESHOW_DEFAULT_SORT_CRITERION_KEY, criterion);
  }

  async function handleSortDirectionChange(direction: PhotoSortDirection) {
    setSortDirection(direction);
    await setAppSetting(SLIDESHOW_DEFAULT_SORT_DIRECTION_KEY, direction);
  }

  async function saveMusicTracks(next: DefaultMusicTrack[]) {
    setMusicTracks(next);
    await setAppSetting(SLIDESHOW_DEFAULT_MUSIC_TRACKS_KEY, serializeDefaultMusicTracks(next));
  }

  async function handleMusicAdd(picked: readonly DefaultMusicTrack[]) {
    const existingKeys = new Set(musicTracks.map(defaultMusicTrackKey));
    const added = picked.filter((track) => !existingKeys.has(defaultMusicTrackKey(track)));
    if (added.length === 0) return;
    await saveMusicTracks([...musicTracks, ...added]);
  }

  async function handleMusicRemove(key: string) {
    await saveMusicTracks(musicTracks.filter((track) => defaultMusicTrackKey(track) !== key));
  }

  async function handleSlidingComplete(value: number) {
    const rounded = Math.round(value);
    setTransitionIntervalSec(rounded);
    await setAppSetting(SLIDESHOW_DEFAULT_TRANSITION_INTERVAL_SEC_KEY, String(rounded));
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.hint}>{t('hint')}</Text>

      <Text style={styles.sectionTitle}>{t('common:transitionIntervalLabel')}</Text>
      <Text style={styles.sectionValue}>{t('common:seconds', { count: transitionIntervalSec })}</Text>
      <Slider
        testID="slideshow-defaults-interval-slider"
        minimumValue={TRANSITION_INTERVAL_MIN_SEC}
        maximumValue={TRANSITION_INTERVAL_MAX_SEC}
        step={1}
        value={transitionIntervalSec}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={c.accent}
        thumbTintColor={c.accent}
        maximumTrackTintColor={c.hairline}
      />

      <Text style={styles.sectionTitle}>{t('common:sortCriterionSectionLabel')}</Text>
      {orderMode === 'random' && <Text style={styles.emptyText}>{t('common:randomOrderHint')}</Text>}
      <View style={styles.row}>
        {SORT_CRITERION_OPTIONS.map((option) => (
          <ToggleButton
            key={option.criterion}
            testID={`slideshow-defaults-sort-criterion-${option.criterion}`}
            label={t(option.labelKey)}
            active={sortCriterion === option.criterion}
            disabled={orderMode === 'random'}
            onPress={() => handleSortCriterionChange(option.criterion)}
          />
        ))}
      </View>
      <View style={styles.row}>
        {SORT_DIRECTION_OPTIONS.map((option) => (
          <ToggleButton
            key={option.direction}
            testID={`slideshow-defaults-sort-direction-${option.direction}`}
            label={t(option.labelKey)}
            active={sortDirection === option.direction}
            disabled={orderMode === 'random'}
            onPress={() => handleSortDirectionChange(option.direction)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('common:orderMode.label')}</Text>
      <View style={styles.row}>
        <ToggleButton
          testID="slideshow-defaults-order-sequential"
          label={t('common:orderMode.sequential')}
          active={orderMode === 'sequential'}
          onPress={() => handleOrderModeChange('sequential')}
        />
        <ToggleButton
          testID="slideshow-defaults-order-random"
          label={t('common:orderMode.random')}
          active={orderMode === 'random'}
          onPress={() => handleOrderModeChange('random')}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('common:repeatMode.label')}</Text>
      <View style={styles.row}>
        <ToggleButton
          testID="slideshow-defaults-repeat-once"
          label={t('common:repeatMode.once')}
          active={repeatMode === 'once'}
          onPress={() => handleRepeatModeChange('once')}
        />
        <ToggleButton
          testID="slideshow-defaults-repeat-loop"
          label={t('common:repeatMode.loop')}
          active={repeatMode === 'loop'}
          onPress={() => handleRepeatModeChange('loop')}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('musicSectionTitle')}</Text>
      <Text style={styles.emptyText}>{t('musicHint')}</Text>
      {musicTracks.length === 0 && <Text style={styles.emptyText}>{t('noMusic')}</Text>}
      {musicTracks.map((track, index) => {
        const key = defaultMusicTrackKey(track);
        return (
          <View key={key} style={styles.musicRow}>
            <View style={styles.musicRowTextGroup}>
              <Text style={styles.musicRowLabel} numberOfLines={1}>
                {index + 1}. {track.title ?? track.sourceValue}
              </Text>
              {track.artist && (
                <Text style={styles.musicRowSubLabel} numberOfLines={1}>
                  {track.artist}
                </Text>
              )}
            </View>
            <Pressable testID={`slideshow-defaults-music-remove-${key}`} onPress={() => handleMusicRemove(key)}>
              <Text style={styles.musicRowAction}>{t('removeButtonLabel')}</Text>
            </Pressable>
          </View>
        );
      })}
      <ToggleButton
        testID="slideshow-defaults-music-add"
        label={t('common:musicAddLabel')}
        active={false}
        onPress={() => setPickerVisible(true)}
      />

      <MusicPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelectTracks={(tracks) => handleMusicAdd(tracks)}
        alreadySelectedKeys={new Set(musicTracks.map(defaultMusicTrackKey))}
      />
    </ScrollView>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Pressable
      testID={testID}
      style={[styles.toggleButton, active && styles.toggleButtonActive, disabled && styles.toggleButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.toggleButtonText, active && styles.toggleButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    container: {
      padding: 20,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hint: {
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 20,
      marginBottom: 8,
    },
    sectionValue: {
      fontSize: 16,
      color: c.ink,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: c.textSecondary,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      gap: 8,
    },
    musicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    musicRowTextGroup: {
      flex: 1,
    },
    musicRowLabel: {
      fontSize: 15,
      color: c.ink,
    },
    musicRowSubLabel: {
      fontSize: 13,
      color: c.textSecondary,
    },
    musicRowAction: {
      fontSize: 14,
      color: c.accent,
      paddingHorizontal: 8,
    },
    toggleButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
      marginBottom: 8,
    },
    toggleButtonActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    toggleButtonDisabled: {
      opacity: 0.4,
    },
    toggleButtonText: {
      fontSize: 14,
      color: c.ink,
      textAlign: 'center',
    },
    toggleButtonTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
  });
}
