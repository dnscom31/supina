// 이미지 처리 유틸(피부톤 복원, 배경 제거, 필터/샤픈)
window.ImageProc = (function(){
  function removeBackground(canvas) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i+1], b = data[i+2];
      var brightness = (r + g + b) / 3;
      if (brightness > 200) data[i+3] = 0; // 흰 배경 제거
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function replaceMaskedAreaWithSkinTone(minX, minY, boxW, boxH, maskBlock, faceCtx) {
    var faceBlock = faceCtx.getImageData(minX, minY, boxW, boxH);
    var facePixels = faceBlock.data;
    var neighborColors = [];
    for (var y = 0; y < boxH; y++){
      for (var x = 0; x < boxW; x++){
        var idx = (y * boxW + x) * 4;
        var mAlpha = maskBlock[idx + 3];
        if (mAlpha > 0){
          for (var dy=-1; dy<=1; dy++){
            for (var dx=-1; dx<=1; dx++){
              if (dx===0 && dy===0) continue;
              var nx = x + dx, ny = y + dy;
              if (nx>=0 && nx<boxW && ny>=0 && ny<boxH){
                var nidx = (ny * boxW + nx) * 4;
                if (maskBlock[nidx + 3] === 0){
                  var r = facePixels[nidx], g = facePixels[nidx+1], b = facePixels[nidx+2];
                  if (!(r===0 && g===0 && b===0)) neighborColors.push({r:r,g:g,b:b});
                }
              }
            }
          }
        }
      }
    }
    if (neighborColors.length===0){
      for (var i=0; i<facePixels.length; i+=4){
        var a = maskBlock[i+3];
        if (a===0){
          var r2 = facePixels[i], g2 = facePixels[i+1], b2 = facePixels[i+2];
          if (!(r2===0 && g2===0 && b2===0)) neighborColors.push({r:r2,g:g2,b:b2});
        }
      }
    }
    if (neighborColors.length===0) return;
    var arr = neighborColors.map(function(c){ return {r:c.r,g:c.g,b:c.b, br:(c.r+c.g+c.b)/3}; }).sort(function(a,b){return a.br-b.br;});
    var trim = Math.floor(arr.length*0.1);
    var trimmed = arr.slice(trim, arr.length-trim);
    var sumR=0,sumG=0,sumB=0; trimmed.forEach(function(c){ sumR+=c.r; sumG+=c.g; sumB+=c.b; });
    var avgR=Math.round(sumR/trimmed.length), avgG=Math.round(sumG/trimmed.length), avgB=Math.round(sumB/trimmed.length);
    for (var yy=0; yy<boxH; yy++){
      for (var xx=0; xx<boxW; xx++){
        var id2=(yy*boxW+xx)*4; var mA=maskBlock[id2+3];
        if (mA>0){ facePixels[id2]=avgR; facePixels[id2+1]=avgG; facePixels[id2+2]=avgB; facePixels[id2+3]=255; }
      }
    }
    faceCtx.putImageData(faceBlock, minX, minY);
    try{
      var blurCanvas = document.createElement('canvas');
      blurCanvas.width = boxW; blurCanvas.height = boxH;
      var bctx = blurCanvas.getContext('2d');
      bctx.filter = 'blur(4px)';
      bctx.drawImage(faceCtx.canvas, minX, minY, boxW, boxH, 0, 0, boxW, boxH);
      faceCtx.drawImage(blurCanvas, minX, minY);
    }catch(e){}
  }

  function applyFiltersToCanvas(srcCanvas, opt){
    var bright = opt.bright||0, contrast=opt.contrast||0, saturation=(opt.saturation==null?100:opt.saturation), sharp=opt.sharp||0;
    var w = srcCanvas.width, h = srcCanvas.height;
    var stage1 = document.createElement('canvas'); stage1.width=w; stage1.height=h;
    var s1 = stage1.getContext('2d');
    var b = 1 + (bright/100), c = 1 + (contrast/100), sat = Math.max(0, saturation)/100;
    s1.filter = 'brightness('+b+') contrast('+c+') saturate('+sat+')';
    s1.drawImage(srcCanvas,0,0);
    if (!sharp || sharp<=0) return stage1;
    var stage2 = document.createElement('canvas'); stage2.width=w; stage2.height=h;
    var s2 = stage2.getContext('2d');
    var a = Math.min(1, Math.max(0, sharp));
    var k = [ 0, -a, 0, -a, 1+4*a, -a, 0, -a, 0 ];
    convolve(stage1, stage2, k, 1, 0);
    return stage2;
  }

  function convolve(srcCanvas, dstCanvas, kernel, divisor, bias){
    divisor = divisor||1; bias = bias||0;
    var w = srcCanvas.width, h = srcCanvas.height;
    var sctx = srcCanvas.getContext('2d');
    var dctx = dstCanvas.getContext('2d');
    var src = sctx.getImageData(0,0,w,h); var dst = dctx.createImageData(w,h);
    var sw=src.width, sh=src.height, sdata=src.data, ddata=dst.data;
    var kw=3, kh=3, half=1;
    for (var y=0; y<sh; y++){
      for (var x=0; x<sw; x++){
        var r=0,g=0,bp=0,aChan=0;
        for (var ky=-half; ky<=half; ky++){
          for (var kx=-half; kx<=half; kx++){
            var px = Math.min(sw-1, Math.max(0, x+kx));
            var py = Math.min(sh-1, Math.max(0, y+ky));
            var si = (py*sw+px)*4;
            var kv = kernel[(ky+half)*kw + (kx+half)];
            r += sdata[si] * kv; g += sdata[si+1] * kv; bp += sdata[si+2] * kv; aChan += sdata[si+3] * kv;
          }
        }
        var di = (y*sw+x)*4;
        ddata[di] = Math.min(255, Math.max(0, r/divisor + bias));
        ddata[di+1] = Math.min(255, Math.max(0, g/divisor + bias));
        ddata[di+2] = Math.min(255, Math.max(0, bp/divisor + bias));
        ddata[di+3] = sdata[di+3];
      }
    }
    dctx.putImageData(dst,0,0);
  }

  return { removeBackground, replaceMaskedAreaWithSkinTone, applyFiltersToCanvas, convolve };
})();
