import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { getAppSetting, setAppSetting } from '../db/client';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { colors } from '../theme/colors';

interface AlbumListItem {
  id: string;
  title: string;
  thumbnailUri: string;
  modifiedAt: number | null;
}

type AlbumSortMode = 'title_asc' | 'title_desc' | 'modified_asc' | 'modified_desc';

const SORT_MODE_STORAGE_KEY = 'album_list_sort_mode';

const SORT_OPTIONS: ReadonlyArray<{ mode: AlbumSortMode; label: string }> = [
  { mode: 'title_asc', label: '이름 (오름차순)' },
  { mode: 'title_desc', label: '이름 (내림차순)' },
  { mode: 'modified_asc', label: '수정일 (오름차순)' },
  { mode: 'modified_desc', label: '수정일 (내림차순)' },
];

function isAlbumSortMode(value: string | null): value is AlbumSortMode {
  return value === 'title_asc' || value === 'title_desc' || value === 'modified_asc' || value === 'modified_desc';
}

interface AlbumCoverInfo {
  uri: string | null;
  modifiedAt: number | null;
}

async function loadAlbumCoverInfo(album: MediaLibrary.Album): Promise<AlbumCoverInfo> {
  const [latest] = await new MediaLibrary.Query()
    .album(album)
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
    .limit(1)
    .exe();
  if (!latest) return { uri: null, modifiedAt: null };
  const [uri, modifiedAt] = await Promise.all([latest.getUri(), latest.getModificationTime()]);
  return { uri, modifiedAt };
}

export function AlbumListScreen() {
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } = useMediaLibraryPermission();
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<AlbumSortMode | null>(null);

  useEffect(() => {
    // isReady 게이팅 없이 idle을 보고 바로 start()를 부르면, 이미 허용된 재방문
    // 사용자도 콜드스타트 조회 결과(RECHECK granted)가 도착하기 전에 rationale
    // 화면이 잠깐 떴다가 사라지는 깜빡임이 생긴다. denied는 재요청 가능(canAskAgain)
    // 상태라 rationale로 돌려보내 다시 설명 후 재요청하도록 한다.
    if (isReady && (state === 'idle' || state === 'denied')) start();
  }, [isReady, state, start]);

  useEffect(() => {
    if (state !== 'granted') return;
    let cancelled = false;
    MediaLibrary.Album.getAll()
      .then((result) =>
        Promise.all(
          result.map(async (album) => {
            const { uri, modifiedAt } = await loadAlbumCoverInfo(album);
            return {
              id: album.id,
              title: await album.getTitle(),
              thumbnailUri: uri,
              modifiedAt,
            };
          })
        )
      )
      // 앨범 목록은 "사진 폴더" 선택 화면이라, 사진이 한 장도 없는 앨범(알림음/벨소리/통화녹음
      // 같은 오디오 전용 버킷 포함 — MediaLibrary.Album.getAll()은 미디어 타입 구분 없이
      // 기기의 모든 앨범을 반환한다)은 애초에 고를 대상이 아니므로 걸러낸다.
      .then((result) => result.filter((album): album is AlbumListItem => album.thumbnailUri !== null))
      .then((result) => {
        if (!cancelled) setAlbums(result);
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(SORT_MODE_STORAGE_KEY).then((value) => {
      if (!cancelled && isAlbumSortMode(value)) setSortMode(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSortModeChange(mode: AlbumSortMode) {
    setSortMode(mode);
    await setAppSetting(SORT_MODE_STORAGE_KEY, mode);
  }

  if (state === 'rationale') {
    return <PermissionRationale onConfirm={confirmRationale} onCancel={cancelRationale} />;
  }

  if (state === 'blocked') {
    return <PermissionBlocked variant="blocked" onOpenSettings={openSettings} />;
  }

  if (state === 'partial_unsupported') {
    return <PermissionBlocked variant="partial" onOpenSettings={openSettings} />;
  }

  if (state !== 'granted' || albums === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <AlbumListContent
      albums={albums}
      query={query}
      onQueryChange={setQuery}
      sortMode={sortMode}
      onSortModeChange={handleSortModeChange}
    />
  );
}

interface AlbumListContentProps {
  albums: AlbumListItem[];
  query: string;
  onQueryChange: (query: string) => void;
  sortMode: AlbumSortMode | null;
  onSortModeChange: (mode: AlbumSortMode) => void;
}

function AlbumListContent({ albums, query, onQueryChange, sortMode, onSortModeChange }: AlbumListContentProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [sortDialogVisible, setSortDialogVisible] = useState(false);

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return albums;
    return albums.filter((album) => album.title.toLowerCase().includes(normalizedQuery));
  }, [albums, query]);

  const sortedAlbums = useMemo(() => {
    if (sortMode === null) return filteredAlbums;
    const sorted = [...filteredAlbums];
    switch (sortMode) {
      case 'title_asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title_desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'modified_asc':
        sorted.sort((a, b) => (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0));
        break;
      case 'modified_desc':
        sorted.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
        break;
    }
    return sorted;
  }, [filteredAlbums, sortMode]);

  return (
    <>
      <FlatList
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        numColumns={2}
        data={sortedAlbums}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.searchBar}>
            <TextInput
              testID="album-search-input"
              style={styles.searchInput}
              value={query}
              onChangeText={onQueryChange}
              placeholder="앨범 검색"
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable testID="album-search-clear" onPress={() => onQueryChange('')} hitSlop={8}>
                <Text style={styles.searchClear}>✕</Text>
              </Pressable>
            )}
            <Pressable testID="album-menu-button" onPress={() => setMenuVisible(true)} hitSlop={8}>
              <Text style={styles.menuButtonText}>⋮</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text>{query.length > 0 ? '검색 결과가 없어요' : '사진 앨범이 없어요'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable testID={`album-card-${item.id}`} style={styles.card}>
            <Image testID={`album-thumbnail-${item.id}`} source={{ uri: item.thumbnailUri }} style={styles.thumbnail} />
            <View style={styles.scrim}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Pressable
              testID="album-menu-sort"
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setSortDialogVisible(true);
              }}
            >
              <Text style={styles.menuItemText}>정렬 방식</Text>
            </Pressable>
            <Pressable testID="album-menu-settings" style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Text style={[styles.menuItemText, styles.menuItemDisabled]}>설정</Text>
            </Pressable>
            <Pressable testID="album-menu-appinfo" style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Text style={[styles.menuItemText, styles.menuItemDisabled]}>앱 정보</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={sortDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortDialogVisible(false)}
      >
        <Pressable style={styles.dialogBackdrop} onPress={() => setSortDialogVisible(false)}>
          <Pressable style={styles.sortDialogCard} onPress={() => {}}>
            <Text style={styles.sortDialogTitle}>정렬 방식</Text>
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.mode}
                testID={`album-sort-option-${option.mode}`}
                style={styles.sortOptionRow}
                onPress={() => {
                  onSortModeChange(option.mode);
                  setSortDialogVisible(false);
                }}
              >
                <Text style={styles.sortOptionText}>{option.label}</Text>
                {sortMode === option.mode && <Text style={styles.sortOptionCheck}>✓</Text>}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 12,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  searchClear: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 15,
  },
  menuButtonText: {
    marginLeft: 12,
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
    padding: 16,
  },
  menuCard: {
    minWidth: 160,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 4,
    overflow: 'hidden',
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
  },
  menuItemDisabled: {
    color: colors.textSecondary,
  },
  sortDialogCard: {
    width: '85%',
    maxWidth: 340,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sortDialogTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sortOptionText: {
    fontSize: 15,
  },
  sortOptionCheck: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  columnWrapper: {
    gap: 12,
  },
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.hairline,
  },
  thumbnail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.scrim,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
