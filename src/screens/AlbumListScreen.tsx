import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { colors } from '../theme/colors';

interface AlbumListItem {
  id: string;
  title: string;
  thumbnailUri: string | null;
}

async function loadThumbnailUri(album: MediaLibrary.Album): Promise<string | null> {
  const [latest] = await new MediaLibrary.Query()
    .album(album)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
    .limit(1)
    .exe();
  return latest ? latest.getUri() : null;
}

export function AlbumListScreen() {
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } = useMediaLibraryPermission();
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null);

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
          result.map(async (album) => ({
            id: album.id,
            title: await album.getTitle(),
            thumbnailUri: await loadThumbnailUri(album),
          }))
        )
      )
      .then((result) => {
        if (!cancelled) setAlbums(result);
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

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
    <FlatList
      contentContainerStyle={styles.listContent}
      columnWrapperStyle={styles.columnWrapper}
      numColumns={2}
      data={albums}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text>사진 앨범이 없어요</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable testID={`album-card-${item.id}`} style={styles.card}>
          {item.thumbnailUri ? (
            <>
              <Image testID={`album-thumbnail-${item.id}`} source={{ uri: item.thumbnailUri }} style={styles.thumbnail} />
              <View style={styles.scrim}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
          )}
        </Pressable>
      )}
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
    gap: 12,
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
  placeholderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  placeholderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
