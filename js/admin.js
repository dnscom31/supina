// 관리자 페이지 진입 도우미 (새 showPage 방식과 호환)
window.addEventListener('DOMContentLoaded', function(){
  function render() {
    var session = JSON.parse(localStorage.getItem('sessionUser')||'null');
    if (session && session.role==='admin'){
      showPage('adminPage');
      renderAdminTables?.();
    }
  }
  render();
});

// 전역에서 호출
window.renderAdminTables = function(){
  var pending = JSON.parse(localStorage.getItem('pendingUsers')||'[]');
  var users = JSON.parse(localStorage.getItem('users')||'[]');
  var pbody = document.querySelector('#pendingTable tbody');
  var ubody = document.querySelector('#usersTable tbody');
  if (!pbody || !ubody) return;
  pbody.innerHTML=''; ubody.innerHTML='';
  pending.forEach(function(u, idx){
    var tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.birth||''}</td><td>${u.contact||''}</td>
    <td><button class="approve">승인</button><button class="reject">거절</button></td>`;
    tr.querySelector('.approve').addEventListener('click', function(){
      pending.splice(idx,1); localStorage.setItem('pendingUsers', JSON.stringify(pending));
      users.push(u); localStorage.setItem('users', JSON.stringify(users)); window.renderAdminTables();
    });
    tr.querySelector('.reject').addEventListener('click', function(){
      pending.splice(idx,1); localStorage.setItem('pendingUsers', JSON.stringify(pending)); window.renderAdminTables();
    });
    pbody.appendChild(tr);
  });
  users.forEach(function(u, idx){
    var tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.contact||''}</td>
    <td>${u.role||'user'}</td><td><button class="make-admin">관리자</button><button class="delete">삭제</button></td>`;
    tr.querySelector('.make-admin').addEventListener('click', function(){ u.role='admin'; localStorage.setItem('users', JSON.stringify(users)); window.renderAdminTables(); });
    tr.querySelector('.delete').addEventListener('click', function(){ users.splice(idx,1); localStorage.setItem('users', JSON.stringify(users)); window.renderAdminTables(); });
    ubody.appendChild(tr);
  });
};
