// 향상된 이미지 처리 모듈 - 정밀한 털 추출
window.ImageProc = (function() {

  // 향상된 배경 제거 - 털 한올한올 정밀 추출
  function removeBackgroundPrecise(canvas) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imgData.data;

    // 1단계: 엣지 검출로 털 경계 찾기
    var edges = detectEdges(imgData);

    // 2단계: 색상 범위 기반 털 추출
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var a = data[i + 3];

      // 밝기 계산
      var brightness = (r + g + b) / 3;

      // 검은색/갈색 털 감지 (더 정밀한 범위)
      var isDarkHair = brightness < 180 && brightness > 10;

      // 색상 채도 확인 (털은 보통 채도가 낮음)
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var saturation = (max - min) / (max + 0.1);
      var isHairColor = saturation < 0.5;

      // 엣지 강도 확인
      var edgeStrength = edges[i / 4] || 0;

      // 최종 판단: 털인지 배경인지
      if (isDarkHair && isHairColor && edgeStrength > 30) {
        // 털로 판단 - 불투명도 유지
        data[i + 3] = Math.min(255, a * 1.2); // 약간 강화
      } else if (brightness > 230) {
        // 매우 밝은 배경 - 완전 투명
        data[i + 3] = 0;
      } else if (edgeStrength < 20) {
        // 엣지가 약한 부분 - 부분 투명
        data[i + 3] = Math.max(0, a * 0.3);
      }
    }

    // 3단계: 모폴로지 연산으로 노이즈 제거
    ctx.putImageData(imgData, 0, 0);
    applyMorphology(canvas);

    return canvas;
  }

  // 엣지 검출 (Sobel 필터)
  function detectEdges(imgData) {
    var width = imgData.width;
    var height = imgData.height;
    var data = imgData.data;
    var edges = new Float32Array(width * height);

    var sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    var sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var gx = 0, gy = 0;

        for (var ky = -1; ky <= 1; ky++) {
          for (var kx = -1; kx <= 1; kx++) {
            var idx = ((y + ky) * width + (x + kx)) * 4;
            var gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            var kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += gray * sobelX[kernelIdx];
            gy += gray * sobelY[kernelIdx];
          }
        }

        edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    return edges;
  }

  // 모폴로지 연산 (열림/닫힘)
  function applyMorphology(canvas) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imgData.data;

    // 작은 구멍 채우기 (닫힘 연산)
    for (var pass = 0; pass < 2; pass++) {
      var newData = new Uint8ClampedArray(data);

      for (var y = 1; y < canvas.height - 1; y++) {
        for (var x = 1; x < canvas.width - 1; x++) {
          var idx = (y * canvas.width + x) * 4 + 3;
          var neighbors = 0;
          var count = 0;

          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              var nIdx = ((y + dy) * canvas.width + (x + dx)) * 4 + 3;
              neighbors += data[nIdx];
              count++;
            }
          }

          if (neighbors / count > 128) {
            newData[idx] = Math.min(255, data[idx] + 50);
          }
        }
      }

      data = newData;
    }

    imgData.data.set(data);
    ctx.putImageData(imgData, 0, 0);
  }

  // 스마트 털 추출 (드로잉 이미지용)
  function extractHairFromDrawing(canvas) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imgData.data;

    // 선 감지 알고리즘
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];

      // 회색조 값
      var gray = (r + g + b) / 3;

      // 검은 선 감지 (털)
      if (gray < 100) {
        // 선을 유지하되 안티앨리어싱 적용
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = Math.min(255, 255 - gray * 2);
      } else if (gray < 200) {
        // 중간 톤 - 부드러운 털 가장자리
        var alpha = (200 - gray) / 100;
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = Math.floor(alpha * 255);
      } else {
        // 밝은 배경 - 완전 투명
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // 필터 적용 함수
  function applyFiltersToCanvas(canvas, filters) {
    var temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    var tctx = temp.getContext('2d');

    // 필터 문자열 구성
    var filterStr = [];
    if (filters.bright !== 0) filterStr.push(`brightness(${100 + filters.bright}%)`);
    if (filters.contrast !== 0) filterStr.push(`contrast(${100 + filters.contrast}%)`);
    if (filters.saturation !== 100) filterStr.push(`saturate(${filters.saturation}%)`);

    tctx.filter = filterStr.join(' ');
    tctx.drawImage(canvas, 0, 0);

    // 선명도(샤프닝) 적용
    if (filters.sharp > 0) {
      applySharpen(temp, filters.sharp);
    }

    return temp;
  }

  // 샤프닝 필터
  function applySharpen(canvas, amount) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imgData.data;
    var width = canvas.width;
    var height = canvas.height;

    var kernel = [
      0, -amount, 0,
      -amount, 1 + 4 * amount, -amount,
      0, -amount, 0
    ];

    var output = new Uint8ClampedArray(data);

    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        for (var c = 0; c < 3; c++) {
          var sum = 0;
          for (var ky = -1; ky <= 1; ky++) {
            for (var kx = -1; kx <= 1; kx++) {
              var idx = ((y + ky) * width + (x + kx)) * 4 + c;
              var kernelIdx = (ky + 1) * 3 + (kx + 1);
              sum += data[idx] * kernel[kernelIdx];
            }
          }
          output[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
        }
      }
    }

    imgData.data.set(output);
    ctx.putImageData(imgData, 0, 0);
  }

  return {
    removeBackground: removeBackgroundPrecise,
    extractHairFromDrawing: extractHairFromDrawing,
    applyFiltersToCanvas: applyFiltersToCanvas
  };
})();
