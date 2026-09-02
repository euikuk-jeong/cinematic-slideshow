import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { deleteAlbum, getAllAlbums } from '../db/client';
import type { Album } from '../db/types';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

export function InvalidAlbumsScreen() {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('invalidAlbums');
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
    Alert.alert(t('deleteAlbumConfirmTitle'), t('deleteAlbumConfirmMessage', { displayName: album.displayName }), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('deleteButtonLabel'),
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
    Alert.alert(t('deleteAllLabel'), t('deleteAllConfirmMessage', { count: albums.length }), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('deleteAllLabel'),
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
        <Text style={styles.emptyText}>{t('noAlbumsToClean')}</Text>
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
          <Text style={styles.headerText}>{t('headerCount', { count: albums.length })}</Text>
          <Pressable testID="invalid-albums-delete-all" onPress={handleDeleteAll}>
            <Text style={styles.deleteAllText}>{t('deleteAllLabel')}</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row} testID={`invalid-album-row-${item.id}`}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Pressable testID={`invalid-album-delete-${item.id}`} onPress={() => handleDeleteOne(item)} hitSlop={8}>
            <Text style={styles.deleteText}>{t('deleteButtonLabel')}</Text>
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
