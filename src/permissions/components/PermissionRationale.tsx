import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface PermissionRationaleProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function PermissionRationale({ onConfirm, onCancel }: PermissionRationaleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>사진 접근 권한이 필요해요</Text>
      <Text style={styles.body}>
        앨범을 선택해 슬라이드쇼를 만들려면 기기 사진에 접근할 수 있어야 합니다. 사진은 앱으로
        복사되지 않고, 기기에 그대로 남습니다.
      </Text>
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
