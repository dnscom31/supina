// 2단계: 눈썹 영역 페인팅/확인 (줌/이동, 고정 그리드, 자동선택 제거)
(function(){
  // MediaPipe/TensorFlow.js 기반으로 얼굴 랜드마크를 사용해 눈썹 영역을 자동 감지하는 함수
  async function autoDetectBrowRegion(side) {
    try {
      if (!faceImage || !faceCanvas || !faceW || !faceH) return false;
      // MediaPipe / TensorFlow.js가 로드되어 있는지 확인
      if (!window.faceLandmarksDetection && !window.facemesh) return false;

      // 모델 로드 (전역에 캐시)
      if (!window._browSegmentationModel) {
        if (window.faceLandmarksDetection) {
          window._browSegmentationModel = await faceLandmarksDetection.load(
            faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
            { maxFaces: 1, shouldLoadIrisModel: false }
          );
        } else if (window.facemesh) {
          window._browSegmentationModel = await facemesh.load({ maxFaces: 1 });
        }
      }
      var model = window._browSegmentationModel;
      // 얼굴 랜드마크 예측
      var preds;
      if (model.estimateFaces) {
        preds = await model.estimateFaces({ input: faceCanvas, returnTensors: false, flipHorizontal: false, predictIrises: false });
      } else if (model.estimateFacesAsync) {
        preds = await model.estimateFacesAsync(faceCanvas);
      }
      if (!preds || preds.length === 0) return false;
      var face = preds[0];
      var points = face.scaledMesh || face.mesh;
      if (!points) return false;

      // 눈썹 인덱스 배열 정의 (468포인트 기준)
      var LEFT_EYEBROW  = [336,296,334,293,300,276,283,282,295,285];
      var RIGHT_EYEBROW = [70,63,105,66,107,55,65,52,53,46];
      var targetIdx = (side === 'left') ? LEFT_EYEBROW : RIGHT_EYEBROW;
      // 좌표 리스트 얻기
      var coords = [];
      for (var i = 0; i < targetIdx.length; i++) {
        var p = points[targetIdx[i]];
        if (p) coords.push({x: p[0], y: p[1]});
      }
      if (coords.length === 0) return false;
      // 최소/최대 계산
      var minX = coords.reduce((m, p) => Math.min(m, p.x), Infinity);
      var minY = coords.reduce((m, p) => Math.min(m, p.y), Infinity);
      var maxX = coords.reduce((m, p) => Math.max(m, p.x), -Infinity);
      var maxY = coords.reduce((m, p) => Math.max(m, p.y), -Infinity);
      var bw = Math.ceil(maxX - minX);
      var bh = Math.ceil(maxY - minY);
      if (bw <= 0 || bh <= 0) return false;

      // 영역 이미지 캔버스 생성
      var regionCanvas = document.createElement('canvas');
      regionCanvas.width = bw;
      regionCanvas.height = bh;
      var rctx = regionCanvas.getContext('2d');
      // 원본 얼굴에서 잘라내기
      rctx.drawImage(faceBaseCanvas || faceImage, minX, minY, bw, bh, 0, 0, bw, bh);

      // 마스크 캔버스 생성
      var mCanvas = document.createElement('canvas');
      mCanvas.width = bw;
      mCanvas.height = bh;
      var mctx = mCanvas.getContext('2d');
      mctx.fillStyle = 'black';
      mctx.fillRect(0, 0, bw, bh);
      mctx.fillStyle = 'white';
      mctx.beginPath();
      mctx.moveTo(coords[0].x - minX, coords[0].y - minY);
      for (var j = 1; j < coords.length; j++) {
        mctx.lineTo(coords[j].x - minX, coords[j].y - minY);
      }
      mctx.closePath();
      mctx.fill();

      // 전역 상태에 저장
      faceRegions[side] = { canvas: regionCanvas, bbox: [minX, minY, bw, bh] };
      faceMasks[side]   = { maskCanvas: mCanvas, bbox: [minX, minY] };
      selectionLocked[side] = true;

      // 마스크 원본 초기화 (마우스로 그린 내용 제거)
      if (side === 'left' && maskRawLeft) {
        mrawCtxLeft.clearRect(0, 0, maskRawLeft.width, maskRawLeft.height);
      }
      if (side === 'right' && maskRawRight) {
        mrawCtxRight.clearRect(0, 0, maskRawRight.width, maskRawRight.height);
      }

      // liquify 효과 재적용
      if (typeof reapplyLiquify === 'function') reapplyLiquify();
      return true;
    } catch (e) {
      console.warn('autoDetectBrowRegion 오류:', e);
      return false;
    }
  }
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

    confirmMaskBtn?.addEventListener('click', async function(){
      console.log('=== 영역 확정 버튼 클릭 ===');
      if (!paintingSide){
        alert('왼쪽 또는 오른쪽 칠하기를 먼저 선택해주세요.');
        return;
      }
      var side = paintingSide;
      var maskCanvas = (side === 'left') ? maskRawLeft : maskRawRight;
      var bbox = null;
      if (maskCanvas) {
        ensureMaskRaw(side);
        bbox = computeBBoxFromMaskRaw(maskCanvas);
      }
      // 사용자가 칠한 영역이 없는 경우: 자동 감지 시도
      if (!bbox || !maskCanvas) {
        var detected = false;
        try {
          detected = await autoDetectBrowRegion(side);
        } catch (e) {
          console.warn('autoDetectBrowRegion 실패:', e);
        }
        if (detected) {
          paintStatus.textContent = side.toUpperCase() + ' 자동 감지 완료 (점선 표시) - 계속 작업 가능';
          // UI 업데이트 및 렌더링
          updateNextFromStep2();
          gotoStep4Btn && (gotoStep4Btn.style.display='inline-block');
          gotoStep5Btn && (gotoStep5Btn.style.display='inline-block');
          renderStep2();
          console.log('=== 자동 감지 완료 ===');
          return;
        } else {
          alert('영역을 칠해주세요.');
          return;
        }
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
      // 해당 영역 마스크만 초기화
      ctx.clearRect(0,0,maskCanvas.width, maskCanvas.height);
      // 페인팅 모드 유지
      paintStatus.textContent = side.toUpperCase() + ' 확정됨 (점선 표시) - 계속 작업 가능';
      // liquify 효과 재적용
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
