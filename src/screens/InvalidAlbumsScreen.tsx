import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { deleteAlbum, getAllAlbums } from '../db/client';
import type { Album } from '../db/types';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

export function InvalidAlbumsScreen() {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [albums, setAlbums] = useState<Album[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllAlbums().then((all) => {
      if (!cancelled) setAlbums(all.filter((album) => !album.isReferenceValid));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleDeleteOne(album: Album) {
    Alert.alert('앨범 설정 삭제', `"${album.displayName}"의 슬라이드쇼 설정을 삭제할까요? 되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteAlbum(album.id);
          setAlbums((current) => (current ?? []).filter((item) => item.id !== album.id));
        },
      },
    ]);
  }

  function handleDeleteAll() {
    if (!albums || albums.length === 0) return;
    Alert.alert('모두 삭제', `삭제된 앨범 ${albums.length}개의 슬라이드쇼 설정을 모두 삭제할까요? 되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '모두 삭제',
        style: 'destructive',
        onPress: async () => {
          await Promise.all(albums.map((album) => deleteAlbum(album.id)));
          setAlbums([]);
        },
      },
    ]);
  }

  if (albums === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (albums.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>정리할 앨범이 없어요</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={albums}
      keyExtractor={(album) => String(album.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerText}>기기에서 삭제된 앨범 {albums.length}개</Text>
          <Pressable testID="invalid-albums-delete-all" onPress={handleDeleteAll}>
            <Text style={styles.deleteAllText}>모두 삭제</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row} testID={`invalid-album-row-${item.id}`}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Pressable testID={`invalid-album-delete-${item.id}`} onPress={() => handleDeleteOne(item)} hitSlop={8}>
            <Text style={styles.deleteText}>삭제</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: c.textSecondary,
    },
    listContent: {
      padding: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 4,
      marginBottom: 4,
    },
    headerText: {
      fontSize: 13,
      color: c.textSecondary,
    },
    deleteAllText: {
      fontSize: 14,
      color: c.accent,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    rowTitle: {
      flex: 1,
      fontSize: 15,
      marginRight: 12,
      color: c.ink,
    },
    deleteText: {
      fontSize: 14,
      color: c.accent,
    },
  });
}
