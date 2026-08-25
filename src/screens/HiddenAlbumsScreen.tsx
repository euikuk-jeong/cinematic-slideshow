import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { getAppSetting, setAppSetting } from '../db/client';
import {
  addHiddenPath,
  buildFolderTree,
  findHidingAncestor,
  flattenFolderTree,
  HIDDEN_FOLDER_PATHS_STORAGE_KEY,
  notifyHiddenFolderPathsChanged,
  parseHiddenFolderPaths,
  removeHiddenPath,
  searchFolderTree,
  type FolderTreeNode,
} from '../settings/hiddenFolders';
import { colors } from '../theme/colors';

const ALBUM_THUMBNAIL_CACHE_KEY = 'album_thumbnail_cache';

interface CachedAlbum {
  id: string;
  title: string;
  folderPath: string;
}

function parseCachedAlbums(raw: string | null): CachedAlbum[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is CachedAlbum =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as CachedAlbum).id === 'string' &&
      typeof (item as CachedAlbum).title === 'string' &&
      typeof (item as CachedAlbum).folderPath === 'string'
  );
}

export function HiddenAlbumsScreen() {
  const [albums, setAlbums] = useState<CachedAlbum[] | null>(null);
  const [hiddenPaths, setHiddenPaths] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // 앨범별 폴더 경로는 AlbumListScreen이 콜드스타트마다 채워두는 캐시를 그대로 읽는다 —
    // 여기서 다시 MediaLibrary를 조회하면 네이티브 호출을 두 배로 늘리게 된다.
    getAppSetting(ALBUM_THUMBNAIL_CACHE_KEY).then((cached) => {
      if (!cancelled) setAlbums(parseCachedAlbums(cached));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(HIDDEN_FOLDER_PATHS_STORAGE_KEY).then((raw) => {
      if (!cancelled) setHiddenPaths(parseHiddenFolderPaths(raw));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tree = useMemo(() => (albums ? buildFolderTree(albums) : []), [albums]);
  const normalizedQuery = query.trim();
  const isSearching = normalizedQuery.length > 0;

  const treeRows = useMemo(() => {
    if (isSearching) return searchFolderTree(tree, normalizedQuery).map((node) => ({ node, depth: 0 }));
    return flattenFolderTree(tree, collapsedPaths);
  }, [tree, collapsedPaths, isSearching, normalizedQuery]);

  const flatAlbumRows = useMemo(() => {
    const sorted = [...(albums ?? [])].sort((a, b) => a.title.localeCompare(b.title));
    if (!isSearching) return sorted;
    const normalized = normalizedQuery.toLowerCase();
    return sorted.filter((album) => album.title.toLowerCase().includes(normalized));
  }, [albums, isSearching, normalizedQuery]);

  async function handleToggle(path: string, nextVisible: boolean) {
    const current = hiddenPaths ?? [];
    const next = nextVisible ? removeHiddenPath(current, path) : addHiddenPath(current, path);
    setHiddenPaths(next);
    await setAppSetting(HIDDEN_FOLDER_PATHS_STORAGE_KEY, JSON.stringify(next));
    notifyHiddenFolderPathsChanged();
  }

  function toggleCollapse(path: string) {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  if (albums === null || hiddenPaths === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const searchBar = (
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
  );

  if (albums.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>앨범 목록 화면을 먼저 연 뒤 다시 시도해주세요</Text>
      </View>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <FlatList
        contentContainerStyle={styles.listContent}
        data={treeRows}
        keyExtractor={(row) => row.node.path}
        ListHeaderComponent={searchBar}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text>{isSearching ? '검색 결과가 없어요' : '표시할 폴더가 없어요'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <FolderRow
            node={item.node}
            depth={item.depth}
            showToggle={!isSearching && item.node.children.length > 0}
            collapsed={collapsedPaths.has(item.node.path)}
            onToggleCollapse={() => toggleCollapse(item.node.path)}
            hiddenPaths={hiddenPaths}
            onToggleVisible={handleToggle}
          />
        )}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={flatAlbumRows}
      keyExtractor={(album) => album.id}
      ListHeaderComponent={searchBar}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text>{isSearching ? '검색 결과가 없어요' : '표시할 폴더가 없어요'}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const visible = findHidingAncestor(item.folderPath, hiddenPaths) === null;
        return (
          <View style={styles.row} testID={`hidden-album-row-${item.id}`}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Switch
              testID={`hidden-album-switch-${item.id}`}
              value={visible}
              onValueChange={(next) => handleToggle(item.folderPath, next)}
              trackColor={{ true: colors.accent, false: colors.hairline }}
            />
          </View>
        );
      }}
    />
  );
}

interface FolderRowProps {
  node: FolderTreeNode;
  depth: number;
  showToggle: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  hiddenPaths: string[];
  onToggleVisible: (path: string, nextVisible: boolean) => void;
}

function FolderRow({ node, depth, showToggle, collapsed, onToggleCollapse, hiddenPaths, onToggleVisible }: FolderRowProps) {
  const covering = findHidingAncestor(node.path, hiddenPaths);
  const visible = covering === null;
  const disabledByAncestor = covering !== null && covering !== node.path;

  return (
    <View style={[styles.row, { paddingLeft: 4 + depth * 20 }]} testID={`hidden-folder-row-${node.path}`}>
      <Pressable
        onPress={onToggleCollapse}
        disabled={!showToggle}
        hitSlop={8}
        style={styles.chevronArea}
        testID={`hidden-folder-toggle-${node.path}`}
      >
        <Text style={styles.chevronText}>{showToggle ? (collapsed ? '▸' : '▾') : ' '}</Text>
      </Pressable>
      <Text style={[styles.rowTitle, disabledByAncestor && styles.rowTitleDisabled]} numberOfLines={1}>
        {node.label}
      </Text>
      <Switch
        testID={`hidden-folder-switch-${node.path}`}
        value={visible}
        disabled={disabledByAncestor}
        onValueChange={(next) => onToggleVisible(node.path, next)}
        trackColor={{ true: colors.accent, false: colors.hairline }}
      />
    </View>
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
  rowTitleDisabled: {
    color: colors.textSecondary,
  },
  chevronArea: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
