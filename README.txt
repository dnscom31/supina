Supina Brow App (분리 버전) — 실행 안내

1) index.html을 브라우저에서 엽니다.
2) 로그인:
   - 데모 사용자: 아이디 'user' (비밀번호 아무거나 입력 가능)
   - 관리자: 아이디 'admin' (비밀번호 아무거나 → 관리자 페이지)
3) 로그인 후 앱 화면에서 1~5단계를 순서대로 진행하세요.
4) OpenCV CDN이 차단되어도 간이 추출 로직으로 동작합니다.

중요 수정:
- showPage()로 네비게이션 안정화 (기존 'active' 클래스/inline display 충돌 해결)
- 로그인 성공 시 showPage('appContainer') 확정 호출 + 스텝 초기화
- 기본 프리셋 PNG 더미 포함 (images/default-brows/*)
