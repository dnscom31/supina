// 간단한 보안 보조(프레임 바스팅)
(function(){
  try{ if (self !== top) top.location = self.location; }catch(e){}
})();