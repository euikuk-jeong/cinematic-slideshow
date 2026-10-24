import { Platform } from 'react-native';
import { startActivityAsync } from 'expo-intent-launcher';

const ACTION_VIEW = 'android.intent.action.VIEW';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export type ExternalPlayerResult = 'opened' | 'unsupported' | 'failed';

/**
 * 영상을 설치된 다른 플레이어 앱으로 연다(Android ACTION_VIEW). 받는 앱이 MediaStore를 직접 읽을
 * 권한이 없어도 재생되도록 읽기 권한 플래그를 붙이고, 앱이 둘 이상이면 시스템 선택창이 뜬다.
 *
 * 넘기는 값은 `Asset.getUri()`(file:// 경로)가 아니라 에셋 id(Android에선 content:// URI 자체)다 —
 * file:// 를 다른 앱에 넘기면 FileUriExposedException이 난다.
 */
export async function openVideoInExternalPlayer(contentUri: string): Promise<ExternalPlayerResult> {
  if (Platform.OS !== 'android' || !contentUri.startsWith('content://')) return 'unsupported';
  try {
    await startActivityAsync(ACTION_VIEW, {
      data: contentUri,
      type: 'video/*',
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    return 'opened';
  } catch (e) {
    // 영상을 열 수 있는 앱이 없으면 ActivityNotFoundException이 여기로 온다.
    console.warn('[externalPlayer] 외부 플레이어 실행 실패', e);
    return 'failed';
  }
}
