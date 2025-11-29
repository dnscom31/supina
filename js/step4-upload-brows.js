// 4단계: 좌/우 눈썹 업로드 & 마스킹
    function handleBrowUpload(side, file){
      var img = new Image();
      img.onload = function(){

        // ✅ 화면 폭 기준으로 최대 캔버스 크기 결정 (모바일 최적화)
        var viewportW = Math.max(
          document.documentElement.clientWidth || 0,
          window.innerWidth || 0
        );

        // 화면 폭의 90%를 쓰되, 너무 크거나 작지 않도록 320~480 사이로 제한
        var maxSide = Math.min(480, Math.max(320, Math.round(viewportW * 0.9)));

        // 원본보다 크게 키우지는 않음
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale),
            h = Math.round(img.height * scale);


        var canvas      = (side === 'left' ? browCanvasLeft     : browCanvasRight);
        var ctx         = (side === 'left' ? browCtxLeft        : browCtxRight);
        var maskCanvasEl= (side === 'left' ? browMaskCanvasLeft : browMaskCanvasRight);
        var maskCtxEl   = (side === 'left' ? browMaskCtxLeft    : browMaskCtxRight);

        canvas.width = maskCanvasEl.width = w;
        canvas.height = maskCanvasEl.height = h;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        maskCtxEl.clearRect(0, 0, w, h);

        browImages[side] = img;
        newBrows[side] = null;
        processBrowImage(side);
      };
      img.src = URL.createObjectURL(file);
    }

        // ✅ 손으로 그린 눈썹에서 "한 올 한 올"을 추출하는 마스크 생성 함수
    function buildHairMask(srcMat, w, h){
      // 1) 그레이스케일로 변환
      var gray = new cv.Mat();
      cv.cvtColor(srcMat, gray, cv.COLOR_RGB2GRAY);

      // 2) 대비 향상 (히스토그램 평활화)
      var contrast = new cv.Mat();
      if (cv.equalizeHist) {
        cv.equalizeHist(gray, contrast);
      } else {
        gray.copyTo(contrast);
      }

      // 3) 노이즈 제거 + 선 유지 (bilateral 이 있으면 우선 사용)
      var smooth = new cv.Mat();
      if (cv.bilateralFilter) {
        // d=7, sigmaColor/Space는 손으로 그린 선 기준으로 적당한 값
        cv.bilateralFilter(contrast, smooth, 7, 50, 50, cv.BORDER_DEFAULT);
      } else {
        cv.GaussianBlur(contrast, smooth, new cv.Size(3,3), 0, 0, cv.BORDER_DEFAULT);
      }

      // 4) 어두운 얇은 선만 강조 (블랙햇 변환)
      var kernelSize = 9; // 이전 15보다 작게 – 털 굵기 정도만 잡도록
      var kernel = cv.getStructuringElement(
        cv.MORPH_ELLIPSE,
        new cv.Size(kernelSize, kernelSize)
      );

      var blackhat = new cv.Mat();
      cv.morphologyEx(smooth, blackhat, cv.MORPH_BLACKHAT, kernel);

      // 5) 이진화 (Otsu)로 기본 털 영역 마스크 생성
      var maskBH = new cv.Mat();
      cv.threshold(blackhat, maskBH, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

      // 6) Canny 엣지와 교차시켜 한 올씩 살리기
      var finalMask = new cv.Mat();
      if (cv.Canny) {
        var edges = new cv.Mat();
        cv.Canny(smooth, edges, 30, 80, 3, false); // 얇은 선만 추출
        cv.bitwise_and(maskBH, edges, finalMask);  // 블랙햇 영역과 교집합
        edges.delete();
      } else {
        // Canny가 없으면 블랙햇 마스크만 사용
        maskBH.copyTo(finalMask);
      }

      // 7) 작은 노이즈 제거 + 선을 살짝 두껍게
      var smallKernel = new cv.getStructuringElement(
        cv.MORPH_ELLIPSE,
        new cv.Size(3,3)
      );
      cv.morphologyEx(finalMask, finalMask, cv.MORPH_OPEN, smallKernel);
      cv.dilate(finalMask, finalMask, smallKernel);

      // 메모리 정리
      gray.delete();
      contrast.delete();
      smooth.delete();
      kernel.delete();
      blackhat.delete();
      maskBH.delete();
      smallKernel.delete();

      return finalMask; // CV_8UC1 마스크 (한 올 한 올이 살아 있음)
    }


    function startBrowDraw(side, e){
      if (!browImages[side]) return;

      browMaskDrawing[side] = true;

      var maskCanvasEl = (side === 'left' ? browMaskCanvasLeft : browMaskCanvasRight);
      var pos = getCanvasPos(maskCanvasEl, e);

      browLastPos[side].x = pos.x;
      browLastPos[side].y = pos.y;

      var maskCtxEl = (side === 'left' ? browMaskCtxLeft : browMaskCtxRight);
      var brushInput = (side === 'left' ? browBrushLeft : browBrushRight);

      maskCtxEl.lineCap = 'round';
      maskCtxEl.lineJoin = 'round';
      maskCtxEl.lineWidth = parseInt(brushInput.value);
      maskCtxEl.strokeStyle = 'rgba(0,128,0,0.9)';
      maskCtxEl.beginPath();
      maskCtxEl.moveTo(pos.x, pos.y);
    }

    function drawBrow(side, e){
      if (!browMaskDrawing[side]) return;

      var maskCanvasEl = (side === 'left' ? browMaskCanvasLeft : browMaskCanvasRight);
      var maskCtxEl    = (side === 'left' ? browMaskCtxLeft    : browMaskCtxRight);
      var pos = getCanvasPos(maskCanvasEl, e);

      maskCtxEl.lineTo(pos.x, pos.y);
      maskCtxEl.stroke();
    }

    function endBrowDraw(side){
      if (!browMaskDrawing[side]) return;
      browMaskDrawing[side] = false;

      var maskCtxEl = (side === 'left' ? browMaskCtxLeft : browMaskCtxRight);
      maskCtxEl.closePath();
    }

    function clearBrowMask(side){
      var maskCanvasEl = (side === 'left' ? browMaskCanvasLeft : browMaskCanvasRight);
      var maskCtxEl    = (side === 'left' ? browMaskCtxLeft    : browMaskCtxRight);
      if (!browImages[side]) return;
      maskCtxEl.clearRect(0, 0, maskCanvasEl.width, maskCanvasEl.height);
    }

    // ✅ 4단계: 드래그 후 [확인] 시, 선택 영역을 bounding box로 표시 + (가능하다면) GrabCut으로 정제
    function confirmBrowMask(side){
      if (!browImages[side]) {
        alert('먼저 새 눈썹 이미지를 업로드하세요.');
        return;
      }

      var maskCanvasEl = (side === 'left' ? browMaskCanvasLeft : browMaskCanvasRight);
      var maskCtxEl    = (side === 'left' ? browMaskCtxLeft    : browMaskCtxRight);
      var canvasEl     = (side === 'left' ? browCanvasLeft     : browCanvasRight);

      var w = maskCanvasEl.width,
          h = maskCanvasEl.height;

      var imgData = maskCtxEl.getImageData(0, 0, w, h),
          data    = imgData.data;

      var minX = w, minY = h, maxX = 0, maxY = 0, found = false;

      // 사용자가 칠한 영역의 bounding box 계산
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = (y * w + x) * 4 + 3; // alpha 채널
          if (data[idx] > 0) {
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!found) {
        alert('영역을 칠해주세요.');
        return;
      }

      var boxW = maxX - minX + 1;
      var boxH = maxY - minY + 1;

      // 업로드된 눈썹 캔버스에서 선택 영역만 잘라내기
      var temp = document.createElement('canvas');
      temp.width  = boxW;
      temp.height = boxH;
      var t = temp.getContext('2d');
      t.drawImage(canvasEl, minX, minY, boxW, boxH, 0, 0, boxW, boxH);

      // 마스크도 같은 영역만 잘라내기
      var maskCanvas = document.createElement('canvas');
      maskCanvas.width  = boxW;
      maskCanvas.height = boxH;
      var mCtx = maskCanvas.getContext('2d');
      var maskData = maskCtxEl.getImageData(minX, minY, boxW, boxH);
      mCtx.putImageData(maskData, 0, 0);

      // 1) GrabCut 정제 시도 (지원될 때만)
      var refinedCanvas = null;
      if (typeof refineBrowWithGrabCut === 'function') {
        refinedCanvas = refineBrowWithGrabCut(temp, maskCanvas);
      }

      var finalCanvas;

      if (refinedCanvas) {
        // GrabCut 성공: 정제된 눈썹 캔버스 사용
        finalCanvas = refinedCanvas;
      } else {
        // 2) GrabCut 불가/실패 시: 기존 방식 (destination-in) 그대로 수행
        t.globalCompositeOperation = 'destination-in';
        t.drawImage(maskCanvas, 0, 0);
        t.globalCompositeOperation = 'source-over';
        finalCanvas = temp;
      }

      // 최종 결과에서 배경 제거 (기존 로직 유지)
      ImageProc.removeBackground(finalCanvas);

      // 최종 눈썹 데이터 저장
      newBrows[side] = { canvas: finalCanvas, bbox: [0, 0, boxW, boxH] };

      // ✅ 2단계처럼 선택된 영역을 점선 박스로 표시
      // 먼저 사용자가 칠했던 마스크를 모두 지우고
      maskCtxEl.clearRect(0, 0, w, h);

      // 선택 영역을 점선 박스로 표시 (2단계 스타일)
      maskCtxEl.save();
      maskCtxEl.setLineDash([8, 6]);
      maskCtxEl.lineWidth   = 2;
      maskCtxEl.strokeStyle = 'rgba(255,255,255,0.9)';
      maskCtxEl.strokeRect(minX, minY, boxW, boxH);
      maskCtxEl.restore();

      // 상태 업데이트 및 다음 스텝 버튼 처리
      browConfirmed[side] = true;
      autoFitSide(side);
      updateStep3Navigation();
    }

    function autoFitSide(side){
      var region  = faceRegions[side];
      var browObj = newBrows[side];
      if (!region || !browObj) return;

      var fw = region.bbox[2];
      var bw = browObj.bbox[2];

      // 기준 배율만 설정
      baseScale[side] = Math.max(0.05, (fw / bw) * 0.9);

      var scaleSlider = (side === 'left' ? leftScale  : rightScale);
      var rotSlider   = (side === 'left' ? leftRot    : rightRot);
      var alphaSlider = (side === 'left' ? leftAlpha  : rightAlpha);

      // 슬라이더는 100%가 중간
      scaleSlider.value = '1';
      rotSlider.value   = '0';
      alphaSlider.value = '1';
      nudgeOffsets[side].x = 0;
      nudgeOffsets[side].y = 0;
    }

    function autoCropBrow(side){
      var canvasEl = (side === 'left' ? browCanvasLeft : browCanvasRight);
      var ctx      = (side === 'left' ? browCtxLeft    : browCtxRight);
      var w = canvasEl.width,
          h = canvasEl.height;

      if (!w || !h) return;

      var imgData = ctx.getImageData(0, 0, w, h);
      var data    = imgData.data;

      var minX = w, minY = h, maxX = 0, maxY = 0, found = false;

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = (y * w + x) * 4;
          var r = data[idx],
              g = data[idx+1],
              b = data[idx+2],
              a = data[idx+3];

          var br = (r + g + b) / 3;
          if (a > 50 && br < 240) {
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!found) return;

      var boxW = maxX - minX + 1,
          boxH = maxY - minY + 1;

      var temp = document.createElement('canvas');
      temp.width  = boxW;
      temp.height = boxH;
      var t = temp.getContext('2d');

      t.drawImage(canvasEl, minX, minY, boxW, boxH, 0, 0, boxW, boxH);
      ImageProc.removeBackground(temp);

      newBrows[side] = { canvas: temp, bbox: [0, 0, boxW, boxH] };
      autoFitSide(side);
      updateStep3Navigation();
    }

        function processBrowImage(side){
      try {
        if (typeof cv === 'undefined' || !cv.imread) {
          autoCropBrow(side);
          return;
        }

        var canvasEl = (side === 'left' ? browCanvasLeft : browCanvasRight);
        var w = canvasEl.width,
            h = canvasEl.height;

        if (!w || !h) return;

        var srcMat = cv.imread(canvasEl);

        // 원래 코드 유지: 타입이 이상하면 RGBA→RGB로 맞춰줌
        if (srcMat.type() !== cv.CV_8UC3 && srcMat.type() !== cv.CV_8UC4) {
          var tmp = new cv.Mat();
          cv.cvtColor(srcMat, tmp, cv.COLOR_RGBA2RGB);
          srcMat.delete();
          srcMat = tmp;
        }

        // ✅ 새 털 마스크 생성 (한 올 한 올)
        var mask = buildHairMask(srcMat, w, h);

        // 마스크에서 bounding box 계산
        var minX = w, minY = h, maxX = 0, maxY = 0;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var val = mask.ucharPtr(y, x)[0];
            if (val > 0) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        // 유효한 픽셀이 없으면 기존 자동 잘라내기로 fallback
        if (minX > maxX || minY > maxY) {
          srcMat.delete();
          mask.delete();
          autoCropBrow(side);
          return;
        }

        var boxW = maxX - minX + 1,
            boxH = maxY - minY + 1;

        // ROI 자르기 (원본 + 마스크)
        var srcRoi  = srcMat.roi(new cv.Rect(minX, minY, boxW, boxH));
        var maskRoi = mask.roi(new cv.Rect(minX, minY, boxW, boxH));

        // RGBA로 변환하여 알파 채널을 털 마스크로 교체
        var rgba = new cv.Mat();
        cv.cvtColor(srcRoi, rgba, cv.COLOR_RGB2RGBA);

        var rgbaVec = new cv.MatVector();
        cv.split(rgba, rgbaVec);

        // 기존 알파 채널 삭제 후, 마스크를 알파 채널로 설정
        rgbaVec.get(3).delete();
        rgbaVec.set(3, maskRoi);

        var merged = new cv.Mat();
        cv.merge(rgbaVec, merged);

        // Canvas에 출력
        var off = document.createElement('canvas');
        off.width  = boxW;
        off.height = boxH;
        cv.imshow(off, merged);

        // 기존처럼 배경 정리
        ImageProc.removeBackground(off);

        // 최종 눈썹 데이터 저장
        newBrows[side] = { canvas: off, bbox: [0, 0, boxW, boxH] };

        // 메모리 해제
        srcMat.delete();
        mask.delete();
        srcRoi.delete();
        maskRoi.delete();
        rgba.delete();
        rgbaVec.delete();
        merged.delete();

        // 위치/배율 자동 맞춤 & 다음 단계 활성화
        autoFitSide(side);
        updateStep3Navigation();
      } catch (err) {
        console.error(err);
        autoCropBrow(side);
      }
    }


    // ✅ 사용자가 그린 마스크를 seed로 해서 GrabCut으로 눈썹 영역 정제 (가능한 경우에만 사용)
    function refineBrowWithGrabCut(tempCanvas, maskCanvas){
      try {
        if (typeof cv === 'undefined' || !cv.grabCut) return null;

        var w = tempCanvas.width,
            h = tempCanvas.height;
        if (!w || !h) return null;

        // 원본 ROI 읽기
        var src = cv.imread(tempCanvas);

        // 3채널 RGB로 맞추기
        if (src.type() !== cv.CV_8UC3) {
          var tmp = new cv.Mat();
          cv.cvtColor(src, tmp, cv.COLOR_RGBA2RGB);
          src.delete();
          src = tmp;
        }

        // GrabCut용 마스크 (기본 배경)
        var mask = new cv.Mat(h, w, cv.CV_8UC1);
        mask.setTo(new cv.Scalar(cv.GC_BGD));

        var mctx = maskCanvas.getContext('2d');
        var mImg = mctx.getImageData(0, 0, w, h).data;

        // 사용자가 칠한 곳을 "전경"으로 표시
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var a = mImg[(y * w + x) * 4 + 3]; // alpha
            if (a > 0) {
              mask.ucharPtr(y, x)[0] = cv.GC_FGD; // 확실한 전경
            }
          }
        }

        var bgdModel = new cv.Mat();
        var fgdModel = new cv.Mat();
        var rect = new cv.Rect(0, 0, w, h);

        // 마스크 기반 GrabCut
        cv.grabCut(src, mask, rect, bgdModel, fgdModel, 3, cv.GC_INIT_WITH_MASK);

        // 결과를 RGBA로 만들고, 전경만 보이게 처리
        var result = new cv.Mat();
        cv.cvtColor(src, result, cv.COLOR_RGB2RGBA);

        var resData  = result.data;
        var maskData = mask.data;

        for (var yy = 0; yy < h; yy++) {
          for (var xx = 0; xx < w; xx++) {
            var m = maskData[yy * w + xx];
            var idxA = (yy * w + xx) * 4 + 3;

            // 순수 전경(1) + 전경 가능성(3)만 유지
            if (m === cv.GC_FGD || m === cv.GC_PR_FGD) {
              // alpha 유지 (기본 255)
            } else {
              resData[idxA] = 0; // 나머지는 투명 처리
            }
          }
        }

        var outCanvas = document.createElement('canvas');
        outCanvas.width  = w;
        outCanvas.height = h;
        cv.imshow(outCanvas, result);

        src.delete();
        mask.delete();
        bgdModel.delete();
        fgdModel.delete();
        result.delete();

        return outCanvas;
      } catch (e) {
        console.error(e);
        return null;
      }
    }

    function updateStep3Navigation(){
      var both = browConfirmed.left && browConfirmed.right;
      if (both) {
        nextFromStep3.style.display = 'block';
      } else {
        nextFromStep3.style.display = 'none';
      }
    }

    nextFromStep3?.addEventListener('click', function(){
      if (browConfirmed.left && browConfirmed.right){
        currentStep = 5;
        maxStepReached = Math.max(maxStepReached, 5);
        updateSteps();
        updateResult();
      } else {
        alert('왼쪽과 오른쪽 눈썹 모두에서 [확인]을 눌러주세요.');
      }
    });

    browInputLeft?.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      handleBrowUpload('left', f);
    });

    browInputRight?.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      handleBrowUpload('right', f);
    });

    browMaskCanvasLeft?.addEventListener('pointerdown', function(e){
      startBrowDraw('left', e);
    });
    browMaskCanvasLeft?.addEventListener('pointermove', function(e){
      drawBrow('left', e);
    });
    window.addEventListener('pointerup', function(){
      endBrowDraw('left');
    });
    clearBrowMaskLeft?.addEventListener('click', function(){
      clearBrowMask('left');
    });
    confirmBrowMaskLeft?.addEventListener('click', function(){
      confirmBrowMask('left');
    });

    browMaskCanvasRight?.addEventListener('pointerdown', function(e){
      startBrowDraw('right', e);
    });
    browMaskCanvasRight?.addEventListener('pointermove', function(e){
      drawBrow('right', e);
    });
    window.addEventListener('pointerup', function(){
      endBrowDraw('right');
    });
    clearBrowMaskRight?.addEventListener('click', function(){
      clearBrowMask('right');
    });
    confirmBrowMaskRight?.addEventListener('click', function(){
      confirmBrowMask('right');
    });
  });
})();
