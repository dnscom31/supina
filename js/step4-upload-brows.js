// 4단계: 좌/우 눈썹 업로드 & 마스킹
(function(){
  window.addEventListener('DOMContentLoaded', function(){
    selectDom();
    function handleBrowUpload(side, file){
      var img = new Image();
      img.onload = function(){
        var maxSide = 400; var scale = Math.min(1, maxSide/Math.max(img.width, img.height));
        var w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        var canvas = (side==='left'? browCanvasLeft : browCanvasRight);
        var ctx = (side==='left'? browCtxLeft : browCtxRight);
        var maskCanvasEl = (side==='left'? browMaskCanvasLeft : browMaskCanvasRight);
        var maskCtxEl = (side==='left'? browMaskCtxLeft : browMaskCtxRight);
        canvas.width = maskCanvasEl.width = w; canvas.height = maskCanvasEl.height = h;
        ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h); maskCtxEl.clearRect(0,0,w,h);
        browImages[side] = img; newBrows[side] = null; processBrowImage(side);
      };
      img.src = URL.createObjectURL(file);
    }

    function startBrowDraw(side, e){ if(!browImages[side]) return; browMaskDrawing[side]=true; var maskCanvasEl=(side==='left'? browMaskCanvasLeft:browMaskCanvasRight); var pos=getCanvasPos(maskCanvasEl,e); browLastPos[side].x=pos.x; browLastPos[side].y=pos.y; var maskCtxEl=(side==='left'? browMaskCtxLeft:browMaskCtxRight); var brushInput=(side==='left'? browBrushLeft:browBrushRight); maskCtxEl.lineCap='round'; maskCtxEl.lineJoin='round'; maskCtxEl.lineWidth=parseInt(brushInput.value); maskCtxEl.strokeStyle='rgba(0,128,0,0.9)'; maskCtxEl.beginPath(); maskCtxEl.moveTo(pos.x,pos.y); }
    function drawBrow(side, e){ if(!browMaskDrawing[side]) return; var maskCanvasEl=(side==='left'? browMaskCanvasLeft:browMaskCanvasRight); var maskCtxEl=(side==='left'? browMaskCtxLeft:browMaskCtxRight); var pos=getCanvasPos(maskCanvasEl,e); maskCtxEl.lineTo(pos.x,pos.y); maskCtxEl.stroke(); }
    function endBrowDraw(side){ if(!browMaskDrawing[side]) return; browMaskDrawing[side]=false; var maskCtxEl=(side==='left'? browMaskCtxLeft:browMaskCtxRight); maskCtxEl.closePath(); }
    function clearBrowMask(side){ var maskCanvasEl=(side==='left'? browMaskCanvasLeft:browMaskCanvasRight); var maskCtxEl=(side==='left'? browMaskCtxLeft:browMaskCtxRight); if(!browImages[side]) return; maskCtxEl.clearRect(0,0,maskCanvasEl.width,maskCanvasEl.height); }

    function confirmBrowMask(side){
      if(!browImages[side]){ alert('먼저 새 눈썹 이미지를 업로드하세요.'); return; }
      var maskCanvasEl=(side==='left'? browMaskCanvasLeft:browMaskCanvasRight);
      var maskCtxEl=(side==='left'? browMaskCtxLeft:browMaskCtxRight);
      var canvasEl=(side==='left'? browCanvasLeft:browCanvasRight);
      var w=maskCanvasEl.width, h=maskCanvasEl.height;
      var imgData=maskCtxEl.getImageData(0,0,w,h), data=imgData.data;
      var minX=w,minY=h,maxX=0,maxY=0,found=false;
      for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var idx=(y*w+x)*4+3; if(data[idx]>0){ found=true; if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; } } }
      if(!found){ alert('영역을 칠해주세요.'); return; }
      var boxW=maxX-minX+1, boxH=maxY-minY+1;
      var temp=document.createElement('canvas'); temp.width=boxW; temp.height=boxH; var t=temp.getContext('2d');
      t.drawImage(canvasEl, minX, minY, boxW, boxH, 0, 0, boxW, boxH);
      var maskCanvas=document.createElement('canvas'); maskCanvas.width=boxW; maskCanvas.height=boxH; var mCtx=maskCanvas.getContext('2d');
      var maskData=maskCtxEl.getImageData(minX,minY,boxW,boxH); mCtx.putImageData(maskData,0,0);
      t.globalCompositeOperation='destination-in'; t.drawImage(maskCanvas,0,0); t.globalCompositeOperation='source-over';

      ImageProc.removeBackground(temp);
      newBrows[side] = { canvas: temp, bbox: [0,0,boxW,boxH] };
      maskCtxEl.clearRect(0,0,w,h); browConfirmed[side]=true; autoFitSide(side); updateStep3Navigation();
    }

    function autoFitSide(side){
      var region = faceRegions[side]; var browObj = newBrows[side]; if(!region||!browObj) return;
      var fw = region.bbox[2]; var bw = browObj.bbox[2];
      baseScale[side] = Math.max(0.05, (fw / bw) * 0.9); // 기준 배율만 설정
      var scaleSlider=(side==='left'? leftScale:rightScale); var rotSlider=(side==='left'? leftRot:rightRot); var alphaSlider=(side==='left'? leftAlpha:rightAlpha);
      scaleSlider.value='1'; // 슬라이더는 100%가 중간
      rotSlider.value='0'; alphaSlider.value='1'; nudgeOffsets[side].x=0; nudgeOffsets[side].y=0;
    }

    function autoCropBrow(side){
      var canvasEl=(side==='left'? browCanvasLeft:browCanvasRight); var ctx=(side==='left'? browCtxLeft:browCtxRight);
      var w=canvasEl.width, h=canvasEl.height; if(!w||!h) return;
      var imgData=ctx.getImageData(0,0,w,h); var data=imgData.data; var minX=w,minY=h,maxX=0,maxY=0,found=false;
      for(var y=0;y<h;y++) for(var x=0;x<w;x++){ var idx=(y*w+x)*4; var r=data[idx],g=data[idx+1],b=data[idx+2],a=data[idx+3]; var br=(r+g+b)/3; if(a>50 && br<240){ found=true; if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; } }
      if(!found) return; var boxW=maxX-minX+1, boxH=maxY-minY+1; var temp=document.createElement('canvas'); temp.width=boxW; temp.height=boxH; var t=temp.getContext('2d'); t.drawImage(canvasEl,minX,minY,boxW,boxH,0,0,boxW,boxH); ImageProc.removeBackground(temp); newBrows[side]={ canvas: temp, bbox:[0,0,boxW,boxH] }; autoFitSide(side); updateStep3Navigation();
    }

    function processBrowImage(side){
      try{
        if (typeof cv==='undefined' || !cv.imread){ autoCropBrow(side); return; }
        var canvasEl=(side==='left'? browCanvasLeft:browCanvasRight); var w=canvasEl.width, h=canvasEl.height; if(!w||!h) return;
        var srcMat = cv.imread(canvasEl); if (srcMat.type()!==cv.CV_8UC3 && srcMat.type()!==cv.CV_8UC4){ var tmp=new cv.Mat(); cv.cvtColor(srcMat,tmp,cv.COLOR_RGBA2RGB); srcMat.delete(); srcMat=tmp; }
        var gray=new cv.Mat(); cv.cvtColor(srcMat, gray, cv.COLOR_RGB2GRAY);
        var blur=new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0,0, cv.BORDER_DEFAULT);
        var kernelSize=15; var kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize,kernelSize));
        var blackhat=new cv.Mat(); cv.morphologyEx(blur, blackhat, cv.MORPH_BLACKHAT, kernel);
        var mask=new cv.Mat(); cv.threshold(blackhat, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        var smallKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5));
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, smallKernel); cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, smallKernel);
        var minX=w, minY=h, maxX=0, maxY=0; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ var val=mask.ucharPtr(y,x)[0]; if(val>0){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; } } }
        if (minX>maxX || minY>maxY){ gray.delete(); blur.delete(); blackhat.delete(); mask.delete(); kernel.delete(); smallKernel.delete(); autoCropBrow(side); return; }
        var boxW=maxX-minX+1, boxH=maxY-minY+1; var srcRoi=srcMat.roi(new cv.Rect(minX,minY,boxW,boxH)); var maskRoi=mask.roi(new cv.Rect(minX,minY,boxW,boxH));
        var rgba=new cv.Mat(); cv.cvtColor(srcRoi, rgba, cv.COLOR_RGB2RGBA); var rgbaVec=new cv.MatVector(); cv.split(rgba, rgbaVec); rgbaVec.get(3).delete(); rgbaVec.set(3, maskRoi); var merged=new cv.Mat(); cv.merge(rgbaVec, merged);
        var off=document.createElement('canvas'); off.width=boxW; off.height=boxH; cv.imshow(off, merged); ImageProc.removeBackground(off);
        newBrows[side]={ canvas: off, bbox:[0,0,boxW,boxH] };
        srcMat.delete(); gray.delete(); blur.delete(); blackhat.delete(); mask.delete(); kernel.delete(); smallKernel.delete(); srcRoi.delete(); maskRoi.delete(); rgba.delete(); rgbaVec.delete(); merged.delete();
        autoFitSide(side); updateStep3Navigation();
      }catch(err){ console.error(err); autoCropBrow(side); }
    }

    function updateStep3Navigation(){ var both=browConfirmed.left && browConfirmed.right; if(both){ nextFromStep3.style.display='block'; } else { nextFromStep3.style.display='none'; } }
    nextFromStep3?.addEventListener('click', function(){ if(browConfirmed.left && browConfirmed.right){ currentStep=5; maxStepReached=Math.max(maxStepReached,5); updateSteps(); updateResult(); } else { alert('왼쪽과 오른쪽 눈썹 모두에서 [확인]을 눌러주세요.'); } });

    browInputLeft?.addEventListener('change', function(e){ var f=e.target.files&&e.target.files[0]; if(!f) return; handleBrowUpload('left', f); });
    browInputRight?.addEventListener('change', function(e){ var f=e.target.files&&e.target.files[0]; if(!f) return; handleBrowUpload('right', f); });

    browMaskCanvasLeft?.addEventListener('pointerdown', function(e){ startBrowDraw('left', e); });
    browMaskCanvasLeft?.addEventListener('pointermove', function(e){ drawBrow('left', e); });
    window.addEventListener('pointerup', function(){ endBrowDraw('left'); });
    clearBrowMaskLeft?.addEventListener('click', function(){ clearBrowMask('left'); });
    confirmBrowMaskLeft?.addEventListener('click', function(){ confirmBrowMask('left'); });

    browMaskCanvasRight?.addEventListener('pointerdown', function(e){ startBrowDraw('right', e); });
    browMaskCanvasRight?.addEventListener('pointermove', function(e){ drawBrow('right', e); });
    window.addEventListener('pointerup', function(){ endBrowDraw('right'); });
    clearBrowMaskRight?.addEventListener('click', function(){ clearBrowMask('right'); });
    confirmBrowMaskRight?.addEventListener('click', function(){ confirmBrowMask('right'); });
  });
})();
