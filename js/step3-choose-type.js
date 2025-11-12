// 3단계: 기본/새 눈썹 선택 & 토글
(function(){
  window.addEventListener('DOMContentLoaded', function(){
    selectDom();
    document.getElementById('btnUseDefaults')?.addEventListener('click', function(){ useDefaultBrow=true; currentStep=5; maxStepReached=Math.max(maxStepReached,5); updateSteps(); updateResult(); });
    document.getElementById('btnUploadNewDesign')?.addEventListener('click', function(){ useDefaultBrow=false; currentStep=4; maxStepReached=Math.max(maxStepReached,4); updateSteps(); });

    document.getElementById('btnStyleCurved')?.addEventListener('click', function(){ setDefaultStyle('curved'); });
    document.getElementById('btnStyleSoft')?.addEventListener('click', function(){ setDefaultStyle('soft'); });
    document.getElementById('btnStyleStandard')?.addEventListener('click', function(){ setDefaultStyle('standard'); });
    document.getElementById('btnStyleStraight')?.addEventListener('click', function(){ setDefaultStyle('straight'); });
    document.getElementById('btnStyleSuitable')?.addEventListener('click', function(){ setDefaultStyle('suitable'); });
    hideUploadedChk?.addEventListener('change', function(){ hideUploadedBrow = hideUploadedChk.checked; updateResult(); });
  });
})();