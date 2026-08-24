import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { getAppSetting, setAppSetting } from '../db/client';
import {
  HIDDEN_ALBUM_IDS_STORAGE_KEY,
  notifyHiddenAlbumIdsChanged,
  parseHiddenAlbumIds,
} from '../settings/hiddenAlbums';
import { colors } from '../theme/colors';

interface AlbumOption {
  id: string;
  title: string;
}

async function albumHasPhotos(album: MediaLibrary.Album): Promise<boolean> {
  const [asset] = await new MediaLibrary.Query()
    .album(album)
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .limit(1)
    .exe();
  return asset !== undefined;
}

export function HiddenAlbumsScreen() {
  const [albums, setAlbums] = useState<AlbumOption[] | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    MediaLibrary.Album.getAll()
      .then((result) =>
        Promise.all(
          result.map(async (album) => ({
            id: album.id,
            title: await album.getTitle(),
            hasPhotos: await albumHasPhotos(album),
          }))
        )
      )
      // 앨범 목록 화면과 동일하게, 사진이 없는 앨범(오디오 전용 버킷 등)은 제외 대상으로 노출하지 않는다.
      .then((result) =>
        result
          .filter((album) => album.hasPhotos)
          .map(({ id, title }) => ({ id, title }))
          .sort((a, b) => a.title.localeCompare(b.title))
      )
      .then((result) => {
        if (!cancelled) setAlbums(result);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(HIDDEN_ALBUM_IDS_STORAGE_KEY).then((raw) => {
      if (!cancelled) setHiddenIds(new Set(parseHiddenAlbumIds(raw)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredAlbums = useMemo(() => {
    if (!albums) return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return albums;
    return albums.filter((album) => album.title.toLowerCase().includes(normalizedQuery));
  }, [albums, query]);

  async function handleToggle(id: string, nextVisible: boolean) {
    const next = new Set(hiddenIds);
    if (nextVisible) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setHiddenIds(next);
    await setAppSetting(HIDDEN_ALBUM_IDS_STORAGE_KEY, JSON.stringify([...next]));
    notifyHiddenAlbumIdsChanged();
  }

  if (albums === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={filteredAlbums}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.searchBar}>
          <TextInput
            testID="hidden-albums-search-input"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="폴더 검색"
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text>{query.length > 0 ? '검색 결과가 없어요' : '표시할 폴더가 없어요'}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const visible = !hiddenIds.has(item.id);
        return (
          <View style={styles.row} testID={`hidden-album-row-${item.id}`}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Switch
              testID={`hidden-album-switch-${item.id}`}
              value={visible}
              onValueChange={(next) => handleToggle(item.id, next)}
              trackColor={{ true: colors.accent, false: colors.hairline }}
            />
          </View>
        );
      }}
    />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    marginRight: 12,
  },
});
