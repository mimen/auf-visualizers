// Liquid Light background from the liquid concept page (the shipped look). Overrides lab/bg.js's softer liquid().
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
 vec2 p=(uv-.5)*vec2(aspect,1.);float t=time*.042;
 vec2 q=vec2(fbm(p*1.8+vec2(t,-t*.4)),fbm(p*1.8+vec2(4.3,-t*.6)));
 vec2 r=vec2(fbm(p*2.1+q*2.7+vec2(1.7,t*.6)),fbm(p*2.1+q*2.7+vec2(8.3,-t*.5)));
 float f=fbm(p*2.+r*(2.6+bass*.45));
 float ribbons=sin(f*24.+p.x*2.8-t*1.1);
 vec3 base=vec3(.20,.176,.286);
 vec3 teal=vec3(.23,.63,.58),gold=vec3(.80,.62,.30),rose=vec3(.66,.36,.44);
 vec3 color=mix(teal,gold,smoothstep(.32,.75,r.x));color=mix(color,rose,smoothstep(.52,.77,q.y));
 float light=smoothstep(-.6,.95,ribbons);
 vec3 col=mix(base*.72,color,light*.62);
 float seam=pow(max(0.,1.-abs(ribbons-.68)),14.);
 col+=color*seam*(.28+bass*.24);
 vec2 warp=uv+vec2(r.x-.5,r.y-.5)*(.7+bass*.15);warp=abs(fract(warp*.8)*2.-1.);
 vec4 tex=texture2D(art,warp);col=mix(col,tex.rgb,.055*tex.a);
 float band=exp(-pow((dot(p,vec2(.156,.988))-.3*sin(t*.7))/.25,2.));col+=vec3(.13,.13,.20)*band*.9;
 float grain=hash(gl_FragCoord.xy+fract(time)*513.);
 col+=(grain-.5)*(.017+highs*.018);
 col+=vec3(.5,.7,.8)*pow(grain,80.)*highs*.12;
 float vignette=smoothstep(.95,.15,length((uv-.5)*vec2(.9,1.)));col*=.55+.45*vignette;
 gl_FragColor=vec4(col,1.);
 }`;
 const shader=(type,src)=>{let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
 const pr=gl.createProgram();gl.attachShader(pr,shader(gl.VERTEX_SHADER,vs));gl.attachShader(pr,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr));gl.useProgram(pr);
 gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
 gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,illo);for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
 const uniforms=Object.fromEntries(['time','bass','highs','aspect'].map(n=>[n,gl.getUniformLocation(pr,n)]));gl.uniform1f(uniforms.aspect,W/H);
 return (t,b,h)=>{gl.uniform1f(uniforms.time,t);gl.uniform1f(uniforms.bass,b);gl.uniform1f(uniforms.highs,h);gl.drawArrays(gl.TRIANGLES,0,6);return canvas};
}
