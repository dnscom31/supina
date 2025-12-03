// 4단계: 좌/우 눈썹 업로드 & 마스킹 (디자인 모드 전용)
// - 사진 모드는 사용하지 않음
// - 업로드 직후에는 원본 이미지만 보임
// - 사용자가 마스크 캔버스에 드래그로 영역을 칠한 뒤 [확인]을 눌렀을 때만
//   선택 영역 안에서 그레이 + 하이패스 + 이진화 + morphology 로 눈썹 선을 추출

(function () {
  window.addEventListener("DOMContentLoaded", function () {
    selectDom();

    // --------------------------------
    // 1) 업로드 처리 (초기 버전과 거의 동일)
    // --------------------------------
    function handleBrowUpload(side, file) {
      var img = new Image();
      img.onload = function () {
        var maxSide = 400;
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);

        var canvas =
          side === "left" ? browCanvasLeft : browCanvasRight;
        var ctx = side === "left" ? browCtxLeft : browCtxRight;
        var maskCanvasEl =
          side === "left" ? browMaskCanvasLeft : browMaskCanvasRight;
        var maskCtxEl =
          side === "left" ? browMaskCtxLeft : browMaskCtxRight;

        canvas.width = w;
        canvas.height = h;
        maskCanvasEl.width = w;
        maskCanvasEl.height = h;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        maskCtxEl.clearRect(0, 0, w, h);

        browImages[side] = img;
        newBrows[side] = null;

        // 디자인 모드: 업로드 직후에는 자동 추출을 하지 않는다.
        // 사용자가 영역을 칠하고 [확인] 버튼을 눌렀을 때만 처리.
        // processBrowImage(side);
      };
      img.src = URL.createObjectURL(file);
    }

    // ----------------------------------------------------------
    // 2) 디자인용 추출 파이프라인
    //    (그레이 + 하이패스 + 이진화 + 가벼운 morphology)
    //    - OpenCV 없이 Canvas 2D 만 사용
    // ----------------------------------------------------------
    function extractDesignBrowFromCanvas(srcCanvas) {
      var w = srcCanvas.width;
      var h = srcCanvas.height;
      if (!w || !h) return srcCanvas;

      var srcCtx = srcCanvas.getContext("2d");
      var srcData = srcCtx.getImageData(0, 0, w, h);
      var pix = srcData.data;
      var N = w * h;

      // 1) 그레이스케일
      var gray = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        var r = pix[i * 4];
        var g = pix[i * 4 + 1];
        var b = pix[i * 4 + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      // 2) 간단 블러(3x3 박스 블러) -> highpass = gray - blur
      var blur = new Float32Array(N);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var sum = 0;
          var cnt = 0;
          for (var yy = -1; yy <= 1; yy++) {
            for (var xx = -1; xx <= 1; xx++) {
              var nx = x + xx;
              var ny = y + yy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              sum += gray[ny * w + nx];
              cnt++;
            }
          }
          blur[y * w + x] = sum / (cnt || 1);
        }
      }

      var hp = new Float32Array(N);
      var minV = 1e9;
      var maxV = -1e9;
      for (var j = 0; j < N; j++) {
        var v = gray[j] - blur[j];
        hp[j] = v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      if (maxV <= minV) maxV = minV + 1;

      // 3) 0~255로 정규화
      var norm = new Uint8ClampedArray(N);
      for (var k = 0; k < N; k++) {
        var nv = ((hp[k] - minV) * 255) / (maxV - minV);
        if (nv < 0) nv = 0;
        if (nv > 255) nv = 255;
        norm[k] = nv;
      }

      // 4) 간단 임계값 (조정 가능)
      //    디자인 이미지는 배경이 연하고 선이 조금 더 어두운 구조라
      //    중간 값(예: 140)을 기준으로 선만 남긴다.
      var T = 140;
      var mask = new Uint8ClampedArray(N);
      for (var m = 0; m < N; m++) {
        mask[m] = norm[m] > T ? 255 : 0;
      }

      // 5) morphology: 3x3 open(노이즈 제거) + 1회 dilate(선 살짝 굵게)
      function erode(srcArr, dstArr) {
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var allOn = 255;
            for (var yy = -1; yy <= 1; yy++) {
              for (var xx = -1; xx <= 1; xx++) {
                var nx = x + xx;
                var ny = y + yy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
                  allOn = 0;
                  continue;
                }
                if (srcArr[ny * w + nx] === 0) {
                  allOn = 0;
                }
              }
            }
            dstArr[y * w + x] = allOn;
          }
        }
      }

      function dilate(srcArr, dstArr) {
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var anyOn = 0;
            for (var yy = -1; yy <= 1; yy++) {
              for (var xx = -1; xx <= 1; xx++) {
                var nx = x + xx;
                var ny = y + yy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                if (srcArr[ny * w + nx] > 0) {
                  anyOn = 255;
                }
              }
            }
            dstArr[y * w + x] = anyOn;
          }
        }
      }

      var tmp = new Uint8ClampedArray(N);
      erode(mask, tmp);      // 노이즈 제거
      dilate(tmp, mask);     // 복원
      dilate(mask, tmp);     // 선 조금 더 두껍게
      mask = tmp;

      // 6) 결과 캔버스: 원본 색 + mask를 알파로 사용
      var outCanvas = document.createElement("canvas");
      outCanvas.width = w;
      outCanvas.height = h;
      var outCtx = outCanvas.getContext("2d");
      var outData = outCtx.createImageData(w, h);
      var outPix = outData.data;

      for (var n = 0; n < N; n++) {
        var a = mask[n];
        if (a > 0) {
          outPix[n * 4] = pix[n * 4];
          outPix[n * 4 + 1] = pix[n * 4 + 1];
          outPix[n * 4 + 2] = pix[n * 4 + 2];
          outPix[n * 4 + 3] = a;
        } else {
          outPix[n * 4] = 0;
          outPix[n * 4 + 1] = 0;
          outPix[n * 4 + 2] = 0;
          outPix[n * 4 + 3] = 0;
        }
      }

      outCtx.putImageData(outData, 0, 0);
      return outCanvas;
    }

    // --------------------------------
    // 3) 마스크 드로잉 (기본 코드와 동일 패턴)
    // --------------------------------
    function startBrowDraw(side, e) {
      if (!browImages[side]) return;
      browMaskDrawing[side] = true;

      var maskCanvasEl =
        side === "left" ? browMaskCanvasLeft : browMaskCanvasRight;
      var pos = getCanvasPos(maskCanvasEl, e);
      browLastPos[side].x = pos.x;
      browLastPos[side].y = pos.y;

      var maskCtxEl =
        side === "left" ? browMaskCtxLeft : browMaskCtxRight;
      var brushInput = side === "left" ? browBrushLeft : browBrushRight;

      maskCtxEl.lineCap = "round";
      maskCtxEl.lineJoin = "round";
      maskCtxEl.lineWidth = parseInt(brushInput.value, 10) || 10;
      maskCtxEl.strokeStyle = "rgba(0,128,0,0.9)";
      maskCtxEl.beginPath();
      maskCtxEl.moveTo(pos.x, pos.y);
    }

    function drawBrow(side, e) {
      if (!browMaskDrawing[side]) return;
      var maskCanvasEl =
        side === "left" ? browMaskCanvasLeft : browMaskCanvasRight;
      var maskCtxEl =
        side === "left" ? browMaskCtxLeft : browMaskCtxRight;
      var pos = getCanvasPos(maskCanvasEl, e);
      maskCtxEl.lineTo(pos.x, pos.y);
      maskCtxEl.stroke();
    }

    function endBrowDraw(side) {
      if (!browMaskDrawing[side]) return;
      browMaskDrawing[side] = false;
      var maskCtxEl =
        side === "left" ? browMaskCtxLeft : browMaskCtxRight;
      maskCtxEl.closePath();
    }

    function clearBrowMask(side) {
      var maskCanvasEl =
        side === "left" ? browMaskCanvasLeft : browMaskCanvasRight;
      var maskCtxEl =
        side === "left" ? browMaskCtxLeft : browMaskCtxRight;
      if (!browImages[side]) return;
      maskCtxEl.clearRect(0, 0, maskCanvasEl.width, maskCanvasEl.height);
    }

    // -------------------------------------------------
    // 4) [확인] 버튼: step2 방식의 bbox + 디자인 파이프라인
    // -------------------------------------------------
    function confirmBrowMask(side) {
      if (!browImages[side]) {
        alert("먼저 새 눈썹 이미지를 업로드하세요.");
        return;
      }

      var maskCanvasEl =
        side === "left" ? browMaskCanvasLeft : browMaskCanvasRight;
      var maskCtxEl =
        side === "left" ? browMaskCtxLeft : browMaskCtxRight;
      var canvasEl = side === "left" ? browCanvasLeft : browCanvasRight;

      var w = maskCanvasEl.width;
      var h = maskCanvasEl.height;

      var imgData = maskCtxEl.getImageData(0, 0, w, h);
      var data = imgData.data;

      var minX = w,
        minY = h,
        maxX = 0,
        maxY = 0,
        found = false;

      // 사용자가 칠한 alpha 기준 bounding box 계산
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idxA = (y * w + x) * 4 + 3;
          if (data[idxA] > 0) {
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!found) {
        alert("영역을 칠해주세요.");
        return;
      }

      var boxW = maxX - minX + 1;
      var boxH = maxY - minY + 1;

      // 선택 영역만 잘라낸 임시 캔버스
      var temp = document.createElement("canvas");
      temp.width = boxW;
      temp.height = boxH;
      var t = temp.getContext("2d");
      t.drawImage(canvasEl, minX, minY, boxW, boxH, 0, 0, boxW, boxH);

      // 디자인 모드 파이프라인 적용
      var processedCanvas = extractDesignBrowFromCanvas(temp) || temp;

      // 결과 저장 (bbox는 로컬 좌표)
      newBrows[side] = { canvas: processedCanvas, bbox: [0, 0, boxW, boxH] };

      // 마스크는 지우고, 선택 영역을 점선 박스로 표시
      maskCtxEl.clearRect(0, 0, w, h);
      maskCtxEl.save();
      maskCtxEl.setLineDash([8, 6]);
      maskCtxEl.lineWidth = 2;
      maskCtxEl.strokeStyle = "rgba(255,255,255,0.9)";
      maskCtxEl.strokeRect(minX, minY, boxW, boxH);
      maskCtxEl.restore();

      browConfirmed[side] = true;
      autoFitSide(side);
      updateStep3Navigation();
    }

    // --------------------------------
    // 5) 위치/배율 자동 맞춤 + 네비게이션
    // --------------------------------
    function autoFitSide(side) {
      var region = faceRegions[side];
      var browObj = newBrows[side];
      if (!region || !browObj) return;

      var fw = region.bbox[2];
      var bw = browObj.bbox[2];

      baseScale[side] = Math.max(0.05, (fw / bw) * 0.9);

      var scaleSlider = side === "left" ? leftScale : rightScale;
      var rotSlider = side === "left" ? leftRot : rightRot;
      var alphaSlider = side === "left" ? leftAlpha : rightAlpha;

      scaleSlider.value = "1";
      rotSlider.value = "0";
      alphaSlider.value = "1";
      nudgeOffsets[side].x = 0;
      nudgeOffsets[side].y = 0;
    }

    // 사진 모드용 함수들은 디자인 모드에서는 사용하지 않으므로
    // 혹시 다른 코드에서 호출해도 문제 없도록 no-op 으로 둔다.
    function autoCropBrow(side) {
      return;
    }

    function processBrowImage(side) {
      return;
    }

    function updateStep3Navigation() {
      var both = browConfirmed.left && browConfirmed.right;
      if (both) {
        nextFromStep3.style.display = "block";
      } else {
        nextFromStep3.style.display = "none";
      }
    }

    nextFromStep3?.addEventListener("click", function () {
      if (browConfirmed.left && browConfirmed.right) {
        currentStep = 5;
        maxStepReached = Math.max(maxStepReached, 5);
        updateSteps();
        updateResult();
      } else {
        alert("왼쪽과 오른쪽 눈썹 모두에서 [확인]을 눌러주세요.");
      }
    });

    // 업로드 이벤트
    browInputLeft?.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      handleBrowUpload("left", f);
    });

    browInputRight?.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      handleBrowUpload("right", f);
    });

    // 마스크 드로잉 이벤트
    browMaskCanvasLeft?.addEventListener("pointerdown", function (e) {
      startBrowDraw("left", e);
    });
    browMaskCanvasLeft?.addEventListener("pointermove", function (e) {
      drawBrow("left", e);
    });
    window.addEventListener("pointerup", function () {
      endBrowDraw("left");
    });
    clearBrowMaskLeft?.addEventListener("click", function () {
      clearBrowMask("left");
    });
    confirmBrowMaskLeft?.addEventListener("click", function () {
      confirmBrowMask("left");
    });

    browMaskCanvasRight?.addEventListener("pointerdown", function (e) {
      startBrowDraw("right", e);
    });
    browMaskCanvasRight?.addEventListener("pointermove", function (e) {
      drawBrow("right", e);
    });
    window.addEventListener("pointerup", function () {
      endBrowDraw("right");
    });
    clearBrowMaskRight?.addEventListener("click", function () {
      clearBrowMask("right");
    });
    confirmBrowMaskRight?.addEventListener("click", function () {
      confirmBrowMask("right");
    });
  });
})();
