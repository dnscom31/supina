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

    var retouchToolSel       = document.getElementById('retouchTool');
    var retouchSizeInput     = document.getElementById('retouchSize');
    var retouchStrengthInput = document.getElementById('retouchStrength');
    // HTML에 "보정 활성화" 체크박스가 있다면 id="retouchEnable" 로 맞춰주세요.
    var retouchEnable        = document.getElementById('retouchEnable');

    var downloadBtn  = document.getElementById('downloadResult');
    var inpaintBtn   = document.getElementById('inpaintResult');
    var resetAppBtn  = document.getElementById('resetApp');

    // 전역 상태 방어적 기본값
    if (typeof baseScale === 'undefined')      window.baseScale = { left: 1, right: 1 };
    if (typeof nudgeOffsets === 'undefined')   window.nudgeOffsets = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    if (typeof defaultBrows === 'undefined')   window.defaultBrows = { left: null, right: null };
    if (typeof newBrows === 'undefined')       window.newBrows = { left: null, right: null };
    if (typeof faceRegions === 'undefined')    window.faceRegions = { left: null, right: null };
    if (typeof useDefaultBrow === 'undefined') window.useDefaultBrow = false;
    if (typeof currentDefaultStyle === 'undefined') window.currentDefaultStyle = null;

    var hideUploadedBrow = false;

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

      var base = (typeof faceBaseCanvas !== 'undefined' && faceBaseCanvas) ? faceBaseCanvas : faceCanvas;
      if (base) sctx.drawImage(base, 0, 0);

      if (useDefaultBrow && currentDefaultStyle && defaultBrows.left && defaultBrows.right) {
        drawBrowOn(sctx, defaultBrows.left, 'left');
        drawBrowOn(sctx, defaultBrows.right, 'right');
      }

      if (!hideUploadedBrow && newBrows) {
        if (newBrows.left)  drawBrowOn(sctx, newBrows.left, 'left');
        if (newBrows.right) drawBrowOn(sctx, newBrows.right, 'right');
      }

      if (!retouchLayer) {
        retouchLayer = document.createElement('canvas');
        retouchLayer.width = faceW;
        retouchLayer.height = faceH;
        retouchLayerCtx = retouchLayer.getContext('2d');
      }

      return retouchSnapshot;
    }

    // 리터치(블러/복제) 실제 적용
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
        retouchLayerCtx.globalAlpha = Math.max(0.1, Math.min(1, retouchState.strength));
        retouchLayerCtx.drawImage(retouchSnapshot, sx, sy, w, h, dx, dy, w, h);
        retouchLayerCtx.restore();
      } else {
        // 블러 브러시: 강하게(0~1000 느낌) 블러 패치 덮어쓰기
        var sx2 = Math.round(ix - r);
        var sy2 = Math.round(iy - r);
        var w2 = Math.round(r * 2);
        var h2 = Math.round(r * 2);

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

      // 기본 눈썹: 좌우 모두, hideUploaded 여부와 무관하게 그림
      if (useDefaultBrow && currentDefaultStyle && defaultBrows.left && defaultBrows.right) {
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

    // 줌(마우스 휠)
    rc.addEventListener('wheel', function (e) {
      if (!faceW || !faceH) return;
      e.preventDefault();

      var rect = rc.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;

      var cw = rc.width;
      var ch = rc.height;
      var baseFit = 0.95 * Math.min(cw / faceW, ch / faceH);
      var prevS = view.zoom * baseFit;

      var factor = Math.exp(-e.deltaY * 0.0015);
      var newZoom = Math.min(view.max, Math.max(view.min, view.zoom * factor));
      if (newZoom === view.zoom) return;

      var dx = (cw - prevS * faceW) / 2 + view.ox;
      var dy = (ch - prevS * faceH) / 2 + view.oy;
      var wx = (mx - dx) / prevS;
      var wy = (my - dy) / prevS;

      view.zoom = newZoom;
      var newS = view.zoom * baseFit;
      var ndx = (cw - newS * faceW) / 2 + view.ox;
      var ndy = (ch - newS * faceH) / 2 + view.oy;

      view.ox += (mx - (ndx + wx * newS));
      view.oy += (my - (ndy + wy * newS));

      _updateResult();
    }, { passive: false });

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

        var rect = rc.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var imgPos = screenToImage(mx, my);

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
        var rect = rc.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var imgPos = screenToImage(mx, my);
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

    // 다운로드
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (!rc || typeof saveCanvasAsJpg !== 'function') return;
        saveCanvasAsJpg(rc, 'result.jpg');
      });
    }

    // 인페인팅(서버 연동 자리)
    if (inpaintBtn) {
      inpaintBtn.addEventListener('click', function () {
        alert('인페인팅은 현재 데모 범위 밖입니다. (서버 연동 시 실제 오점 제거 알고리즘을 연결하세요.)');
      });
    }

    // 초기화: 로그인 유지 + 전체 상태 리셋(F5 느낌)
    if (resetAppBtn) {
      resetAppBtn.addEventListener('click', function () {
        // 로그인 정보는 auth.js(예: localStorage)에 맡기고 페이지 전체 새로고침
        window.location.reload();
      });
    }

    // 최초 렌더
    _updateResult();
  });
})();
