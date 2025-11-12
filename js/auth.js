// 단순 로컬스토리지 기반 인증 데모 (네비게이션 버그 수정)
(function(){
  var gotoLogin = document.getElementById('gotoLogin');
  var gotoSignUp = document.getElementById('gotoSignUp');
  var backToMainFromLogin = document.getElementById('backToMainFromLogin');
  var backToMainFromSignUp = document.getElementById('backToMainFromSignUp');
  var loginBtn = document.getElementById('loginBtn');
  var signUpBtn = document.getElementById('signUpBtn');

  // 최초 부팅 시 데모 사용자 1명 생성
  (function bootstrapDemoUser(){
    var users = JSON.parse(localStorage.getItem('users')||'[]');
    if (!users.find(function(u){ return u.id==='user'; })){
      users.push({ id:'user', name:'사용자', email:'user@example.com', contact:'', role:'user' });
      localStorage.setItem('users', JSON.stringify(users));
    }
  })();

  gotoLogin?.addEventListener('click', function(){ showPage('loginPage'); });
  gotoSignUp?.addEventListener('click', function(){ showPage('signUpPage'); });
  backToMainFromLogin?.addEventListener('click', function(){ showPage('mainPage'); });
  backToMainFromSignUp?.addEventListener('click', function(){ showPage('mainPage'); });

  signUpBtn?.addEventListener('click', function(){
    var id = document.getElementById('signUpId').value.trim();
    var pw = document.getElementById('signUpPassword').value;
    var pw2= document.getElementById('signUpConfirm').value;
    var email=document.getElementById('signUpEmail').value.trim();
    var name=document.getElementById('signUpName').value.trim();
    var birth=document.getElementById('signUpBirthdate').value;
    var contact=document.getElementById('signUpContact').value.trim();
    var consent=document.getElementById('signUpConsent').checked;
    if (!id || !pw || !email || !name || !consent) { alert('필수 항목을 확인하세요.'); return; }
    if (pw!==pw2) { alert('비밀번호 확인이 일치하지 않습니다.'); return; }
    var pending = JSON.parse(localStorage.getItem('pendingUsers')||'[]');
    if (pending.find(function(u){return u.id===id;})) { alert('이미 대기 중인 아이디입니다.'); return; }
    pending.push({ id, email, name, birth, contact, role:'user' });
    localStorage.setItem('pendingUsers', JSON.stringify(pending));
    document.getElementById('signUpMessage').textContent = '관리자 승인 대기중입니다.';
  });

  loginBtn?.addEventListener('click', function(){
    var id = document.getElementById('loginId').value.trim();
    var pw = document.getElementById('loginPassword').value; // 데모: pw 미검증
    // 관리자 바로 진입
    if (id==='admin') {
      localStorage.setItem('sessionUser', JSON.stringify({id:'admin', role:'admin', name:'관리자'}));
      showPage('adminPage'); 
      renderAdminTables?.();
      return;
    }
    var users = JSON.parse(localStorage.getItem('users')||'[]');
    var u = users.find(function(v){return v.id===id;});
    if (!u) { document.getElementById('loginError').textContent = '사용자를 찾을 수 없습니다. (기본 데모 아이디: user)'; return; }
    localStorage.setItem('sessionUser', JSON.stringify(u));
    // 앱 페이지로
    showPage('appContainer');
    // 스텝 초기화
    currentStep = 1; maxStepReached = 1; updateSteps();
  });

  // 관리자 페이지에서 로그아웃
  document.getElementById('backToMainFromAdmin')?.addEventListener('click', function(){ 
    localStorage.removeItem('sessionUser'); 
    showPage('mainPage'); 
  });

  // 로그 내보내기
  document.getElementById('exportLogs')?.addEventListener('click', function(){
    var data = { users: JSON.parse(localStorage.getItem('users')||'[]'), pending: JSON.parse(localStorage.getItem('pendingUsers')||'[]') };
    var blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    var a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='logs.json'; a.click(); URL.revokeObjectURL(a.href);
  });
})();