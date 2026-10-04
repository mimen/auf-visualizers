// Background from the Liquid Light concept: cover shine plus the WebGL liquid shader.
const W=1920,H=1080,BG='#332d49';
const SHINE_STOPS = [[0, 0, 0, 0], [0.48, -26, 0.21, 0.055], [0.56, -23, 0.17, 0.025], [0.86, -5, 0, -0.067], [1, 12, -0.06, -0.108]];
function rgbToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
const hsl = (h, s, l) => `hsl(${(((h % 1) + 1) % 1) * 360} ${Math.max(0, Math.min(1, s)) * 100}% ${Math.max(0, Math.min(1, l)) * 100}%)`;
const BASE = rgbToHsl(BG);
function shineBackground(ctx, strength, angle, shift) {
  const rad = angle * Math.PI / 180, half = Math.hypot(W, H) / 2, dx = Math.cos(rad) * half, dy = Math.sin(rad) * half;
  const cx = W / 2 + Math.cos(rad) * shift, cy = H / 2 + Math.sin(rad) * shift; // shift slides the bright line along the axis
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const [o, dh, ds, dl] of SHINE_STOPS) g.addColorStop(o, hsl(BASE[0] + dh / 360 * strength, BASE[1] + ds * strength, BASE[2] + dl * strength));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function liquid(illo){
 const canvas=document.createElement('canvas');canvas.width=Math.round(W/3);canvas.height=Math.round(H/3);
 const gl=canvas.getContext('webgl',{alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL is required');
 const vs=`attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
 const fs=`precision highp float;
 varying vec2 uv;uniform float time,bass,highs,aspect;uniform sampler2D art;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+3.7;a*=.5;}return v;}
 void main(){
 // Slow, soft morph: two levels of domain warp on low-frequency noise, no contour lines, no grain.
 vec2 p=(uv-.5)*vec2(aspect,1.);float t=time*.05;
 vec2 q=vec2(fbm(p*.9+vec2(t,-t*.3)),fbm(p*.9+vec2(5.2,1.3)-t*.25));
 vec2 r=vec2(fbm(p*.8+q*1.6+vec2(1.7,9.2)+t*.18),fbm(p*.8+q*1.6+vec2(8.3,2.8)-t*.15));
 float f=fbm(p*.7+r*1.4);
 vec3 base=vec3(.20,.176,.286);
 vec3 teal=vec3(.25,.55,.53),gold=vec3(.62,.50,.30),rose=vec3(.52,.32,.42),deep=vec3(.13,.11,.21);
 vec3 col=mix(deep,base,smoothstep(.2,.7,f));
 col=mix(col,teal,smoothstep(.45,.85,r.x)*.55);
 col=mix(col,gold,smoothstep(.55,.9,q.y)*.35);
 col=mix(col,rose,smoothstep(.5,.85,r.y)*.35);
 col*=1.+bass*.06;
 float vignette=smoothstep(1.,.2,length((uv-.5)*vec2(.9,1.1)));col*=.6+.4*vignette;
 gl_FragColor=vec4(col,1.);
 }`;
 const shader=(type,src)=>{let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
 const pr=gl.createProgram();gl.attachShader(pr,shader(gl.VERTEX_SHADER,vs));gl.attachShader(pr,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr));gl.useProgram(pr);
 gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
 gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,illo);for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
 const uniforms=Object.fromEntries(['time','bass','highs','aspect'].map(n=>[n,gl.getUniformLocation(pr,n)]));gl.uniform1f(uniforms.aspect,W/H);
 return (t,b,h)=>{gl.uniform1f(uniforms.time,t);gl.uniform1f(uniforms.bass,b);gl.uniform1f(uniforms.highs,h);gl.drawArrays(gl.TRIANGLES,0,6);return canvas};
}
