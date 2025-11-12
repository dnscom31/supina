// 1단계: 얼굴 업로드 + 리셋
(function(){
  window.addEventListener('DOMContentLoaded', function(){
    selectDom();
    if (!faceInput) return;
    faceInput.addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0]; if (!file) return;
      var img = new Image();
      img.onload = function(){
        var maxSide = 1600;
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        faceW = Math.round(img.width * scale); faceH = Math.round(img.height * scale);
        faceCanvas.width = faceMaskCanvas.width = faceW; faceCanvas.height = faceMaskCanvas.height = faceH;
        faceBaseCanvas = document.createElement('canvas'); faceBaseCanvas.width = faceW; faceBaseCanvas.height = faceH; faceBaseCtx = faceBaseCanvas.getContext('2d');
        faceBaseOriginalCanvas = document.createElement('canvas'); faceBaseOriginalCanvas.width = faceW; faceBaseOriginalCanvas.height = faceH; faceBaseOriginalCtx = faceBaseOriginalCanvas.getContext('2d');
        faceBaseCtx.clearRect(0,0,faceW,faceH); faceBaseCtx.drawImage(img,0,0,faceW,faceH);
        faceBaseOriginalCtx.clearRect(0,0,faceW,faceH); faceBaseOriginalCtx.drawImage(img,0,0,faceW,faceH);
        faceCtx.clearRect(0,0,faceW,faceH);
        faceCtx.drawImage(img,0,0,faceW,faceH); // 초기 이미지 그리기
        faceMaskCtx.clearRect(0,0,faceW,faceH);

        faceImage = img; paintingSide = null;
        faceRegions = {left:null,right:null};
        faceMasks = {left:null,right:null};
        selectionLocked = {left:false,right:false};

        newBrows.left=null; newBrows.right=null; nudgeOffsets.left={x:0,y:0}; nudgeOffsets.right={x:0,y:0};
        faceMaskCanvas.style.display='';
        paintStatus.textContent='';

        // nextFromStep2 버튼 초기화 (강제로 숨김)
        var nextBtn = document.getElementById('nextFromStep2');
        if (nextBtn) {
          nextBtn.style.display='none';
          nextBtn.disabled = true;
          console.log('✅ nextFromStep2 버튼 초기화 완료');
        } else {
          console.error('❌ nextFromStep2 버튼을 찾을 수 없습니다!');
        }

        currentStep = 2; maxStepReached = Math.max(maxStepReached,2); updateSteps();
      };
      img.src = URL.createObjectURL(file);
    });
  });
})();