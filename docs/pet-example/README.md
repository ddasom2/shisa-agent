# 로컬 캐릭터 추가

사용 권한이 있는 `idle.png`를 이 폴더에 준비한 다음, 펫 설정의 「로컬 캐릭터 추가·교체」에서 `pet.json`을 선택하세요. 이 예제에는 캐릭터 그림이 포함되어 있지 않습니다.

id는 영문 소문자로 시작하며 영문 소문자·숫자·하이픈으로 최대 64자입니다. 기존 id(chiikawa, hachi, usagi, momonga, shisa, rakko, kurimanju)와 같으면 그 항목의 그림을 교체합니다. 다른 id는 새 항목을 추가합니다.

animations의 키는 idle(필수), walk, run, sleep, play, interact입니다. 값은 manifest 폴더 안에 있는 PNG/GIF/WebM의 상대 경로입니다. 지정하지 않은 상태는 idle로 대체합니다. 원격 주소, 절대 경로, 폴더 밖의 파일, 심볼릭 링크, 64MB 초과 파일은 받지 않습니다. WebM은 투명 배경 지원 코덱을 권장합니다. PNG는 정지 이미지이며, GIF/WebM은 재생합니다.

예: `"walk": "walk.gif"`, `"play": "play.webm"`을 animations에 추가합니다. 실제 파일도 함께 준비하세요. id를 kurimanju, name을 쿠리만쥬로 바꾸면 해당 캐릭터를 등록할 수 있습니다.

profile은 calm/shy/friendly/energetic/playful 문자열 또는 예제처럼 행동 가중치·지속 시간·사교성·따라가기 성향을 담은 데이터입니다. 파일은 앱 저장소로 복사되므로 원본 폴더를 옮겨도 작동합니다. 라이선스와 사용 허가는 사용자가 확인해야 하며 프로그램은 외부 이미지를 다운로드하지 않습니다.
