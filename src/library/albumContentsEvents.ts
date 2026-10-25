type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * 갤러리·뷰어에서 삭제·이동으로 앨범 내용이 바뀐 직후 호출한다. AlbumListScreen은 native-stack에서
 * unmount되지 않고 백그라운드에 남아 focus 때 앨범을 다시 조회하지 않으므로(영상 권한이 바뀐 때만 재조회),
 * 이 알림이 없으면 지운 사진이 커버로 남거나 비어버린 앨범이 목록에 그대로 보인다.
 */
export function notifyAlbumContentsChanged(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToAlbumContentsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
