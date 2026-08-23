import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface PermissionRationaleProps {
  // 'photo': 앨범 목록 화면 진입 시. 'audio': 앨범별 설정 화면에서 기기 음악 선택 시.
  variant?: 'photo' | 'audio';
  onConfirm: () => void;
  onCancel: () => void;
}

const COPY: Record<NonNullable<PermissionRationaleProps['variant']>, { title: string; body: string }> = {
  photo: {
    title: '사진 접근 권한이 필요해요',
    body: '앨범을 선택해 슬라이드쇼를 만들려면 기기 사진에 접근할 수 있어야 합니다. 사진은 앱으로 복사되지 않고, 기기에 그대로 남습니다.',
  },
  audio: {
    title: '음악 접근 권한이 필요해요',
    body: '배경음악으로 쓸 기기 음악 파일을 선택하려면 접근 권한이 필요합니다. 음악 파일은 앱으로 복사되지 않고, 기기에 그대로 남습니다.',
  },
};

export function PermissionRationale({ variant = 'photo', onConfirm, onCancel }: PermissionRationaleProps) {
  const copy = COPY[variant];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Pressable style={styles.primaryButton} onPress={onConfirm}>
        <Text style={styles.primaryButtonText}>계속</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onCancel}>
        <Text style={styles.secondaryButtonText}>취소</Text>
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
  secondaryButton: {
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#666',
  },
});
