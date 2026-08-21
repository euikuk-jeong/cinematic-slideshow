import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';

interface AlbumListItem {
  id: string;
  title: string;
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
      .then((result) => Promise.all(result.map(async (album) => ({ id: album.id, title: await album.getTitle() }))))
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
      style={styles.list}
      data={albums}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text>사진 앨범이 없어요</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.row}>
          <Text style={styles.rowText}>{item.title}</Text>
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
  list: {
    flex: 1,
  },
  row: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rowText: {
    fontSize: 16,
  },
});
