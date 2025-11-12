// 2단계: 눈썹 영역 페인팅/확인 (줌/이동, 고정 그리드, 자동선택 제거)
(function(){
  // 뷰 상태
  var zoom = 1.0, minZoom = 1.0, maxZoom = 4.0;
  var panX = 0, panY = 0;
  var isPanning = false;
  var paintActive = false;
  var lastScreen = {x:0,y:0};

  // 각 영역별 마스크 캔버스 (왼쪽/오른쪽 분리)
  var maskRawLeft, maskRawRight;
  var mrawCtxLeft, mrawCtxRight;

  // 현재 작업 중인 영역
  var paintingSide = null;

  // 지우개 모드
  var eraserMode = false;

  function screenToImage(x, y){
    return {
      x: (x - panX) / zoom,
      y: (y - panY) / zoom
    };
  }

  function ensureMaskRaw(side){
    if (!faceW || !faceH) return;

    if (side === 'left') {
      if (!maskRawLeft){
        maskRawLeft = document.createElement('canvas');
        maskRawLeft.width = faceW;
        maskRawLeft.height = faceH;
        mrawCtxLeft = maskRawLeft.getContext('2d');
        mrawCtxLeft.lineCap='round';
        mrawCtxLeft.lineJoin='round';
      }
    } else if (side === 'right') {
      if (!maskRawRight){
        maskRawRight = document.createElement('canvas');
        maskRawRight.width = faceW;
        maskRawRight.height = faceH;
        mrawCtxRight = maskRawRight.getContext('2d');
        mrawCtxRight.lineCap='round';
        mrawCtxRight.lineJoin='round';
      }
    }
  }

  function computeBBoxFromMaskRaw(maskCanvas){
    if (!maskCanvas) return null;
    var ctx = maskCanvas.getContext('2d');
    var imgData = ctx.getImageData(0,0,maskCanvas.width, maskCanvas.height).data;
    var minX=maskCanvas.width, minY=maskCanvas.height, maxX=0, maxY=0, found=false;
    for (var y=0;y<maskCanvas.height;y++){
      for (var x=0;x<maskCanvas.width;x++){
        var a = imgData[(y*maskCanvas.width + x)*4 + 3];
        if (a>0){
          found=true;
          if(x<minX)minX=x;
          if(y<minY)minY=y;
          if(x>maxX)maxX=x;
          if(y>maxY)maxY=y;
        }
      }
    }
    if (!found) return null;
    return {minX, minY, maxX, maxY, w:maxX-minX+1, h:maxY-minY+1};
  }

  function renderStep2(){
    if (!faceCanvas || !faceCtx) return;
    if (!faceImage || !faceCanvas || !faceMaskCanvas) return;

    // 이미지
    faceCtx.save();
    faceCtx.setTransform(1,0,0,1,0,0);
    faceCtx.clearRect(0,0,faceCanvas.width, faceCanvas.height);
    faceCtx.setTransform(zoom, 0, 0, zoom, panX, panY);
    faceCtx.drawImage(faceBaseCanvas||faceImage, 0, 0, faceW, faceH);
    faceCtx.restore();

    // 마스크 오버레이
    faceMaskCtx.save();
    faceMaskCtx.setTransform(1,0,0,1,0,0);
    faceMaskCtx.clearRect(0,0,faceMaskCanvas.width, faceMaskCanvas.height);
    faceMaskCtx.setTransform(zoom, 0, 0, zoom, panX, panY);

    // 왼쪽 마스크 표시 (확정되지 않은 경우)
    if (maskRawLeft && !selectionLocked.left) {
      faceMaskCtx.drawImage(maskRawLeft, 0, 0);
    }

    // 오른쪽 마스크 표시 (확정되지 않은 경우)
    if (maskRawRight && !selectionLocked.right) {
      faceMaskCtx.drawImage(maskRawRight, 0, 0);
    }

    // 선택된 영역 점선 표시
    faceMaskCtx.setTransform(zoom,0,0,zoom,panX,panY);
    faceMaskCtx.save();
    faceMaskCtx.setLineDash([8,6]);
    faceMaskCtx.lineWidth=2;
    faceMaskCtx.strokeStyle='rgba(255,255,255,.9)';

    ['left','right'].forEach(function(side){
      if (!selectionLocked[side]) return;
      var reg = faceRegions[side];
      if(!reg||!reg.bbox) return;
      var x=reg.bbox[0], y=reg.bbox[1], w=reg.bbox[2], h=reg.bbox[3];
      faceMaskCtx.strokeRect(x, y, w, h);
    });

    faceMaskCtx.restore();
    faceMaskCtx.restore();
  }

  function updateNextFromStep2(){
    console.log('=== updateNextFromStep2 (항상 활성화 모드) ===');

    if (!nextFromStep2) {
      console.error('❌ nextFromStep2 버튼을 찾을 수 없습니다!');
      nextFromStep2 = document.getElementById('nextFromStep2');
      if (!nextFromStep2) {
        console.error('❌ document.getElementById로도 찾을 수 없습니다!');
        return;
      }
      console.log('✅ nextFromStep2 버튼을 찾았습니다:', nextFromStep2);
    }

    // 항상 보이고 활성 상태로 유지
    nextFromStep2.style.display = 'block';
    nextFromStep2.style.visibility = 'visible';
    nextFromStep2.style.opacity = '1';
    nextFromStep2.disabled = false;
    nextFromStep2.classList.remove('disabled');

    console.log('최종 display:', nextFromStep2.style.display, 'disabled:', nextFromStep2.disabled);
  }

  function clampPan(){
    if (!faceCanvas) return;
    var viewW = faceCanvas.width, viewH = faceCanvas.height;
    var imgW = (faceW||0) * zoom, imgH = (faceH||0) * zoom;

    if (imgW >= viewW){
      var minX = viewW - imgW;
      var maxX = 0;
      if (panX < minX) panX = minX;
      if (panX > maxX) panX = maxX;
    } else {
      panX = (viewW - imgW)/2;
    }

    if (imgH >= viewH){
      var minY = viewH - imgH;
      var maxY = 0;
      if (panY < minY) panY = minY;
      if (panY > maxY) panY = maxY;
    } else {
      panY = (viewH - imgH)/2;
    }
  }

  function zoomAt(factor, center){
    var newZoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
    var cx = center.x, cy = center.y;
    panX = cx - (newZoom/zoom) * (cx - panX);
    panY = cy - (newZoom/zoom) * (cy - panY);
    zoom = newZoom;
    clampPan();
    renderStep2();
  }

  function reapplyLiquify(){
    if (!faceBaseOriginalCanvas || !faceBaseCanvas) return;
    faceBaseCtx.setTransform(1,0,0,1,0,0);
    faceBaseCtx.clearRect(0,0,faceW,faceH);
    faceBaseCtx.drawImage(faceBaseOriginalCanvas, 0, 0);

    var feather = liquifyFeather? parseInt(liquifyFeather.value) : 0;
    var sat = liquifySaturation? parseInt(liquifySaturation.value) : 100;
    var raw = liquifyOpacity? parseInt(liquifyOpacity.value) : 500;
    raw = Math.max(0, Math.min(500, raw));

    // 선형 스케일로 변경: 더 강력한 효과
    // 0~500 범위를 0~1로 매핑하되, 최대값에서 완전 불투명
    var opa = raw / 500;

    ['left','right'].forEach(function(side){
      var reg = faceRegions[side];
      var mask = faceMasks[side];
      if(!reg||!mask) return;

      var minX=reg.bbox[0], minY=reg.bbox[1], boxW=reg.bbox[2], boxH=reg.bbox[3];
      var patch = document.createElement('canvas');
      patch.width=boxW;
      patch.height=boxH;
      var pctx=patch.getContext('2d');

      var filterParts=[];
      if (feather>0) filterParts.push('blur('+feather+'px)');
      filterParts.push('saturate('+(sat/100)+')');
      pctx.filter = filterParts.join(' ');

      pctx.drawImage(faceBaseOriginalCanvas, minX, minY, boxW, boxH, 0, 0, boxW, boxH);

      var m = document.createElement('canvas');
      m.width=boxW;
      m.height=boxH;
      var mctx=m.getContext('2d');
      mctx.drawImage(mask.maskCanvas,0,0);

      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(m,0,0);

      faceBaseCtx.save();
      faceBaseCtx.globalAlpha = opa;
      faceBaseCtx.drawImage(patch, minX, minY);
      faceBaseCtx.restore();
    });
  }

  window.addEventListener('DOMContentLoaded', function(){
    selectDom();
    if (!faceCanvas) return;

    function onPointerDown(e){
      if (!faceImage) return;
      var isRight = (e.button===2);
      var pos = getCanvasPos(faceMaskCanvas, e);
      lastScreen = pos;

      if (!paintingSide || isRight){
        isPanning = true;
      } else {
        ensureMaskRaw(paintingSide);
        paintActive = true;

        var _bw = parseInt(brushSizeInput.value);
        _bw = isNaN(_bw)?15:Math.max(0, Math.min(100, _bw));

        var ctx = (paintingSide==='left') ? mrawCtxLeft : mrawCtxRight;
        ctx.lineWidth = _bw;

        if (eraserMode) {
          // 지우개 모드: destination-out으로 설정
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
          // 그리기 모드
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = (paintingSide==='left'?'rgba(180,140,245,0.95)':'rgba(245,138,203,0.95)');
        }

        ctx.beginPath();
        var img = screenToImage(pos.x, pos.y);
        ctx.moveTo(img.x, img.y);
      }
    }

    function onPointerMove(e){
      if (!faceImage) return;
      var pos = getCanvasPos(faceMaskCanvas, e);

      if (isPanning){
        var dx = pos.x - lastScreen.x;
        var dy = pos.y - lastScreen.y;
        panX += dx;
        panY += dy;
        lastScreen = pos;
        clampPan();
        renderStep2();
      } else if (paintActive){
        var ctx = (paintingSide==='left') ? mrawCtxLeft : mrawCtxRight;
        var img = screenToImage(pos.x, pos.y);
        ctx.lineTo(img.x, img.y);
        ctx.stroke();
        renderStep2();
      }
    }

    function onPointerUp(){
      if (isPanning){ isPanning=false; }
      if (paintActive){
        paintActive=false;
        var ctx = (paintingSide==='left') ? mrawCtxLeft : mrawCtxRight;
        ctx.closePath();
        // 복합 연산 모드 초기화
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    faceMaskCanvas?.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    faceMaskCanvas?.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    document.getElementById('zoomInStep2')?.addEventListener('click', function(){
      var rect = faceMaskCanvas.getBoundingClientRect();
      zoomAt(1.25, {x: rect.width/2 * (faceMaskCanvas.width/rect.width), y: rect.height/2 * (faceMaskCanvas.height/rect.height)});
    });

    document.getElementById('zoomOutStep2')?.addEventListener('click', function(){
      var rect = faceMaskCanvas.getBoundingClientRect();
      zoomAt(1/1.25, {x: rect.width/2 * (faceMaskCanvas.width/rect.width), y: rect.height/2 * (faceMaskCanvas.height/rect.height)});
    });

    document.getElementById('resetViewStep2')?.addEventListener('click', function(){
      zoom = 1.0;
      panX = 0;
      panY = 0;
      renderStep2();
    });

    paintLeftBtn?.addEventListener('click', function(){
      if(!faceImage) return;
      paintingSide='left';
      eraserMode = false;
      paintStatus.textContent='왼쪽 페인팅 모드 (좌클릭: 페인팅 / 우클릭: 이동)';
    });

    paintRightBtn?.addEventListener('click', function(){
      if(!faceImage) return;
      paintingSide='right';
      eraserMode = false;
      paintStatus.textContent='오른쪽 페인팅 모드 (좌클릭: 페인팅 / 우클릭: 이동)';
    });

    // 지우개 버튼 (새로 추가 필요)
    var eraserBtn = document.getElementById('eraserBtn');
    eraserBtn?.addEventListener('click', function(){
      if(!faceImage || !paintingSide) {
        alert('먼저 왼쪽 또는 오른쪽 칠하기를 선택해주세요.');
        return;
      }
      eraserMode = !eraserMode;
      if (eraserMode) {
        paintStatus.textContent = paintingSide.toUpperCase() + ' 지우개 모드 (좌클릭: 지우기 / 우클릭: 이동)';
        eraserBtn.textContent = '그리기 모드로';
      } else {
        paintStatus.textContent = paintingSide.toUpperCase() + ' 페인팅 모드 (좌클릭: 페인팅 / 우클릭: 이동)';
        eraserBtn.textContent = '지우개 모드로';
      }
    });

    function clearFaceMask(side){
      if (!faceImage) return;

      if (side === 'left') {
        ensureMaskRaw('left');
        mrawCtxLeft.clearRect(0,0,maskRawLeft.width, maskRawLeft.height);
      } else if (side === 'right') {
        ensureMaskRaw('right');
        mrawCtxRight.clearRect(0,0,maskRawRight.width, maskRawRight.height);
      } else {
        // 전체 초기화
        if (maskRawLeft) mrawCtxLeft.clearRect(0,0,maskRawLeft.width, maskRawLeft.height);
        if (maskRawRight) mrawCtxRight.clearRect(0,0,maskRawRight.width, maskRawRight.height);
      }

      renderStep2();
    }

    clearMaskBtn?.addEventListener('click', function(){
      clearFaceMask(paintingSide);
    });

    nextFromStep2?.addEventListener('click', function(){
      currentStep = 3;
      maxStepReached = Math.max(maxStepReached, 3);
      updateSteps();
    });

    finalizeStep2Btn?.addEventListener('click', function(){
      currentStep=3;
      maxStepReached=Math.max(maxStepReached,3);
      updateSteps();
    });

    gotoStep4Btn?.addEventListener('click', function(){
      currentStep=4;
      maxStepReached=Math.max(maxStepReached,4);
      updateSteps();
    });

    gotoStep5Btn?.addEventListener('click', function(){
      currentStep=5;
      maxStepReached=Math.max(maxStepReached,5);
      updateSteps();
    });

    liquifyFeather?.addEventListener('input', function(){
      reapplyLiquify();
      renderStep2();
    });

    liquifySaturation?.addEventListener('input', function(){
      reapplyLiquify();
      renderStep2();
    });

    liquifyOpacity?.addEventListener('input', function(){
      reapplyLiquify();
      renderStep2();
    });

    confirmMaskBtn?.addEventListener('click', function(){
      console.log('=== 영역 확정 버튼 클릭 ===');

      if (!paintingSide){
        alert('왼쪽 또는 오른쪽 칠하기를 먼저 선택해주세요.');
        return;
      }

      var side = paintingSide;
      var maskCanvas = (side === 'left') ? maskRawLeft : maskRawRight;

      if (!maskCanvas) {
        alert('영역을 칠해주세요.');
        return;
      }

      ensureMaskRaw(side);
      var bbox = computeBBoxFromMaskRaw(maskCanvas);

      if (!bbox){
        alert('영역을 칠해주세요.');
        return;
      }

      console.log('처리 중인 영역:', side);

      // 영역 이미지 추출
      var temp = document.createElement('canvas');
      temp.width=bbox.w;
      temp.height=bbox.h;
      var t=temp.getContext('2d');
      t.drawImage((faceBaseCanvas||faceCanvas), bbox.minX, bbox.minY, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

      // 마스크 추출
      var mCanvas = document.createElement('canvas');
      mCanvas.width=bbox.w;
      mCanvas.height=bbox.h;
      var mctx=mCanvas.getContext('2d');
      var ctx = maskCanvas.getContext('2d');
      var maskSub = ctx.getImageData(bbox.minX, bbox.minY, bbox.w, bbox.h);
      mctx.putImageData(maskSub,0,0);

      // 영역 저장
      faceRegions[side] = { canvas: temp, bbox:[bbox.minX, bbox.minY, bbox.w, bbox.h] };
      faceMasks[side] = { maskCanvas: mCanvas, bbox:[bbox.minX, bbox.minY] };
      selectionLocked[side] = true;

      console.log('영역 저장 완료');
      console.log('- faceRegions['+side+']:', faceRegions[side]);
      console.log('- selectionLocked['+side+']:', selectionLocked[side]);

      // 해당 영역 마스크만 초기화
      ctx.clearRect(0,0,maskCanvas.width, maskCanvas.height);

      // 페인팅 모드 유지 (사용자가 계속 작업할 수 있도록)
      paintStatus.textContent = side.toUpperCase() + ' 확정됨 (점선 표시) - 계속 작업 가능';

      // 효과 재적용
      if (typeof reapplyLiquify==='function') reapplyLiquify();

      // 버튼 업데이트
      console.log('updateNextFromStep2() 호출');
      updateNextFromStep2();

      gotoStep4Btn && (gotoStep4Btn.style.display='inline-block');
      gotoStep5Btn && (gotoStep5Btn.style.display='inline-block');

      renderStep2();

      console.log('=== 영역 확정 완료 ===');
    });
  });
})();