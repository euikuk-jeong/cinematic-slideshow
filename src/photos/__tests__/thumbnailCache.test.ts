import { thumbnailCacheKey, UriResolverCache } from '../thumbnailCache';

describe('thumbnailCacheKey', () => {
  it('returns the same key for the same id and modificationTime', () => {
    expect(thumbnailCacheKey('a', 100)).toBe(thumbnailCacheKey('a', 100));
  });

  it('returns a different key when modificationTime changes', () => {
    expect(thumbnailCacheKey('a', 100)).not.toBe(thumbnailCacheKey('a', 200));
  });

  it('falls back to the id alone when modificationTime is null or undefined', () => {
    expect(thumbnailCacheKey('a', null)).toBe('a');
    expect(thumbnailCacheKey('a', undefined)).toBe('a');
  });

  it('keeps different ids apart', () => {
    expect(thumbnailCacheKey('a', 1)).not.toBe(thumbnailCacheKey('b', 1));
  });
});

describe('UriResolverCache.invalidate', () => {
  it('id와 id@modificationTime 키를 모두 지우고 다른 id는 남긴다', async () => {
    const resolve = jest.fn().mockImplementation(async (id: string) => `file:///${id}.jpg`);
    const cache = new UriResolverCache(resolve);
    await cache.get('a', 'a@1');
    await cache.get('a', 'a');
    await cache.get('b', 'b@1');

    cache.invalidate(['a']);

    expect(cache.peek('a@1')).toBeUndefined();
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b@1')).toBe('file:///b.jpg');
  });

  it('지운 뒤 다시 조회하면 resolve를 새로 호출한다', async () => {
    const resolve = jest.fn().mockResolvedValue('file:///moved.jpg');
    const cache = new UriResolverCache(resolve);
    await cache.get('a', 'a@1');
    cache.invalidate(['a']);
    await cache.get('a', 'a@1');
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});

describe('UriResolverCache', () => {
  it('does not call resolve again for a cached key', async () => {
    const resolve = jest.fn().mockResolvedValue('file:///a.jpg');
    const cache = new UriResolverCache(resolve);
    await cache.get('a', 'a');
    await cache.get('a', 'a');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(cache.peek('a')).toBe('file:///a.jpg');
  });

  it('calls resolve once for concurrent requests of the same key', async () => {
    const resolve = jest.fn().mockResolvedValue('file:///a.jpg');
    const cache = new UriResolverCache(resolve);
    const [u1, u2] = await Promise.all([cache.get('a', 'a'), cache.get('a', 'a')]);
    expect(u1).toBe(u2);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves again when the key changes (file modified)', async () => {
    const resolve = jest.fn().mockResolvedValueOnce('file:///old.jpg').mockResolvedValueOnce('file:///new.jpg');
    const cache = new UriResolverCache(resolve);
    expect(await cache.get('a', 'a@1')).toBe('file:///old.jpg');
    expect(await cache.get('a', 'a@2')).toBe('file:///new.jpg');
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures so a later request can retry', async () => {
    const resolve = jest.fn().mockRejectedValueOnce(new Error('gone')).mockResolvedValueOnce('file:///a.jpg');
    const cache = new UriResolverCache(resolve);
    await expect(cache.get('a', 'a')).rejects.toThrow('gone');
    expect(cache.peek('a')).toBeUndefined();
    expect(await cache.get('a', 'a')).toBe('file:///a.jpg');
  });
});
