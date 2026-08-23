import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface PermissionBlockedProps {
  // 'blocked': 사진 권한 거부 + 재요청 불가(canAskAgain=false)
  // 'partial': Android 14+ 부분 접근 허용 상태 — 폴더 단위 선택과 맞지 않아 전체 허용 필요
  // 'audio_blocked': 기기 음악 선택용 오디오 권한 거부 + 재요청 불가
  variant: 'blocked' | 'partial' | 'audio_blocked';
  onOpenSettings: () => void;
}

const COPY: Record<PermissionBlockedProps['variant'], { title: string; body: string }> = {
  blocked: {
    title: '사진 접근 권한이 꺼져 있어요',
    body: '설정에서 사진 접근 권한을 허용해야 앨범을 선택할 수 있습니다.',
  },
  partial: {
    title: '전체 앨범 접근이 필요해요',
    body: '일부 사진만 선택된 상태입니다. 폴더 단위로 앨범을 보여드리려면 설정에서 "모든 사진 허용"으로 변경해주세요.',
  },
  audio_blocked: {
    title: '음악 접근 권한이 꺼져 있어요',
    body: '설정에서 음악 파일 접근 권한을 허용해야 기기에서 배경음악을 선택할 수 있습니다.',
  },
};

export function PermissionBlocked({ variant, onOpenSettings }: PermissionBlockedProps) {
  const copy = COPY[variant];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Pressable style={styles.primaryButton} onPress={onOpenSettings}>
        <Text style={styles.primaryButtonText}>설정으로 이동</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    color: '#444',
  },
  primaryButton: {
    backgroundColor: '#FC836D',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
