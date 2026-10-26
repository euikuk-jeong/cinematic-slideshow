import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';
import type { UseMediaLibraryPermissionResult } from '../useMediaLibraryPermission';
import { PermissionBlocked } from './PermissionBlocked';
import { PermissionRationale } from './PermissionRationale';

interface VideoOpsPermissionModalsProps {
  videoPermission: UseMediaLibraryPermissionResult;
  /** 영상 권한 없이 앨범 단위 작업을 하려 할 때 띄우는 안내(영상은 처리되지 않는다는 경고). */
  promptVisible: boolean;
  onAllow: () => void;
  onProceedWithoutVideos: () => void;
  onCancelPrompt: () => void;
  /** 권한이 막혀(blocked) 시스템 설정으로 보내야 할 때의 전체 화면 안내. */
  blockedVisible: boolean;
  onCloseBlocked: () => void;
}

/**
 * 앨범 단위 삭제·이동·복사·이름 변경은 앨범의 사진과 영상을 함께 다루지만, 영상 권한이 없으면 MediaStore가 영상 행을
 * 돌려주지 않아 영상은 처리되지 않고 그 자리에 남는다. 그 사실을 알리고 영상 권한을 허용할 기회를 준다
 * (권한 요청 흐름은 갤러리의 영상 배너와 같은 rationale → 시스템 요청 → 막히면 설정 이동).
 */
export function VideoOpsPermissionModals({
  videoPermission,
  promptVisible,
  onAllow,
  onProceedWithoutVideos,
  onCancelPrompt,
  blockedVisible,
  onCloseBlocked,
}: VideoOpsPermissionModalsProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <>
      <Modal visible={promptVisible} transparent animationType="fade" onRequestClose={onCancelPrompt}>
        <Pressable style={styles.backdrop} onPress={onCancelPrompt}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{t('videoPrompt.title')}</Text>
            <Text testID="video-prompt-body" style={styles.body}>
              {t('videoPrompt.body')}
            </Text>
            <Pressable testID="video-prompt-allow" accessibilityRole="button" style={styles.primary} onPress={onAllow}>
              <Text style={styles.primaryText}>{t('videoPrompt.allow')}</Text>
            </Pressable>
            <Pressable
              testID="video-prompt-proceed"
              accessibilityRole="button"
              style={styles.secondary}
              onPress={onProceedWithoutVideos}
            >
              <Text style={styles.secondaryText}>{t('videoPrompt.proceed')}</Text>
            </Pressable>
            <Pressable testID="video-prompt-cancel" accessibilityRole="button" style={styles.secondary} onPress={onCancelPrompt}>
              <Text style={styles.cancelText}>{t('common:cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={videoPermission.state === 'rationale' || blockedVisible}
        animationType="fade"
        onRequestClose={() => {
          if (videoPermission.state === 'rationale') videoPermission.cancelRationale();
          onCloseBlocked();
        }}
      >
        <View style={styles.fullscreen}>
          {videoPermission.state === 'rationale' ? (
            <PermissionRationale
              variant="video"
              onConfirm={videoPermission.confirmRationale}
              onCancel={videoPermission.cancelRationale}
            />
          ) : (
            <>
              <PermissionBlocked variant="video_blocked" onOpenSettings={videoPermission.openSettings} />
              <Pressable
                testID="video-ops-blocked-close"
                accessibilityRole="button"
                style={styles.closeButton}
                onPress={onCloseBlocked}
              >
                <Text style={styles.cancelText}>{t('common:cancel')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      width: '90%',
      maxWidth: 380,
      borderRadius: 12,
      backgroundColor: c.surface,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: c.ink,
      paddingBottom: 8,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      paddingBottom: 8,
    },
    primary: {
      minHeight: 48,
      marginTop: 8,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    secondary: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.accent,
    },
    cancelText: {
      fontSize: 15,
      color: c.textSecondary,
    },
    fullscreen: {
      flex: 1,
      backgroundColor: c.background,
    },
    closeButton: {
      alignSelf: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      marginBottom: 24,
    },
  });
}
