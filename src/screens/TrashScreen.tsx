import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { SelectMark } from '../library/SelectMark';
import { toggleSelection } from '../photos/gallerySelection';
import { deleteFromTrash, isTrashAvailable, listTrash, restoreFromTrash } from '../photos/mediaTrash';
import { daysUntilExpiry, type TrashItem } from '../photos/trash';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const COLUMNS = 3;
const GAP = 4;

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: TrashItem[] };

/**
 * 휴지통: 삭제한 사진·영상을 모아 보여주고 복원하거나 영구 삭제한다. 삭제는 항상 휴지통으로 가며(약 30일 보관 후 OS가
 * 자동 삭제), 복원·영구 삭제는 시스템 확인 다이얼로그가 받는다. 항목을 탭하면 선택이 토글되고, 선택 없이 "비우기"를
 * 누르면 휴지통 전체를 영구 삭제한다.
 */
export function TrashScreen() {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const { width } = useWindowDimensions();
  const available = useMemo(() => isTrashAvailable(), []);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!available) return;
      let cancelled = false;
      listTrash()
        .then((items) => {
          if (cancelled) return;
          setLoad({ kind: 'ready', items });
          // 목록에서 사라진 항목은 선택에서도 뺀다.
          setSelected((current) => {
            const alive = new Set(items.map((item) => item.id));
            const kept = [...current].filter((id) => alive.has(id));
            return kept.length === current.size ? current : new Set(kept);
          });
        })
        .catch((e) => {
          console.warn('[Trash] failed to list trash', e);
          if (!cancelled) setLoad({ kind: 'error' });
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [available, reloadKey])
  );

  const items = load.kind === 'ready' ? load.items : [];
  const tileSize = (width - GAP * (COLUMNS + 1)) / COLUMNS;

  async function run(action: (ids: readonly string[]) => Promise<boolean>, ids: readonly string[], doneKey: string) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      if (await action(ids)) {
        setNotice(t(doneKey, { count: ids.length }));
        setSelected(new Set());
        setReloadKey((k) => k + 1);
      } else {
        setNotice(t('trash.cancelled'));
      }
    } catch (e) {
      console.warn('[Trash] trash action failed', e);
      setNotice(t('trash.cancelled'));
    } finally {
      setBusy(false);
    }
  }

  const selectedIds = [...selected];
  // 선택이 없으면 "비우기"가 전체 영구 삭제, 있으면 선택 항목만 영구 삭제한다.
  const deleteTargets = selectedIds.length > 0 ? selectedIds : items.map((item) => item.id);

  if (!available) {
    return (
      <View style={styles.centered}>
        <Text testID="trash-unavailable" style={styles.emptyText}>
          {t('trash.unavailable')}
        </Text>
      </View>
    );
  }

  if (load.kind === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator testID="trash-loading" />
      </View>
    );
  }

  if (load.kind === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t('trash.loadError')}</Text>
        <Pressable
          testID="trash-retry"
          accessibilityRole="button"
          onPress={() => {
            setLoad({ kind: 'loading' });
            setReloadKey((k) => k + 1);
          }}
        >
          <Text style={styles.actionText}>{t('trash.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.infoText}>{t('trash.notice')}</Text>
      {items.length > 0 ? (
        <View testID="trash-bar" style={styles.bar}>
          <Text testID="trash-selection-count" style={styles.count} numberOfLines={1}>
            {t('selectionCount', { count: selected.size })}
          </Text>
          <Pressable
            testID="trash-select-all"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={8}
            style={styles.barButton}
            onPress={() => setSelected(new Set(items.map((item) => item.id)))}
          >
            <Text style={[styles.actionText, busy && styles.disabledText]}>{t('selectAll')}</Text>
          </Pressable>
          <Pressable
            testID="trash-restore"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || selected.size === 0 }}
            disabled={busy || selected.size === 0}
            hitSlop={8}
            style={styles.barButton}
            onPress={() => run(restoreFromTrash, selectedIds, 'trash.restored')}
          >
            <Text style={[styles.actionText, (busy || selected.size === 0) && styles.disabledText]}>
              {t('trash.restore')}
            </Text>
          </Pressable>
          <Pressable
            testID="trash-delete"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={8}
            style={styles.barButton}
            onPress={() => run(deleteFromTrash, deleteTargets, 'trash.deleted')}
          >
            <Text style={[styles.dangerText, busy && styles.disabledText]}>
              {selected.size > 0 ? t('trash.deleteForever') : t('trash.emptyTrash')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <Text testID="trash-notice" style={styles.noticeText}>
          {notice}
        </Text>
      ) : null}
      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text testID="trash-empty" style={styles.emptyText}>
            {t('trash.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          key={`trash-${COLUMNS}`}
          data={items}
          extraData={selected}
          numColumns={COLUMNS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: GAP }}
          columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
          renderItem={({ item }) => (
            <TrashTile
              item={item}
              size={tileSize}
              selected={selected.has(item.id)}
              onPress={() => !busy && setSelected((current) => toggleSelection(current, item.id))}
            />
          )}
        />
      )}
    </View>
  );
}

function TrashTile({
  item,
  size,
  selected,
  onPress,
}: {
  item: TrashItem;
  size: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const [failed, setFailed] = useState(false);
  const days = daysUntilExpiry(item, Date.now());

  return (
    <Pressable testID={`trash-item-${item.id}`} style={[styles.tile, { width: size, height: size }]} onPress={onPress}>
      {failed ? (
        <View style={styles.tilePlaceholder}>
          <Text style={styles.placeholderGlyph}>{item.isVideo ? '🎞' : '🖼'}</Text>
        </View>
      ) : (
        <Image source={{ uri: item.id }} style={styles.tileImage} onError={() => setFailed(true)} />
      )}
      {item.isVideo && !failed ? <Text style={styles.videoBadge}>▶</Text> : null}
      {days !== null ? (
        <Text testID={`trash-days-${item.id}`} style={styles.daysBadge} numberOfLines={1}>
          {days === 0 ? t('trash.expiringToday') : t('trash.daysLeft', { count: days })}
        </Text>
      ) : null}
      {selected ? <SelectMark testID={`trash-select-check-${item.id}`} /> : null}
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
    emptyText: { color: c.textSecondary, textAlign: 'center' },
    infoText: { fontSize: 12, color: c.textSecondary, paddingHorizontal: 16, paddingVertical: 8 },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingHorizontal: 12,
      gap: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    count: { flex: 1, fontSize: 15, fontWeight: '600', color: c.ink },
    barButton: { minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' },
    actionText: { fontSize: 14, fontWeight: '600', color: c.accent },
    dangerText: { fontSize: 14, fontWeight: '600', color: '#D64545' },
    disabledText: { opacity: 0.4 },
    noticeText: {
      fontSize: 13,
      color: c.textSecondary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.accentSoft,
    },
    tile: { backgroundColor: c.hairline, overflow: 'hidden' },
    tileImage: { width: '100%', height: '100%' },
    tilePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    placeholderGlyph: { fontSize: 28 },
    videoBadge: {
      position: 'absolute',
      left: 4,
      top: 4,
      color: '#fff',
      fontSize: 12,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowRadius: 2,
    },
    daysBadge: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingVertical: 2,
      paddingHorizontal: 4,
      fontSize: 11,
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
  });
}
