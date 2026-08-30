import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';

import { BUNDLED_MUSIC_CATEGORY_LABELS, BUNDLED_MUSIC_CATEGORY_ORDER, BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import { getAppSetting, setAppSetting } from '../db/client';
import type { MusicSourceType } from '../db/types';
import { resolveDeviceTrackMetadata, type ResolvedTrackMetadata } from '../music/resolveTrackMetadata';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { buildFolderTree, getFolderPath, type FolderTreeNode } from '../settings/folderTree';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const AUDIO_GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['audio'];

// 기기 오디오가 많으면(실기기에서 2500개 이상 확인) 조회 자체가 수십 초 걸린다 —
// AlbumListScreen의 앨범 썸네일 캐시와 같은 방식으로, 직전 조회 결과를 저장해뒀다가 다음
// 진입 시 먼저 보여주고 그동안 백그라운드로 새로 조회해 덮어쓴다(신선도 비교 없이 즉시
// 선반영 후 실제 결과로 교체 — AlbumListScreen 주석 참고).
const DEVICE_AUDIO_CACHE_KEY = 'music_picker_device_audio_cache';

// String.prototype.localeCompare(x, 'ko')를 항목마다 새로 호출하면 매번 ICU Collator를
// 새로 구성하는 것으로 보임 — 실기기(오디오 2500개 이상)에서 배치가 갈수록 느려지다
// OutOfMemoryError로 죽는 문제의 스택트레이스가 정확히 Collator 생성 경로를 가리켰다.
// Collator 인스턴스를 한 번만 만들어 재사용하면 이 비용이 없어진다.
const koreanCollator = new Intl.Collator('ko');

type PickerMode = 'bundled' | 'flat' | 'folder';

interface DeviceAudioItem {
  id: string;
  title: string;
  uri: string;
  folderPath: string;
}

interface PickerRowItem {
  key: string;
  sourceType: MusicSourceType;
  sourceValue: string;
  uri?: string;
  title: string;
  artist: string | null;
  // 기기 음악은 캐시 파일의 file:// 경로(string), 번들 음악은 정적으로 require()된
  // 이미지 에셋(number) — 번들 커버는 빌드 타임에 추출해둔 정적 파일이라 파싱이 필요 없다.
  coverSource: string | number | null;
  // 번들 음악에만 있는 값 — 카테고리 섹션 그룹핑(categoryLabel)과 출처 표시(sourceUrl)에 쓰인다.
  categoryLabel?: string;
  sourceUrl?: string;
}

function musicKey(sourceType: MusicSourceType, sourceValue: string): string {
  return `${sourceType}:${sourceValue}`;
}

// 모듈 스코프 캐시라 모달을 닫았다 다시 열어도(같은 앱 세션 안에서는) 같은 파일을 다시
// 파싱하지 않는다. 컴포넌트 state(deviceMetadata)는 이 캐시를 렌더링에 반영하기 위한 것.
const deviceMetadataWarmCache = new Map<string, ResolvedTrackMetadata | null>();

function toDevicePickerRowItem(item: DeviceAudioItem, resolved: ResolvedTrackMetadata | null | undefined): PickerRowItem {
  return {
    key: musicKey('device', item.id),
    sourceType: 'device',
    sourceValue: item.id,
    uri: item.uri,
    title: resolved?.title ?? item.title,
    artist: resolved?.artist ?? null,
    coverSource: resolved?.coverUri ?? null,
  };
}

function filterByQuery(items: readonly PickerRowItem[], query: string): PickerRowItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items.slice();
  return items.filter(
    (item) => item.title.toLowerCase().includes(normalized) || (item.artist?.toLowerCase().includes(normalized) ?? false)
  );
}

export interface MusicPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectTracks: (
    tracks: readonly {
      sourceType: MusicSourceType;
      sourceValue: string;
      title: string;
      artist: string | null;
      coverUri: string | null;
    }[]
  ) => void;
  // 이미 재생목록에 있는 트랙(`${sourceType}:${sourceValue}`)은 세 탭 모두에서 목록에서 제외한다.
  alreadySelectedKeys: ReadonlySet<string>;
}

export function MusicPickerModal({ visible, onClose, onSelectTracks, alreadySelectedKeys }: MusicPickerModalProps) {
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } =
    useMediaLibraryPermission(AUDIO_GRANULAR_PERMISSIONS);
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [mode, setMode] = useState<PickerMode>('bundled');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DeviceAudioItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [folderStack, setFolderStack] = useState<FolderTreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [deviceMetadata, setDeviceMetadata] = useState<ReadonlyMap<string, ResolvedTrackMetadata | null>>(
    () => new Map(deviceMetadataWarmCache)
  );

  // items(state)를 이 ref 대신 가드로 쓰면 아래 effect가 progressive setItems 때마다
  // 재실행돼 배치 루프가 중간에 끊긴다 — 그래서 별도 ref로 "이미 조회 시작했는지"만 추적.
  const hasFetchedDeviceAudioRef = useRef(false);

  function handleMetadataResolved(assetId: string, result: ResolvedTrackMetadata | null) {
    setDeviceMetadata((prev) => {
      const next = new Map(prev);
      next.set(assetId, result);
      return next;
    });
  }

  const needsDeviceAccess = mode === 'flat' || mode === 'folder';

  // 로딩이 느리다는 피드백 진단용 — 탭 진입부터 배치별 진행 상황을 타임스탬프로 남긴다.
  // [PERF] 접두사로 grep 가능. 문제 해결되면 정리 예정(doc/todo/todo.md 참고).
  useEffect(() => {
    if (needsDeviceAccess) console.log('[PERF] 전체/폴더 탭 진입', Date.now());
  }, [needsDeviceAccess]);

  useEffect(() => {
    if (visible && needsDeviceAccess && isReady && (state === 'idle' || state === 'denied')) start();
  }, [visible, needsDeviceAccess, isReady, state, start]);

  // 캐시 선반영 — items가 null인 동안(=아직 아무것도 없을 때)만 한 번 시도한다. 아래
  // 실제 조회 effect가 채운 뒤에는 items!==null이라 더 이상 손대지 않는다.
  useEffect(() => {
    if (!visible || !needsDeviceAccess || state !== 'granted' || items !== null) return;
    let cancelled = false;
    getAppSetting(DEVICE_AUDIO_CACHE_KEY).then((cached) => {
      if (cancelled || !cached) return;
      try {
        const parsed = JSON.parse(cached) as DeviceAudioItem[];
        setItems((current) => current ?? parsed);
      } catch {
        // 캐시가 손상됐어도 무시 — 아래 실제 조회가 어차피 다시 채운다.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, needsDeviceAccess, state, items]);

  useEffect(() => {
    if (!visible) {
      setMode('bundled');
      setQuery('');
      setFolderStack([]);
      setSelectedKeys(new Set());
    }
  }, [visible]);

  useEffect(() => {
    setQuery('');
  }, [mode]);

  useEffect(() => {
    // needsDeviceAccess로 게이팅 — 기본음악 탭만 보는 동안은(권한이 이미 허용돼 있어도)
    // 기기 오디오 전체를 조회하지 않는다. hasFetchedRef는 "전체"/"폴더"로 한 번 들어갔다
    // 나가도 재조회하지 않기 위한 것 — items를 의존성에 넣으면 아래에서 진행 중에
    // 점진적으로 setItems할 때마다 이 effect가 재실행돼 배치 진행이 끊긴다.
    if (!visible || !needsDeviceAccess || state !== 'granted' || hasFetchedDeviceAudioRef.current) return;
    hasFetchedDeviceAudioRef.current = true;
    let cancelled = false;
    setLoadError(false);
    const BATCH_SIZE = 25;
    const t0 = Date.now();
    console.log('[PERF] 권한 확인됨, 오디오 쿼리 시작', t0);
    new MediaLibrary.Query()
      .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.AUDIO)
      .exe()
      .then(async (assets) => {
        const tQuery = Date.now();
        console.log(
          `[PERF] 쿼리 완료: ${assets.length}개, ${tQuery - t0}ms 소요. flac 파일명 포함 여부는 getInfo() 이후에나 알 수 있음(원본 Asset엔 filename 없음)`
        );
        // 기기에 오디오 파일이 수백~수천 개 있을 수 있어(알림음/통화음/카톡 등 포함) 한
        // 번에 Promise.all로 전부 getInfo()를 걸면 브릿지가 밀려 화면이 수 분간 먹통이
        // 되는 문제가 있었다(실기기 피드백) — 배치로 나눠 각 배치 사이에 이벤트 루프에
        // 양보하고, 결과도 점진적으로 반영해 목록이 채워지는 게 보이게 한다.
        if (assets.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
        // 배치(25개)마다 매번 setItems를 호출하면 그때마다 리렌더 → 정렬(전체 리스트
        // 재정렬)·폴더 트리 재구성이 통째로 다시 도는데, 오디오 2500개 이상인 실기기에서
        // 이게 누적되며 배치가 갈수록 느려지다 결국 OutOfMemoryError로 죽는 것까지
        // 확인했다. 네이티브 호출은 여전히 25개씩 나눠 브릿지를 보호하되(NATIVE_BATCH_SIZE),
        // React state 갱신(및 그에 따른 정렬·트리 재구성)은 UI_UPDATE_SIZE만큼 모였을
        // 때만 하도록 분리한다.
        const UI_UPDATE_SIZE = 200;
        const collected: DeviceAudioItem[] = [];
        let sinceLastUiUpdate = 0;
        // 개발 중 Fast Refresh로 이 컴포넌트가 다시 마운트되면 이전 인스턴스의 조회가
        // 아직 끝나기 전에 새 조회가 또 시작될 수 있어(그 사이 in-flight였던 Asset 네이티브
        // 객체가 먼저 해제되면서 "shared object already released" 에러도 같이 나타남),
        // 같은 id가 두 번 들어와 폴더 트리에서 "동일 key" 경고로 이어지는 걸 실기기에서
        // 확인했다 — id 기준으로 방어적으로 중복 제거한다.
        const seenIds = new Set<string>();
        let flacSeen = 0;
        for (let i = 0; i < assets.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const tBatchStart = Date.now();
          const batch = assets.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (asset) => {
              // getInfo() 하나로 브릿지 호출을 줄이는 게 기본 경로지만, 일부 자산(예:
              // FLAC 등 일부 포맷)에서 getInfo()가 실패하는 사례가 있어 — Promise.all은
              // 하나만 실패해도 배치 전체를 실패시키므로(그러면 이후 파일들이 통째로
              // 목록에서 빠짐) 자산 단위로 감싸고, 실패하면 예전 방식(getFilename+getUri)
              // 으로 한 번 더 시도한다. 그것도 실패하면 그 자산만 건너뛴다(전체 목록은 유지).
              try {
                const info = await asset.getInfo();
                return { id: asset.id, title: info.filename, uri: info.uri, folderPath: getFolderPath(info.uri) };
              } catch (err) {
                try {
                  const [title, uri] = await Promise.all([asset.getFilename(), asset.getUri()]);
                  console.warn('[MusicPickerModal] getInfo() 실패, getFilename+getUri로 재시도 성공', asset.id, err);
                  return { id: asset.id, title, uri, folderPath: getFolderPath(uri) };
                } catch (fallbackErr) {
                  console.warn('[MusicPickerModal] 오디오 자산 조회 실패, 목록에서 제외', asset.id, fallbackErr);
                  return null;
                }
              }
            })
          );
          if (cancelled) return;
          const validResults = batchResults.filter((item): item is DeviceAudioItem => item !== null);
          const newResults = validResults.filter((item) => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
          });
          const flacInBatch = newResults.filter((item) => item.title.toLowerCase().endsWith('.flac'));
          flacSeen += flacInBatch.length;
          collected.push(...newResults);
          sinceLastUiUpdate += newResults.length;
          const isLastBatch = i + BATCH_SIZE >= assets.length;
          if (sinceLastUiUpdate >= UI_UPDATE_SIZE || isLastBatch) {
            setItems([...collected]);
            sinceLastUiUpdate = 0;
          }
          console.log(
            `[PERF] 배치 ${i / BATCH_SIZE + 1} 완료: ${batch.length}개 처리(${batchResults.length - validResults.length}개 실패/제외), ${Date.now() - tBatchStart}ms, 누적 ${collected.length}개, 이 배치에서 flac ${flacInBatch.length}개${flacInBatch.length > 0 ? ' (' + flacInBatch.map((f) => f.title).join(', ') + ')' : ''}`
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        console.log(`[PERF] 전체 완료: 총 ${collected.length}개, ${Date.now() - t0}ms 소요, flac 총 ${flacSeen}개`);
        if (!cancelled) setAppSetting(DEVICE_AUDIO_CACHE_KEY, JSON.stringify(collected));
      })
      .catch((err) => {
        console.log('[PERF] 쿼리/배치 처리 전체 실패', err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, needsDeviceAccess, state]);

  const bundledItems: PickerRowItem[] = useMemo(
    () =>
      BUNDLED_MUSIC_TRACKS.filter((track) => !alreadySelectedKeys.has(musicKey('bundled', track.id))).map(
        (track) => ({
          key: musicKey('bundled', track.id),
          sourceType: 'bundled' as const,
          sourceValue: track.id,
          title: track.title,
          artist: track.artist,
          coverSource: track.cover,
          categoryLabel: BUNDLED_MUSIC_CATEGORY_LABELS[track.category],
          sourceUrl: track.sourceUrl,
        })
      ),
    [alreadySelectedKeys]
  );
  // 카테고리 섹션 내부는 제목 가나다순, 섹션 자체는 BUNDLED_MUSIC_CATEGORY_ORDER 고정 순서.
  const bundledSections = useMemo(() => {
    const filtered = filterByQuery(bundledItems, query);
    return BUNDLED_MUSIC_CATEGORY_ORDER.map((category) => ({
      title: BUNDLED_MUSIC_CATEGORY_LABELS[category],
      data: filtered
        .filter((item) => item.categoryLabel === BUNDLED_MUSIC_CATEGORY_LABELS[category])
        .sort((a, b) => koreanCollator.compare(a.title, b.title)),
    })).filter((section) => section.data.length > 0);
  }, [bundledItems, query]);

  const unselectedDeviceAudio = useMemo(
    () => (items ?? []).filter((item) => !alreadySelectedKeys.has(musicKey('device', item.id))),
    [items, alreadySelectedKeys]
  );
  const deviceFlatItems: PickerRowItem[] = useMemo(
    () => unselectedDeviceAudio.map((item) => toDevicePickerRowItem(item, deviceMetadata.get(item.id))),
    [unselectedDeviceAudio, deviceMetadata]
  );
  // 정렬은 "전체" 탭에 보일 때만 필요한데, 조회는 배치로 계속 들어오는 동안(다른 탭에
  // 있어도) deviceFlatItems가 계속 갱신된다 — mode로 게이팅해서 안 보고 있는 탭을 위해
  // 매번(오디오 2500개 기준 배치마다) 정렬을 다시 도는 낭비를 없앤다.
  const sortedFlatItems = useMemo(
    () => (mode === 'flat' ? deviceFlatItems.slice().sort((a, b) => koreanCollator.compare(a.title, b.title)) : []),
    [deviceFlatItems, mode]
  );
  const filteredFlatItems = useMemo(() => filterByQuery(sortedFlatItems, query), [sortedFlatItems, query]);

  const itemsByKey = useMemo(() => {
    const map = new Map<string, PickerRowItem>();
    for (const item of bundledItems) map.set(item.key, item);
    for (const item of deviceFlatItems) map.set(item.key, item);
    return map;
  }, [bundledItems, deviceFlatItems]);

  // 폴더 트리 구성도 "폴더" 탭에서만 필요하다 — 같은 이유로 게이팅.
  const tree = useMemo(() => (mode === 'folder' ? buildFolderTree(unselectedDeviceAudio) : []), [unselectedDeviceAudio, mode]);
  const deviceItemsById = useMemo(() => new Map(unselectedDeviceAudio.map((item) => [item.id, item])), [unselectedDeviceAudio]);
  const currentNode = folderStack[folderStack.length - 1] ?? null;
  const childFolders = currentNode ? currentNode.children : tree;
  const filesHere = (currentNode ? currentNode.itemIds : [])
    .map((id) => deviceItemsById.get(id))
    .filter((item): item is DeviceAudioItem => Boolean(item));
  // filesHere가 매 렌더마다 새로 계산되는 파생값이라 이 매핑을 useMemo로 감싸도 이득이
  // 없다(의존성이 항상 바뀜) — 그냥 일반 계산으로 둔다.
  const folderFileItems: PickerRowItem[] = filesHere.map((item) => toDevicePickerRowItem(item, deviceMetadata.get(item.id)));

  function openFolder(node: FolderTreeNode) {
    setFolderStack((prev) => [...prev, node]);
  }

  function goToBreadcrumb(index: number) {
    // index -1 = 루트
    setFolderStack((prev) => prev.slice(0, index + 1));
  }

  function goUpOneLevel() {
    setFolderStack((prev) => prev.slice(0, -1));
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    // selectedKeys(Set)는 삽입 순서를 보존하므로, 조회 순서가 아니라 사용자가
    // 체크한 순서 그대로 넘긴다 — 플레이리스트 순서의 기본값이 되는 값이라 중요하다.
    const selected = [...selectedKeys].map((key) => itemsByKey.get(key)).filter((item): item is PickerRowItem => Boolean(item));
    onSelectTracks(
      selected.map((item) => ({
        sourceType: item.sourceType,
        sourceValue: item.sourceValue,
        title: item.title,
        artist: item.artist,
        // 번들 커버는 require()된 정적 에셋(number)이라 DB에 저장할 문자열 경로가 없다 —
        // 재생목록 화면에서 매번 BUNDLED_MUSIC_TRACKS를 다시 조회해 그린다.
        coverUri: typeof item.coverSource === 'string' ? item.coverSource : null,
      }))
    );
    onClose();
  }

  function renderRow(item: PickerRowItem) {
    return (
      <MusicRowView
        item={item}
        selected={selectedKeys.has(item.key)}
        onToggle={() => toggleSelected(item.key)}
        onMetadataResolved={handleMetadataResolved}
      />
    );
  }

  function renderSearchBar(placeholder: string) {
    return (
      <View style={styles.searchBar}>
        <TextInput
          testID="picker-search-input"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={c.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable testID="picker-search-clear" onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function cancelDeviceAccess() {
    // rationale을 취소해도 모달 전체를 닫지 않고 항상 이용 가능한 "기본음악" 탭으로
    // 돌아간다 — cancelRationale()만 부르면 상태가 idle이 돼 위 useEffect가 즉시 다시
    // start()를 걸어 rationale이 반복 노출되므로, 탭도 함께 되돌려 needsDeviceAccess를 끈다.
    cancelRationale();
    setMode('bundled');
  }

  function renderDeviceAccessGate() {
    if (state === 'rationale') {
      return <PermissionRationale variant="audio" onConfirm={confirmRationale} onCancel={cancelDeviceAccess} />;
    }
    if (state === 'blocked' || state === 'partial_unsupported') {
      return <PermissionBlocked variant="audio_blocked" onOpenSettings={openSettings} />;
    }
    if (state === 'granted' && loadError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>음악 목록을 불러오지 못했어요</Text>
        </View>
      );
    }
    if (state !== 'granted' || items === null) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      );
    }
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>음악 추가</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>

        <View style={styles.modeTabRow}>
          <Pressable
            testID="picker-mode-bundled"
            style={[styles.modeTab, mode === 'bundled' && styles.modeTabActive]}
            onPress={() => setMode('bundled')}
          >
            <Text style={[styles.modeTabText, mode === 'bundled' && styles.modeTabTextActive]}>기본음악</Text>
          </Pressable>
          {Platform.OS === 'android' && (
            <>
              <Pressable
                testID="picker-mode-flat"
                style={[styles.modeTab, mode === 'flat' && styles.modeTabActive]}
                onPress={() => setMode('flat')}
              >
                <Text style={[styles.modeTabText, mode === 'flat' && styles.modeTabTextActive]}>전체</Text>
              </Pressable>
              <Pressable
                testID="picker-mode-folder"
                style={[styles.modeTab, mode === 'folder' && styles.modeTabActive]}
                onPress={() => setMode('folder')}
              >
                <Text style={[styles.modeTabText, mode === 'folder' && styles.modeTabTextActive]}>폴더</Text>
              </Pressable>
            </>
          )}
        </View>

        {mode === 'bundled' && (
          <>
            {renderSearchBar('기본 음악 검색')}
            <SectionList
              sections={bundledSections}
              keyExtractor={(item) => item.key}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>{query.length > 0 ? '검색 결과가 없어요' : '추가할 수 있는 기본 음악이 없어요'}</Text>
                </View>
              }
              renderItem={({ item }) => renderRow(item)}
            />
          </>
        )}

        {mode === 'flat' && (
          <>
            {renderDeviceAccessGate() ?? (
              <>
                {renderSearchBar('음악 검색')}
                <FlatList
                  data={filteredFlatItems}
                  keyExtractor={(item) => item.key}
                  ListEmptyComponent={
                    <View style={styles.centered}>
                      <Text style={styles.emptyText}>
                        {query.length > 0 ? '검색 결과가 없어요' : '선택할 수 있는 음악 파일이 없어요'}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => renderRow(item)}
                />
              </>
            )}
          </>
        )}

        {mode === 'folder' && (
          <>
            {renderDeviceAccessGate() ?? (
              <>
                <View style={styles.breadcrumbRow}>
                  <Pressable testID="breadcrumb-root" onPress={() => goToBreadcrumb(-1)} hitSlop={8} style={styles.breadcrumbTap}>
                    <Text style={styles.breadcrumbText}>루트</Text>
                  </Pressable>
                  {folderStack.map((node, index) => (
                    <View key={node.path} style={styles.breadcrumbSegment}>
                      <Text style={styles.breadcrumbSeparator}>/</Text>
                      <Pressable
                        testID={`breadcrumb-${index}`}
                        onPress={() => goToBreadcrumb(index)}
                        hitSlop={8}
                        style={styles.breadcrumbTap}
                      >
                        <Text style={styles.breadcrumbText} numberOfLines={1}>
                          {node.label}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                <FlatList
                  data={[
                    ...(folderStack.length > 0 ? [{ kind: 'up' as const }] : []),
                    ...childFolders.map((node) => ({ kind: 'folder' as const, node })),
                    ...folderFileItems.map((item) => ({ kind: 'file' as const, item })),
                  ]}
                  keyExtractor={(row) =>
                    row.kind === 'up' ? 'up' : row.kind === 'folder' ? `folder:${row.node.path}` : `file:${row.item.key}`
                  }
                  ListEmptyComponent={
                    <View style={styles.centered}>
                      <Text style={styles.emptyText}>선택할 수 있는 음악 파일이 없어요</Text>
                    </View>
                  }
                  renderItem={({ item: row }) =>
                    row.kind === 'up' ? (
                      <Pressable testID="folder-row-up" style={styles.row} onPress={goUpOneLevel}>
                        <Text style={styles.folderIcon}>📁</Text>
                        <Text style={styles.rowText} numberOfLines={1}>
                          ..
                        </Text>
                      </Pressable>
                    ) : row.kind === 'folder' ? (
                      <Pressable
                        testID={`folder-row-${row.node.path}`}
                        style={styles.row}
                        onPress={() => openFolder(row.node)}
                      >
                        <Text style={styles.folderIcon}>📁</Text>
                        <Text style={styles.rowText} numberOfLines={1}>
                          {row.node.label}
                        </Text>
                      </Pressable>
                    ) : (
                      renderRow(row.item)
                    )
                  }
                />
              </>
            )}
          </>
        )}

        <Pressable
          testID="confirm-selection-button"
          style={[styles.confirmButton, selectedKeys.size === 0 && styles.confirmButtonDisabled]}
          disabled={selectedKeys.size === 0}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmButtonText}>선택한 {selectedKeys.size}곡 추가</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function MusicRowView({
  item,
  selected,
  onToggle,
  onMetadataResolved,
}: {
  item: PickerRowItem;
  selected: boolean;
  onToggle: () => void;
  onMetadataResolved: (assetId: string, result: ResolvedTrackMetadata | null) => void;
}) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  // FlatList의 기본 windowing 덕에 이 컴포넌트는 대략 화면에 보이는(또는 곧 보일) 행만
  // 마운트된다 — 그래서 별도의 onViewableItemsChanged 없이도 "보이는 것만 태그를 읽는다"가
  // 자연히 성립한다. 번들 트랙은 sourceType이 'device'가 아니라 이 effect를 타지 않는다.
  useEffect(() => {
    if (item.sourceType !== 'device' || !item.uri) return;
    const assetId = item.sourceValue;
    const uri = item.uri;
    if (deviceMetadataWarmCache.has(assetId)) {
      onMetadataResolved(assetId, deviceMetadataWarmCache.get(assetId) ?? null);
      return;
    }
    let cancelled = false;
    resolveDeviceTrackMetadata(assetId, uri).then((result) => {
      deviceMetadataWarmCache.set(assetId, result);
      if (!cancelled) onMetadataResolved(assetId, result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.sourceType, item.sourceValue, item.uri]);

  return (
    <Pressable testID={`music-row-${item.key}`} style={styles.row} onPress={onToggle}>
      <Text style={styles.checkbox}>{selected ? '☑' : '☐'}</Text>
      {item.coverSource ? (
        <Image
          source={typeof item.coverSource === 'number' ? item.coverSource : { uri: item.coverSource }}
          style={styles.coverThumbnail}
        />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverPlaceholderIcon}>♪</Text>
        </View>
      )}
      <View style={styles.rowTextGroup}>
        <Text style={styles.rowText} numberOfLines={1}>
          {item.title}
        </Text>
        {item.artist && (
          <Text style={styles.rowSubText} numberOfLines={1}>
            {item.artist}
          </Text>
        )}
      </View>
      {item.sourceUrl && (
        <Pressable testID={`music-source-${item.key}`} onPress={() => Linking.openURL(item.sourceUrl!)} hitSlop={8}>
          <Text style={styles.sourceLink}>출처</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.ink,
    },
    closeText: {
      color: c.textSecondary,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: c.textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
    },
    modeTabRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    modeTab: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    modeTabActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    modeTabText: {
      fontSize: 14,
      color: c.ink,
    },
    modeTabTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
    sectionHeader: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 4,
      backgroundColor: c.background,
    },
    sectionHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    sourceLink: {
      fontSize: 13,
      color: c.accent,
      paddingHorizontal: 4,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: c.ink,
    },
    searchClear: {
      marginLeft: 8,
      color: c.textSecondary,
      fontSize: 15,
    },
    breadcrumbRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    breadcrumbSegment: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    breadcrumbSeparator: {
      color: c.textSecondary,
      marginHorizontal: 2,
    },
    // 원래 텍스트만 감싸던 좁은 영역이 실기기에서 "잘 안 눌린다"는 피드백을 받아
    // 패딩으로 탭 영역을 넓혔다(hitSlop과 별개로 실제 레이아웃 크기 자체를 키움).
    breadcrumbTap: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    breadcrumbText: {
      fontSize: 14,
      color: c.accent,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    folderIcon: {
      fontSize: 16,
    },
    checkbox: {
      fontSize: 18,
      color: c.accent,
    },
    coverThumbnail: {
      width: 36,
      height: 36,
      borderRadius: 6,
    },
    coverPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 6,
      backgroundColor: c.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverPlaceholderIcon: {
      fontSize: 16,
      color: c.textSecondary,
    },
    rowTextGroup: {
      flex: 1,
    },
    rowText: {
      fontSize: 16,
      color: c.ink,
    },
    rowSubText: {
      fontSize: 13,
      color: c.textSecondary,
      marginTop: 2,
    },
    confirmButton: {
      margin: 20,
      paddingVertical: 14,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: 'center',
    },
    confirmButtonDisabled: {
      backgroundColor: c.hairline,
    },
    confirmButtonText: {
      color: c.background,
      fontWeight: '600',
      fontSize: 16,
    },
  });
}
