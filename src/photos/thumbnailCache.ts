// 썸네일 uri 캐시 키: asset id만으로는 같은 id의 파일이 편집돼도 옛 uri가 남으므로
// modificationTime을 함께 키에 넣어 파일이 바뀌면 자동으로 무효화되게 한다. 미디어스토어가
// modificationTime을 못 주는 경우(null)엔 id만으로 키를 만든다.
export function thumbnailCacheKey(id: string, modificationTime: number | null | undefined): string {
  return modificationTime == null ? id : `${id}@${modificationTime}`;
}

export class UriResolverCache {
  private readonly resolved = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(private readonly resolve: (id: string) => Promise<string>) {}

  peek(key: string): string | undefined {
    return this.resolved.get(key);
  }

  /** 같은 key를 동시에 여러 곳에서 요청해도 resolve는 한 번만 호출한다. */
  get(id: string, key: string): Promise<string> {
    const cached = this.resolved.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const promise = this.resolve(id)
      .then((uri) => {
        this.resolved.set(key, uri);
        return uri;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }
}
