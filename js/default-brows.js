// 기본 눈썹 프리셋 로더
var DEFAULT_BROW_SRC = {
  curved:   {left: 'images/default-brows/curved_right_left.png',   right: 'images/default-brows/curved_right.png'},
  soft:     {left: 'images/default-brows/soft_arch_left.png',      right: 'images/default-brows/soft_arch_right.png'},
  standard: {left: 'images/default-brows/standard_right_left.png', right: 'images/default-brows/standard_right.png'},
  straight: {left: 'images/default-brows/straight_right_left.png', right: 'images/default-brows/straight_right.png'},
  suitable: {left: 'images/default-brows/suitable_thin_left.png',  right: 'images/default-brows/suitable_thin.png'}
};

function imageToCanvas(src){
  return new Promise(function(resolve, reject){
    var img = new Image();
    img.onload = function(){
      var c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img,0,0);
      resolve(c);
    };
    img.onerror = reject; img.src = src;
  });
}

async function setDefaultStyle(style){
  try{
    var pair = DEFAULT_BROW_SRC[style]; if(!pair) return;
    var res = await Promise.all([imageToCanvas(pair.left), imageToCanvas(pair.right)]);
    defaultBrows.left  = { canvas: res[0], bbox:[0,0,res[0].width,res[0].height] };
    defaultBrows.right = { canvas: res[1], bbox:[0,0,res[1].width,res[1].height] };
    currentDefaultStyle = style; useDefaultBrow = true;
    if (faceRegions.left) autoFitSideDefault('left');
    if (faceRegions.right) autoFitSideDefault('right');
    updateResult();
  }catch(e){ console.warn('default style load failed', e); }
}

function autoFitSideDefault(side){
  var region = faceRegions[side]; var browObj = defaultBrows[side];
  if (!region || !browObj) return;
  var fw=region.bbox[2];
  baseScale[side] = Math.max(0.05, (fw / browObj.canvas.width) * 0.9);
  (side==='left'? leftScale : rightScale).value = '1';
}
