// 페이지 전환 + 스텝 네비게이션
function showPage(id){
  var ids = ['mainPage','loginPage','signUpPage','adminPage','appContainer'];
  ids.forEach(function(s){
    var el = document.getElementById(s);
    if(!el) return;
    if (s==='adminPage' || s==='appContainer'){
      el.style.display = (s===id) ? 'flex' : 'none';
    } else {
      if (s===id) el.classList.add('active');
      else el.classList.remove('active');
    }
  });
}

window.addEventListener('DOMContentLoaded', function(){
  selectDom();
  updateSteps();

  // 스텝 클릭 이동 (로그인 이후에도 작동)
  stepElems.forEach(function(step){
    step.addEventListener('click', function(){
      var s = parseInt(step.dataset.step);
      if (s <= maxStepReached){
        currentStep = s; updateSteps();
        if (currentStep===5) updateResult();
      }
    });
  });

  // 초기 상태: 랜딩만 보이도록
  showPage('mainPage');
});
