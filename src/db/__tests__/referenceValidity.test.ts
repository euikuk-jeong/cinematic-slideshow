import { computeReferenceValidityDiff } from '../referenceValidity';
import type { Album } from '../types';

function album(overrides: Partial<Album>): Album {
  return {
    id: 1,
    deviceAlbumId: 'device-album-1',
    displayName: 'Camera',
    isReferenceValid: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeReferenceValidityDiff', () => {
  it('flags a currently-valid album whose device id disappeared', () => {
    const stored = [album({ id: 1, deviceAlbumId: 'device-album-1', isReferenceValid: true })];
    const diff = computeReferenceValidityDiff(stored, new Set());

    expect(diff.toInvalid).toEqual([1]);
    expect(diff.toValid).toEqual([]);
  });

  it('flags a currently-invalid album whose device id reappeared', () => {
    const stored = [album({ id: 1, deviceAlbumId: 'device-album-1', isReferenceValid: false })];
    const diff = computeReferenceValidityDiff(stored, new Set(['device-album-1']));

    expect(diff.toValid).toEqual([1]);
    expect(diff.toInvalid).toEqual([]);
  });

  it('leaves a valid album alone when its device id is still present', () => {
    const stored = [album({ id: 1, deviceAlbumId: 'device-album-1', isReferenceValid: true })];
    const diff = computeReferenceValidityDiff(stored, new Set(['device-album-1']));

    expect(diff.toValid).toEqual([]);
    expect(diff.toInvalid).toEqual([]);
  });

  it('leaves an invalid album alone when its device id is still missing', () => {
    const stored = [album({ id: 1, deviceAlbumId: 'device-album-1', isReferenceValid: false })];
    const diff = computeReferenceValidityDiff(stored, new Set());

    expect(diff.toValid).toEqual([]);
    expect(diff.toInvalid).toEqual([]);
  });

  it('handles a mix of multiple albums independently', () => {
    const stored = [
      album({ id: 1, deviceAlbumId: 'a', isReferenceValid: true }), // stays valid
      album({ id: 2, deviceAlbumId: 'b', isReferenceValid: true }), // -> invalid
      album({ id: 3, deviceAlbumId: 'c', isReferenceValid: false }), // -> valid
      album({ id: 4, deviceAlbumId: 'd', isReferenceValid: false }), // stays invalid
    ];
    const diff = computeReferenceValidityDiff(stored, new Set(['a', 'c']));

    expect(diff.toValid).toEqual([3]);
    expect(diff.toInvalid).toEqual([2]);
  });

  it('returns no changes for an empty album list', () => {
    const diff = computeReferenceValidityDiff([], new Set(['a']));

    expect(diff.toValid).toEqual([]);
    expect(diff.toInvalid).toEqual([]);
  });
});
