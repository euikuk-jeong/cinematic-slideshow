import { MAX_FOLDER_NAME_LENGTH, validateNewFolderName } from '../folderName';

describe('validateNewFolderName', () => {
  it('앞뒤 공백을 정리한 이름을 돌려준다', () => {
    expect(validateNewFolderName('  Trip 2024  ', [])).toEqual({ ok: true, name: 'Trip 2024' });
  });

  it('한글·숫자·공백·하이픈·밑줄을 허용한다', () => {
    expect(validateNewFolderName('여행 2024-가족_사진', [])).toEqual({ ok: true, name: '여행 2024-가족_사진' });
  });

  it('다른 언어의 글자도 허용한다', () => {
    expect(validateNewFolderName('旅行 Café', [])).toEqual({ ok: true, name: '旅行 Café' });
  });

  it('빈 문자열·공백뿐인 문자열은 empty', () => {
    expect(validateNewFolderName('', [])).toEqual({ ok: false, problem: 'empty' });
    expect(validateNewFolderName('   ', [])).toEqual({ ok: false, problem: 'empty' });
  });

  it.each(['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', '.hidden', 'a.b', '여행(1)', 'a&b', '😀'])(
    '네이티브가 거부하는 문자가 있으면 invalidChars: %s',
    (name) => {
      expect(validateNewFolderName(name, [])).toEqual({ ok: false, problem: 'invalidChars' });
    }
  );

  it('최대 길이까지 허용하고 넘으면 tooLong(글자 수 기준, 한글도 1자)', () => {
    expect(validateNewFolderName('가'.repeat(MAX_FOLDER_NAME_LENGTH), [])).toMatchObject({ ok: true });
    expect(validateNewFolderName('가'.repeat(MAX_FOLDER_NAME_LENGTH + 1), [])).toEqual({
      ok: false,
      problem: 'tooLong',
    });
  });

  it('이미 있는 앨범 제목과 같으면(대소문자·앞뒤 공백 무시) exists', () => {
    expect(validateNewFolderName('travel', ['Travel'])).toEqual({ ok: false, problem: 'exists' });
    expect(validateNewFolderName('가족', [' 가족 '])).toEqual({ ok: false, problem: 'exists' });
    expect(validateNewFolderName('Travel 2', ['Travel'])).toMatchObject({ ok: true });
  });
});
