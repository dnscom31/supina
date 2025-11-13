// 5단계: 결과 확인/조정 + 리터치
(function () {
  window.addEventListener('DOMContentLoaded', function () {
    // 공용 DOM 선택 (utils.js에서 정의된 함수)
    if (typeof selectDom === 'function') {
      selectDom();
    }

    // 결과 캔버스
    var rc = (typeof resultCanvas !== 'undefined' && resultCanvas)
      ? resultCanvas
      : document.getElementById('resultCanvas');
    if (!rc) return;
    var resultCtx = rc.getContext('2d');

    // 슬라이더/체크박스 DOM (직접 바인딩: selectDom에만 의존하지 않도록)
    var leftScale       = document.getElementById('leftScale');
    var leftRot         = document.getElementById('leftRot');
    var leftAlpha       = document.getElementById('leftAlpha');
    var leftBright      = document.getElementById('leftBright');
    var leftContrast    = document.getElementById('leftContrast');
    var leftSaturation  = document.getElementById('leftSaturation');
    var leftSharpness   = document.getElementById('leftSharpness');

    var rightScale      = document.getElementById('rightScale');
    var rightRot        = document.getElementById('rightRot');
    var rightAlpha      = document.getElementById('rightAlpha');
    var rightBright     = document.getElementById('rightBright');
    var rightContrast   = document.getElementById('rightContrast');
    var rightSaturation = document.getElementById('rightSaturation');
    var rightSharpness  = document.getElementById('rightSharpness');

    var syncTransform   = document.getElementById('syncTransform');
    var syncColor       = document.getElementById('syncColor');
    var hideUploadedChk = document.getElementById('hideUploaded');
    var hideDefaultChk  = document.getElementById('hideDefault');

    var retouchToolSel       = document.getElementById('retouchTool');
    var retouchSizeInput     = document.getElementById('retouchSize');
    var retouchStrengthInput = document.getElementById('retouchStrength');
    // HTML에 "보정 활성화" 체크박스가 있다면 id="retouchEnable" 로 맞춰주세요.
    var retouchEnable        = document.getElementById('retouchEnable');

    var downloadBtn  = document.getElementById('downloadResult');
    var inpaintBtn   = document.getElementById('inpaintResult');
    var resetAppBtn  = document.getElementById('resetApp');

    // 5단계 확대/축소 버튼 (2단계 스타일)
    var zoomInStep5    = document.getElementById('zoomInStep5');
    var zoomOutStep5   = document.getElementById('zoomOutStep5');
    var resetViewStep5 = document.getElementById('resetViewStep5');

    // 전역 상태 방어적 기본값
    if (typeof baseScale === 'undefined')      window.baseScale = { left: 1, right: 1 };
    if (typeof nudgeOffsets === 'undefined')   window.nudgeOffsets = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    if (typeof defaultBrows === 'undefined')   window.defaultBrows = { left: null, right: null };
    if (typeof newBrows === 'undefined')       window.newBrows = { left: null, right: null };
    if (typeof faceRegions === 'undefined')    window.faceRegions = { left: null, right: null };
    if (typeof useDefaultBrow === 'undefined') window.useDefaultBrow = false;
    if (typeof currentDefaultStyle === 'undefined') window.currentDefaultStyle = null;

    var hideUploadedBrow = false;
    var hideDefaultBrow = false;

    // 결과 뷰(줌/이동) 상태 - 이동은 우클릭 전용
    var view = {
      zoom: 1,
      min: 0.5,
      max: 5,
      ox: 0,
      oy: 0,
      panning: false,
      px: 0,
      py: 0
    };

    // 5단계 확대/축소 공용 함수 (2단계 zoomAt과 동일 개념)
    function zoomAtResult(factor, center) {
      if (!faceW || !faceH) return;

      var newZoom = Math.min(view.max, Math.max(view.min, view.zoom * factor));
      if (newZoom === view.zoom) return;

      var cw = rc.width;
      var ch = rc.height;
      var baseFit = 0.95 * Math.min(cw / faceW, ch / faceH);
      var prevS = view.zoom * baseFit;
      var newS  = newZoom * baseFit;

      var dx = (cw - prevS * faceW) / 2 + view.ox;
      var dy = (ch - prevS * faceH) / 2 + view.oy;

      var wx = (center.x - dx) / prevS;
      var wy = (center.y - dy) / prevS;

      view.zoom = newZoom;

      var ndx = (cw - newS * faceW) / 2 + view.ox;
      var ndy = (ch - newS * faceH) / 2 + view.oy;
      view.ox += (center.x - (ndx + wx * newS));
      view.oy += (center.y - (ndy + wy * newS));

      _updateResult();
    }

    function resetViewResult() {
      view.zoom = 1;
      view.ox = 0;
      view.oy = 0;
      _updateResult();
    }

    // 리터치 상태/레이어
    var retouchLayer = null;
    var retouchLayerCtx = null;
    var retouchSnapshot = null;
    var retouchState = {
      tool: 'blur',
      size: 24,
      strength: 0.6, // 0~1
      cloneSrc: null
    };
    var retouchPainting = false;
    var retouchHasPaint = false; // 오점 제거 브러시를 실제로 쓴 적 있는지 여부

    // 오른쪽 자동 정렬 1회 적용용 플래그
    var autoRightInitialized = false;

    // ==== 공용 함수들 ====

    // 눈썹 그리기 (얼굴 좌표계 기준)
    function drawBrowOn(ctx, browObj, side) {
      if (!browObj) return;
      var region = faceRegions[side];
      if (!region || !region.bbox) return;

      var fx = region.bbox[0],
          fy = region.bbox[1],
          fw = region.bbox[2],
          fh = region.bbox[3];

      var rotation = parseFloat(side === 'left'
        ? (leftRot?.value || 0)
        : (rightRot?.value || 0)) * Math.PI / 180;

      var uiScale = parseFloat(side === 'left'
        ? (leftScale?.value || 1)
        : (rightScale?.value || 1));
      if (isNaN(uiScale)) uiScale = 1;

      var scaleFactor = (baseScale[side] || 1) * uiScale;
      var alpha = parseFloat(side === 'left'
        ? (leftAlpha?.value || 1)
        : (rightAlpha?.value || 1));
      if (isNaN(alpha)) alpha = 1;

      var bright      = parseFloat(side === 'left' ? (leftBright?.value || 0)       : (rightBright?.value || 0));
      var contrast    = parseFloat(side === 'left' ? (leftContrast?.value || 0)     : (rightContrast?.value || 0));
      var saturation  = parseFloat(side === 'left' ? (leftSaturation?.value || 100) : (rightSaturation?.value || 100));
      var sharp       = parseFloat(side === 'left' ? (leftSharpness?.value || 0)    : (rightSharpness?.value || 0));

      var src = (typeof ImageProc !== 'undefined' && ImageProc.applyFiltersToCanvas)
        ? ImageProc.applyFiltersToCanvas(browObj.canvas, { bright, contrast, saturation, sharp })
        : browObj.canvas;

      var nudge = nudgeOffsets[side] || { x: 0, y: 0 };
      var cx = fx + fw / 2 + nudge.x;
      var cy = fy + fh / 2 + nudge.y;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.scale(scaleFactor, scaleFactor);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      ctx.restore();
    }

    // 왼쪽 값을 기준으로 오른쪽 자동 정렬(한 번만)
    function initRightFromLeft() {
      if (autoRightInitialized) return;
      if (!rightScale || !leftScale) return;

      if (leftScale && rightScale)       rightScale.value      = leftScale.value;
      if (leftRot && rightRot)           rightRot.value        = leftRot.value;
      if (leftAlpha && rightAlpha)       rightAlpha.value      = leftAlpha.value;
      if (leftBright && rightBright)     rightBright.value     = leftBright.value;
      if (leftContrast && rightContrast) rightContrast.value   = leftContrast.value;
      if (leftSaturation && rightSaturation) rightSaturation.value = leftSaturation.value;
      if (leftSharpness && rightSharpness)   rightSharpness.value  = leftSharpness.value;

      baseScale.right = baseScale.left || baseScale.right || 1;

      if (!nudgeOffsets.left)  nudgeOffsets.left  = { x: 0, y: 0 };
      if (!nudgeOffsets.right) nudgeOffsets.right = { x: 0, y: 0 };
      nudgeOffsets.right.x = -nudgeOffsets.left.x;
      nudgeOffsets.right.y =  nudgeOffsets.left.y;

      autoRightInitialized = true;
    }

    // 결과 캔버스 기준: 화면 → 얼굴 좌표
    function screenToImage(mx, my) {
      if (!faceW || !faceH) return { x: 0, y: 0 };

      var cw = rc.width;
      var ch = rc.height;
      var baseFit = 0.95 * Math.min(cw / faceW, ch / faceH);
      var s = view.zoom * baseFit;
      var dx = (cw - s * faceW) / 2 + view.ox;
      var dy = (ch - s * faceH) / 2 + view.oy;

      return {
        x: (mx - dx) / s,
        y: (my - dy) / s
      };
    }

    // 리터치용 스냅샷 구성 (현재 합성 결과를 faceW x faceH로)
    function buildCompositeSnapshot() {
      if (!faceW || !faceH || !faceImage) return null;

      if (!retouchSnapshot) {
        retouchSnapshot = document.createElement('canvas');
      }
      retouchSnapshot.width = faceW;
      retouchSnapshot.height = faceH;
      var sctx = retouchSnapshot.getContext('2d');
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, faceW, faceH);

      // 베이스 얼굴
      var base = (typeof faceBaseCanvas !== 'undefined' && faceBaseCanvas) ? faceBaseCanvas : faceCanvas;
      if (base) sctx.drawImage(base, 0, 0);

      // 기본 눈썹
      if (useDefaultBrow && currentDefaultStyle && defaultBrows.left && defaultBrows.right) {
        drawBrowOn(sctx, defaultBrows.left, 'left');
        drawBrowOn(sctx, defaultBrows.right, 'right');
      }

      // 업로드 눈썹
      if (!hideUploadedBrow && newBrows) {
        if (newBrows.left)  drawBrowOn(sctx, newBrows.left, 'left');
        if (newBrows.right) drawBrowOn(sctx, newBrows.right, 'right');
      }

      // 이미 존재하는 리터치 결과도 스냅샷에 포함
      if (retouchLayer) {
        sctx.drawImage(retouchLayer, 0, 0);
      }

      // 리터치 레이어 캔버스 생성 (없으면)
      if (!retouchLayer) {
        retouchLayer = document.createElement('canvas');
        retouchLayer.width = faceW;
        retouchLayer.height = faceH;
        retouchLayerCtx = retouchLayer.getContext('2d');
      }

      return retouchSnapshot;
    }

    // 리터치(블러/복제) 실제 적용 - 원형 브러시로 수정
    function applyRetouchAt(ix, iy) {
      if (!retouchSnapshot || !retouchLayerCtx) return;
      if (ix < 0 || iy < 0 || ix >= faceW || iy >= faceH) return;

      var tool = (retouchToolSel && retouchToolSel.value) || retouchState.tool;
      var size = retouchSizeInput
        ? (parseInt(retouchSizeInput.value, 10) || retouchState.size)
        : retouchState.size;

      var r = Math.max(4, size / 2);

      if (tool === 'clone') {
        if (!retouchState.cloneSrc) return;

        // 원형 마스크 생성
        var maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskCanvas.height = size;
        var maskCtx = maskCanvas.getContext('2d');

        // 원형 마스크
        maskCtx.beginPath();
        maskCtx.arc(r, r, r, 0, 2 * Math.PI);
        maskCtx.fillStyle = 'black';
        maskCtx.fill();

        var sx = Math.round(retouchState.cloneSrc.x - r);
        var sy = Math.round(retouchState.cloneSrc.y - r);
        var dx = Math.round(ix - r);
        var dy = Math.round(iy - r);
        var w = Math.round(r * 2);
        var h = Math.round(r * 2);

        // 경계 보정
        if (sx < 0) { dx -= sx; w += sx; sx = 0; }
        if (sy < 0) { dy -= sy; h += sy; sy = 0; }
        if (dx < 0) { sx -= dx; w += dx; dx = 0; }
        if (dy < 0) { sy -= dy; h += dy; dy = 0; }
        if (sx + w > faceW) w = faceW - sx;
        if (sy + h > faceH) h = faceH - sy;
        if (dx + w > faceW) w = faceW - dx;
        if (dy + h > faceH) h = faceH - dy;
        if (w <= 0 || h <= 0) return;

        retouchLayerCtx.save();

        // 원형 클리핑 마스크 적용
        retouchLayerCtx.globalCompositeOperation = 'destination-in';
        retouchLayerCtx.drawImage(maskCanvas, dx, dy);
        retouchLayerCtx.globalCompositeOperation = 'source-over';

        retouchLayerCtx.globalAlpha = Math.max(0.1, Math.min(1, retouchState.strength));
        retouchLayerCtx.drawImage(retouchSnapshot, sx, sy, w, h, dx, dy, w, h);
        retouchLayerCtx.restore();
      } else {
        // 블러 브러시: 원형 브러시로 수정
        var sx2 = Math.round(ix - r);
        var sy2 = Math.round(iy - r);
        var w2 = Math.round(r * 2);
        var h2 = Math.round(r * 2);

        // 원형 마스크 생성
        var blurMaskCanvas = document.createElement('canvas');
        blurMaskCanvas.width = blurMaskCanvas.height = size;
        var blurMaskCtx = blurMaskCanvas.getContext('2d');

        // 원형 그라디언트 (부드러운 엣지)
        var gradient = blurMaskCtx.createRadialGradient(r, r, 0, r, r, r);
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(0.7, 'rgba(0,0,0,0.8)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        blurMaskCtx.beginPath();
        blurMaskCtx.arc(r, r, r, 0, 2 * Math.PI);
        blurMaskCtx.fillStyle = gradient;
        blurMaskCtx.fill();

        if (sx2 < 0) { w2 += sx2; sx2 = 0; }
        if (sy2 < 0) { h2 += sy2; sy2 = 0; }
        if (sx2 + w2 > faceW) w2 = faceW - sx2;
        if (sy2 + h2 > faceH) h2 = faceH - sy2;
        if (w2 <= 0 || h2 <= 0) return;

        var srcPatch = document.createElement('canvas');
        srcPatch.width = w2;
        srcPatch.height = h2;
        var spctx = srcPatch.getContext('2d');
        spctx.drawImage(retouchSnapshot, sx2, sy2, w2, h2, 0, 0, w2, h2);

        var blurred = document.createElement('canvas');
        blurred.width = w2;
        blurred.height = h2;
        var bctx = blurred.getContext('2d');
        var blurPx = Math.max(2, Math.round(retouchState.strength * 18)); // 더 강하게
        bctx.filter = 'blur(' + blurPx + 'px)';
        bctx.drawImage(srcPatch, 0, 0);

        retouchLayerCtx.save();
        retouchLayerCtx.globalAlpha = 1.0;
        retouchLayerCtx.drawImage(blurred, sx2, sy2);
        retouchLayerCtx.restore();
      }

      retouchHasPaint = true;
      _updateResult();
    }

    // 메인 렌더
    function _updateResult() {
      if (!faceImage || !faceW || !faceH) return;

      var groupEl = rc.parentElement || rc;
      var gw = Math.max(700, groupEl.clientWidth || 700);
      var cw = Math.round(gw);
      var ch = Math.max(500, Math.round(cw * (faceH / faceW)));

      rc.width = cw;
      rc.height = ch;

      resultCtx.setTransform(1, 0, 0, 1, 0, 0);
      resultCtx.clearRect(0, 0, cw, ch);

      var baseFit = 0.95 * Math.min(cw / faceW, ch / faceH);
      var s = view.zoom * baseFit;
      var dx = Math.round((cw - s * faceW) / 2 + view.ox);
      var dy = Math.round((ch - s * faceH) / 2 + view.oy);

      resultCtx.save();
      resultCtx.setTransform(s, 0, 0, s, dx, dy);

      // 베이스 얼굴
      var base = (typeof faceBaseCanvas !== 'undefined' && faceBaseCanvas) ? faceBaseCanvas : faceCanvas;
      if (base) resultCtx.drawImage(base, 0, 0);

      // 기본 눈썹: hideDefault 체크박스 상태에 따라 표시
      if (!hideDefaultBrow && useDefaultBrow && currentDefaultStyle && defaultBrows.left && defaultBrows.right) {
        initRightFromLeft();
        drawBrowOn(resultCtx, defaultBrows.left, 'left');
        drawBrowOn(resultCtx, defaultBrows.right, 'right');
      }

      // 업로드 눈썹: 체크되었을 때만 숨김
      if (!hideUploadedBrow && newBrows) {
        if (newBrows.left)  drawBrowOn(resultCtx, newBrows.left, 'left');
        if (newBrows.right) drawBrowOn(resultCtx, newBrows.right, 'right');
      }

      // 리터치 레이어
      if (retouchLayer) {
        resultCtx.drawImage(retouchLayer, 0, 0, faceW, faceH);
      }

      resultCtx.restore();
    }

    window.updateResult = _updateResult;

    // ==== 이벤트 바인딩 ====

    // 슬라이더 변경 시 동기화 + 즉시 반영
    function onSliderInput() {
      if (syncTransform && syncTransform.checked) {
        if (leftScale && rightScale)   rightScale.value  = leftScale.value;
        if (leftRot && rightRot)       rightRot.value    = leftRot.value;
        if (leftAlpha && rightAlpha)   rightAlpha.value  = leftAlpha.value;
      }
      if (syncColor && syncColor.checked) {
        if (leftBright && rightBright)         rightBright.value     = leftBright.value;
        if (leftContrast && rightContrast)     rightContrast.value   = leftContrast.value;
        if (leftSaturation && rightSaturation) rightSaturation.value = leftSaturation.value;
        if (leftSharpness && rightSharpness)   rightSharpness.value  = leftSharpness.value;
      }
      _updateResult();
    }

    [
      leftScale, leftRot, leftAlpha,
      rightScale, rightRot, rightAlpha,
      leftBright, leftContrast, leftSaturation, leftSharpness,
      rightBright, rightContrast, rightSaturation, rightSharpness
    ].forEach(function (el) {
      if (el) el.addEventListener('input', onSliderInput);
    });

    // 위치 이동 버튼 (슬라이더 오른쪽)
    document.querySelectorAll('.adjust-section .nudge button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var spec = btn.dataset.nudge; // "left:-3,0"
        if (!spec) return;
        var parts = spec.split(':');
        var side = parts[0];
        var del = parts[1].split(',');
        if (!nudgeOffsets[side]) nudgeOffsets[side] = { x: 0, y: 0 };
        nudgeOffsets[side].x += parseInt(del[0], 10) || 0;
        nudgeOffsets[side].y += parseInt(del[1], 10) || 0;
        _updateResult();
      });
    });

    // 업로드 눈썹 숨기기 체크
    if (hideUploadedChk) {
      hideUploadedBrow = hideUploadedChk.checked;
      hideUploadedChk.addEventListener('change', function () {
        hideUploadedBrow = !!hideUploadedChk.checked;
        _updateResult();
      });
    }

    // 기본 눈썹 숨기기 체크
    if (hideDefaultChk) {
      hideDefaultBrow = hideDefaultChk.checked;
      hideDefaultChk.addEventListener('change', function () {
        hideDefaultBrow = !!hideDefaultChk.checked;
        _updateResult();
      });
    }

    // 줌(마우스 휠) - getCanvasPos를 이용해 2단계/4단계와 동일한 좌표계 사용
    rc.addEventListener('wheel', function (e) {
      if (!faceW || !faceH) return;
      e.preventDefault();

      var pos;
      if (typeof getCanvasPos === 'function') {
        pos = getCanvasPos(rc, e);
      } else {
        var rect = rc.getBoundingClientRect();
        var scaleX = rc.width  / rect.width;
        var scaleY = rc.height / rect.height;
        pos = {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top)  * scaleY
        };
      }

      var factor = Math.exp(-e.deltaY * 0.0015);
      zoomAtResult(factor, pos);
    }, { passive: false });

    // 확대/축소/리셋 버튼 (2단계와 같은 UX)
    if (zoomInStep5) {
      zoomInStep5.addEventListener('click', function () {
        var center = { x: rc.width / 2, y: rc.height / 2 };
        zoomAtResult(1.25, center);
      });
    }
    if (zoomOutStep5) {
      zoomOutStep5.addEventListener('click', function () {
        var center = { x: rc.width / 2, y: rc.height / 2 };
        zoomAtResult(1 / 1.25, center);
      });
    }
    if (resetViewStep5) {
      resetViewStep5.addEventListener('click', function () {
        resetViewResult();
      });
    }

    // 이동: 우클릭 드래그 전용
    rc.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    rc.addEventListener('pointerdown', function (e) {
      // 우클릭: 이동 시작
      if (e.button === 2) {
        view.panning = true;
        view.px = e.clientX;
        view.py = e.clientY;
        rc.setPointerCapture(e.pointerId);
        return;
      }

      // 좌클릭 + 리터치 켜짐: 보정 브러시
      if (e.button === 0 && retouchEnable && retouchEnable.checked) {
        if (!faceW || !faceH) return;
        buildCompositeSnapshot();

        // 캔버스 좌표로 변환 (CSS 스케일, DPI 보정)
        var pos;
        if (typeof getCanvasPos === 'function') {
          pos = getCanvasPos(rc, e);
        } else {
          var rect = rc.getBoundingClientRect();
          var scaleX = rc.width  / rect.width;
          var scaleY = rc.height / rect.height;
          pos = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top)  * scaleY
          };
        }
        var imgPos = screenToImage(pos.x, pos.y);

        var tool = (retouchToolSel && retouchToolSel.value) || retouchState.tool;

        // 복제 도구: Alt/Ctrl/Meta + 클릭으로 기준점 설정
        if (tool === 'clone' && (e.altKey || e.ctrlKey || e.metaKey)) {
          retouchState.cloneSrc = imgPos;
          return;
        }

        retouchPainting = true;
        applyRetouchAt(imgPos.x, imgPos.y);
        rc.setPointerCapture(e.pointerId);
      }
    });

    rc.addEventListener('pointermove', function (e) {
      if (view.panning) {
        view.ox += (e.clientX - view.px);
        view.oy += (e.clientY - view.py);
        view.px = e.clientX;
        view.py = e.clientY;
        _updateResult();
        return;
      }

      if (retouchPainting && retouchEnable && retouchEnable.checked) {
        var pos;
        if (typeof getCanvasPos === 'function') {
          pos = getCanvasPos(rc, e);
        } else {
          var rect = rc.getBoundingClientRect();
          var scaleX = rc.width  / rect.width;
          var scaleY = rc.height / rect.height;
          pos = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top)  * scaleY
          };
        }
        var imgPos = screenToImage(pos.x, pos.y);
        applyRetouchAt(imgPos.x, imgPos.y);
      }
    });

    rc.addEventListener('pointerup', function (e) {
      if (view.panning) {
        view.panning = false;
        rc.releasePointerCapture?.(e.pointerId);
      }
      if (retouchPainting) {
        retouchPainting = false;
        rc.releasePointerCapture?.(e.pointerId);
      }
    });

    rc.addEventListener('pointerleave', function () {
      view.panning = false;
      retouchPainting = false;
    });

    // 리터치 UI 동기화
    if (retouchToolSel) {
      retouchToolSel.addEventListener('change', function () {
        retouchState.tool = this.value || 'blur';
      });
    }
    if (retouchSizeInput) {
      retouchSizeInput.addEventListener('input', function () {
        var v = parseInt(this.value, 10);
        if (!isNaN(v)) retouchState.size = v;
      });
    }
    if (retouchStrengthInput) {
      retouchStrengthInput.addEventListener('input', function () {
        var v = parseInt(this.value, 10);
        if (!isNaN(v)) {
          // 10~100 슬라이더를 0.05~1.0으로 매핑
          retouchState.strength = Math.max(0.05, Math.min(1, v / 100));
        }
      });
    }

    if (retouchEnable) {
      retouchEnable.addEventListener('change', function () {
        if (retouchEnable.checked) {
          buildCompositeSnapshot();
        }
      });
    }

    // 다운로드 - 여백 제거하고 저장
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (!rc || !faceW || !faceH) return;

        // 임시 캔버스에 원본 크기로 그리기
        var tempCanvas = document.createElement('canvas');
        tempCanvas.width = faceW;
        tempCanvas.height = faceH;
        var tempCtx = tempCanvas.getContext('2d');

        // 베이스 얼굴
        var base = (typeof faceBaseCanvas !== 'undefined' && faceBaseCanvas) ? faceBaseCanvas : faceCanvas;
        if (base) tempCtx.drawImage(base, 0, 0);

        // 기본 눈썹 (체크박스 상태 반영)
        if (!hideDefaultBrow && useDefaultBrow && currentDefaultStyle && defaultBrows.left && defaultBrows.right) {
          drawBrowOn(tempCtx, defaultBrows.left, 'left');
          drawBrowOn(tempCtx, defaultBrows.right, 'right');
        }

        // 업로드 눈썹 (체크박스 상태 반영)
        if (!hideUploadedBrow && newBrows) {
          if (newBrows.left)  drawBrowOn(tempCtx, newBrows.left, 'left');
          if (newBrows.right) drawBrowOn(tempCtx, newBrows.right, 'right');
        }

        // 리터치 레이어
        if (retouchLayer) {
          tempCtx.drawImage(retouchLayer, 0, 0);
        }

        // 저장
        if (typeof saveCanvasAsJpg === 'function') {
          saveCanvasAsJpg(tempCanvas, 'result.jpg');
        }
      });
    }

    // 인페인팅 - 합성 스냅샷(기본/업로드 눈썹 + 리터치 포함)을 기준으로 마스크 영역 인페인트
    if (inpaintBtn) {
      inpaintBtn.addEventListener('click', function () {
        if (!faceW || !faceH) return;

        // 1) 현재 합성 스냅샷 (얼굴 + 기본/업로드 눈썹 + 리터치 포함)
        var snap = buildCompositeSnapshot();
        if (!snap) return;

        var sctx = snap.getContext('2d');
        var snapData = sctx.getImageData(0, 0, faceW, faceH);

        // 2) 스냅샷을 블러한 버전 (인페인트용 재료)
        var blurred = document.createElement('canvas');
        blurred.width  = faceW;
        blurred.height = faceH;
        var bctx = blurred.getContext('2d');
        bctx.filter = 'blur(4px)';  // 블러 강도는 필요시 조절 가능
        bctx.drawImage(snap, 0, 0);
        var blurData = bctx.getImageData(0, 0, faceW, faceH);

        // 3) 리터치 마스크 (있으면 그 부분만 인페인트, 없으면 전체는 그대로 사용)
        var hasMask = retouchHasPaint && retouchLayer;
        var maskData = null;
        if (hasMask) {
          var mctx = retouchLayer.getContext('2d');
          maskData = mctx.getImageData(0, 0, faceW, faceH);
        }

        // 4) 새 얼굴 베이스용 캔버스 생성
        var newBase = document.createElement('canvas');
        newBase.width  = faceW;
        newBase.height = faceH;
        var nctx = newBase.getContext('2d');

        if (hasMask && maskData) {
          var sArr = snapData.data;
          var bArr = blurData.data;
          var mArr = maskData.data;
          var out  = nctx.createImageData(faceW, faceH);
          var oArr = out.data;

          // 마스크 알파가 있는 픽셀은 blurData 사용, 아니면 snapData 사용
          for (var i = 0; i < oArr.length; i += 4) {
            var a = mArr[i + 3]; // 마스크 알파
            if (a > 0) {
              oArr[i]   = bArr[i];
              oArr[i+1] = bArr[i+1];
              oArr[i+2] = bArr[i+2];
              oArr[i+3] = bArr[i+3];
            } else {
              oArr[i]   = sArr[i];
              oArr[i+1] = sArr[i+1];
              oArr[i+2] = sArr[i+2];
              oArr[i+3] = sArr[i+3];
            }
          }
          nctx.putImageData(out, 0, 0);
        } else {
          // 리터치 마스크가 전혀 없으면, 스냅샷 그대로를 새 베이스로 사용
          nctx.drawImage(snap, 0, 0);
        }

        // 5) 새 베이스 이미지를 얼굴 베이스 캔버스들에 반영
        // faceBaseCanvas가 있으면 거기에 덮어쓰기
        if (typeof faceBaseCanvas !== 'undefined' && faceBaseCanvas) {
          var fbCtx = faceBaseCanvas.getContext('2d');
          faceBaseCanvas.width  = faceW;
          faceBaseCanvas.height = faceH;
          fbCtx.setTransform(1, 0, 0, 1, 0, 0);
          fbCtx.clearRect(0, 0, faceW, faceH);
          fbCtx.drawImage(newBase, 0, 0);
        }

        // 얼굴 원본 베이스도 새 이미지로 교체 (이후 리퀴파이 등에서 사용)
        if (typeof faceBaseOriginalCanvas !== 'undefined' && faceBaseOriginalCanvas) {
          var fboCtx = faceBaseOriginalCanvas.getContext('2d');
          faceBaseOriginalCanvas.width  = faceW;
          faceBaseOriginalCanvas.height = faceH;
          fboCtx.setTransform(1, 0, 0, 1, 0, 0);
          fboCtx.clearRect(0, 0, faceW, faceH);
          fboCtx.drawImage(newBase, 0, 0);
        }

        // faceCanvas/faceCtx가 있으면 그것도 갱신 (다른 스텝에서 볼 수 있게)
        if (typeof faceCanvas !== 'undefined' && faceCanvas &&
            typeof faceCtx !== 'undefined' && faceCtx) {
          faceCanvas.width  = faceW;
          faceCanvas.height = faceH;
          faceCtx.setTransform(1, 0, 0, 1, 0, 0);
          faceCtx.clearRect(0, 0, faceW, faceH);
          faceCtx.drawImage(newBase, 0, 0);
        }

        // 6) 리터치 레이어/플래그 정리 (이제 새 베이스에 반영되었으므로 초기화)
        if (retouchLayerCtx) {
          retouchLayerCtx.clearRect(0, 0, faceW, faceH);
        }
        retouchHasPaint = false;

        // 7) 기본/업로드 눈썹은 새 베이스에 이미 구워졌으므로,
        //    화면에서는 중복 표시가 되지 않도록 기본값으로 숨김 처리
        if (hideUploadedChk) {
          hideUploadedChk.checked = true;
        }
        if (hideDefaultChk) {
          hideDefaultChk.checked = true;
        }
        hideUploadedBrow = true;
        hideDefaultBrow  = true;
        // 필요하면 완전히 오버레이 해제
        // useDefaultBrow = false;

        _updateResult();
        alert('인페이팅으로 새로운 얼굴 이미지가 생성되었습니다.\n(현재 눈썹/오점 제거 상태가 베이스 이미지에 반영되었습니다)');
      });
    }

    // 초기화: 로그인 유지하며 앱 상태만 초기화
    if (resetAppBtn) {
      resetAppBtn.addEventListener('click', function () {
        // 전역 상태 초기화
        currentStep = 1;
        maxStepReached = 1;

        // 이미지 상태 초기화
        faceImage = null;
        faceW = 0;
        faceH = 0;
        paintingSide = null;
        faceRegions = { left: null, right: null };
        faceMasks = { left: null, right: null };
        selectionLocked = { left: false, right: false };
        browImages = { left: null, right: null };
        newBrows = { left: null, right: null };
        nudgeOffsets = { left: {x:0,y:0}, right: {x:0,y:0} };
        browConfirmed = { left: false, right: false };
        useDefaultBrow = false;
        currentDefaultStyle = null;
        hideUploadedBrow = false;
        hideDefaultBrow = false;
        retouchHasPaint = false;

        // 리터치 레이어 초기화
        if (retouchLayer) {
          retouchLayerCtx.clearRect(0, 0, retouchLayer.width, retouchLayer.height);
        }

        // 캔버스 초기화
        if (faceCanvas && faceCtx) {
          faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
        }
        if (faceMaskCanvas && faceMaskCtx) {
          faceMaskCtx.clearRect(0, 0, faceMaskCanvas.width, faceMaskCanvas.height);
        }
        if (rc && resultCtx) {
          resultCtx.clearRect(0, 0, rc.width, rc.height);
        }

        // 파일 입력 초기화
        if (faceInput) faceInput.value = '';
        if (browInputLeft) browInputLeft.value = '';
        if (browInputRight) browInputRight.value = '';

        // 체크박스 초기화
        if (hideUploadedChk) hideUploadedChk.checked = false;
        if (hideDefaultChk) hideDefaultChk.checked = false;

        // 슬라이더 초기화
        if (leftScale) leftScale.value = '1';
        if (leftRot) leftRot.value = '0';
        if (leftAlpha) leftAlpha.value = '1';
        if (rightScale) rightScale.value = '1';
        if (rightRot) rightRot.value = '0';
        if (rightAlpha) rightAlpha.value = '1';

        // 스텝 업데이트
        if (typeof updateSteps === 'function') {
          updateSteps();
        }

        alert('앱이 초기화되었습니다. 1단계부터 다시 시작하세요.');
      });
    }

    // 최초 렌더
    _updateResult();
  });
})();
