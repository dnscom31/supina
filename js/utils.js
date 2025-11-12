// 전역 상태 및 유틸리티
var currentStep = 1;
var maxStepReached = 1;

// DOM 참조 (초기화 시 채움)
var stepElems, panelElems;
var faceInput, faceCanvas, faceMaskCanvas, faceCtx, faceMaskCtx, brushSizeInput;
var clearMaskBtn, confirmMaskBtn, paintLeftBtn, paintRightBtn, paintStatus, nextFromStep2;
var finalizeStep2Btn, gotoStep4Btn, gotoStep5Btn;
var liquifyFeather, liquifySaturation, liquifyOpacity;
var retouchToolSel, retouchSizeInput, retouchStrengthInput;
var browInputLeft, browCanvasLeft, browMaskCanvasLeft, browCtxLeft, browMaskCtxLeft, browBrushLeft, clearBrowMaskLeft, confirmBrowMaskLeft;
var browInputRight, browCanvasRight, browMaskCanvasRight, browCtxRight, browMaskCtxRight, browBrushRight, clearBrowMaskRight, confirmBrowMaskRight, nextFromStep3;
var resultCanvas, resultCtx;
var leftScale, leftRot, leftAlpha, rightScale, rightRot, rightAlpha;
var leftBright, leftContrast, leftSaturation, leftSharpness, rightBright, rightContrast, rightSaturation, rightSharpness;
var syncTransform, syncColor, downloadBtn, nudgeButtons, inpaintBtn, resetAppBtn, hideUploadedChk;

// 상태 객체
var faceImage = null, faceW = 0, faceH = 0;
var faceBaseCanvas = null, faceBaseCtx = null; // 원본 해상도 유지용
var faceBaseOriginalCanvas = null, faceBaseOriginalCtx = null; // 비파괴 편집용 원본 백업
var paintingSide = null, faceMaskDrawing = false, faceLastX = 0, faceLastY = 0;
var faceRegions = { left: null, right: null };
var faceMasks   = { left: null, right: null };
var selectionLocked = { left: false, right: false };

var browImages  = { left: null, right: null };
var baseScale  = { left: 1, right: 1 }; // 자동 맞춤 기준 배율(슬라이더는 여기에 곱해짐)
var browMaskDrawing = { left: false, right: false };
var browLastPos = { left: {x:0,y:0}, right: {x:0,y:0} };
var newBrows    = { left: null, right: null };
var nudgeOffsets = { left: {x:0,y:0}, right: {x:0,y:0} };
var browConfirmed = { left: false, right: false };
var useDefaultBrow = false;
var hideUploadedBrow = false;
var currentDefaultStyle = null;
var defaultBrows = { left:null, right:null };

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function selectDom() {
  stepElems = qsa('.steps .step');
  panelElems = qsa('.step-panel');
  faceInput = qs('#faceInput');
  faceCanvas = qs('#faceCanvas');
  faceMaskCanvas = qs('#faceMaskCanvas');
  faceCtx = faceCanvas?.getContext('2d');
  faceMaskCtx = faceMaskCanvas?.getContext('2d');
  brushSizeInput = qs('#brushSize');
  liquifyFeather = qs('#liquifyFeather');
  liquifySaturation = qs('#liquifySaturation');
  liquifyOpacity = qs('#liquifyOpacity');
  clearMaskBtn = qs('#clearMask');
  confirmMaskBtn = qs('#confirmMask');
  paintLeftBtn = qs('#paintLeft');
  paintRightBtn = qs('#paintRight');
  paintStatus = qs('#paintStatus');
  nextFromStep2 = qs('#nextFromStep2');

  browInputLeft = qs('#browInputLeft');
  browCanvasLeft = qs('#browCanvasLeft');
  browMaskCanvasLeft = qs('#browMaskCanvasLeft');
  browCtxLeft = browCanvasLeft?.getContext('2d');
  browMaskCtxLeft = browMaskCanvasLeft?.getContext('2d');
  browBrushLeft = qs('#browBrushSizeLeft');
  clearBrowMaskLeft = qs('#clearBrowMaskLeft');
  confirmBrowMaskLeft = qs('#confirmBrowMaskLeft');

  browInputRight = qs('#browInputRight');
  browCanvasRight = qs('#browCanvasRight');
  browMaskCanvasRight = qs('#browMaskCanvasRight');
  browCtxRight = browCanvasRight?.getContext('2d');
  browMaskCtxRight = browMaskCanvasRight?.getContext('2d');
  browBrushRight = qs('#browBrushSizeRight');
  clearBrowMaskRight = qs('#clearBrowMaskRight');
  confirmBrowMaskRight = qs('#confirmBrowMaskRight');
  nextFromStep3 = qs('#nextFromStep3');

  resultCanvas = qs('#resultCanvas');
  resultCtx = resultCanvas?.getContext('2d');
  leftScale = qs('#leftScale');
  leftRot = qs('#leftRot');
  leftAlpha = qs('#leftAlpha');
  rightScale = qs('#rightScale');
  rightRot = qs('#rightRot');
  rightAlpha = qs('#rightAlpha');
  leftBright = qs('#leftBright');
  leftContrast = qs('#leftContrast');
  leftSaturation = qs('#leftSaturation');
  leftSharpness = qs('#leftSharpness');
  rightBright = qs('#rightBright');
  rightContrast = qs('#rightContrast');
  rightSaturation = qs('#rightSaturation');
  rightSharpness = qs('#rightSharpness');
  syncTransform = qs('#syncTransform');
  syncColor = qs('#syncColor');
  downloadBtn = qs('#downloadResult');
  inpaintBtn = qs('#inpaintResult');
  resetAppBtn = qs('#resetApp');
  hideUploadedChk = qs('#hideUploaded');
}

function updateSteps() {
  stepElems.forEach(step => {
    var s = parseInt(step.dataset.step);
    step.classList.toggle('active', s === currentStep);
    if (s > maxStepReached) step.classList.add('disabled');
    else step.classList.remove('disabled');
  });
  panelElems.forEach(panel => {
    var s = parseInt(panel.dataset.step);
    panel.classList.toggle('active', s === currentStep);
  });
}

function getCanvasPos(canvas, e) {
  var rect = canvas.getBoundingClientRect();
  var x = (e.clientX - rect.left) * (canvas.width / rect.width);
  var y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x: x, y: y };
}

async function saveCanvasAsJpg(canvas, filename) {
  var blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
