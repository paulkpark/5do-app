#pragma use_lib palette
#pragma use_lib audio
precision highp float;
// WebGL1 polyfills for WebGL2-only functions used by Karleido
float _round(float x) { return floor(x + 0.5); }
vec2  _round(vec2  x) { return floor(x + 0.5); }
vec3  _round(vec3  x) { return floor(x + 0.5); }
vec4  _round(vec4  x) { return floor(x + 0.5); }
#define round(x) _round(x)
float _tanh(float x) { float e = exp(2.0 * x); return (e - 1.0) / (e + 1.0); }
vec2  _tanh(vec2  x) { vec2  e = exp(2.0 * x); return (e - 1.0) / (e + 1.0); }
vec3  _tanh(vec3  x) { vec3  e = exp(2.0 * x); return (e - 1.0) / (e + 1.0); }
vec4  _tanh(vec4  x) { vec4  e = exp(2.0 * x); return (e - 1.0) / (e + 1.0); }
#define tanh(x) _tanh(x)
float _sinh(float x) { return 0.5 * (exp(x) - exp(-x)); }
float _cosh(float x) { return 0.5 * (exp(x) + exp(-x)); }
#define sinh(x) _sinh(x)
#define cosh(x) _cosh(x)
// Karleido LFO/Ramp synthesis
#define audio_LFO_2  (0.5 + 0.5 * sin(u_time * 3.14159))
#define audio_LFO_4  (0.5 + 0.5 * sin(u_time * 1.5708))
#define audio_LFO_8  (0.5 + 0.5 * sin(u_time * 0.7854))
#define audio_Ramp_2 fract(u_time * 0.5)
#define audio_Ramp_4 fract(u_time * 0.25)
#define audio_Ramp_8 fract(u_time * 0.125)
uniform sampler2D BuffA;
uniform vec2 u_resolution;uniform float u_time;uniform float u_viewScale;uniform float u_media_scale;uniform float u_speed;uniform float u_warp_mode;uniform float u_warp_strength;uniform float u_warp_scale;uniform float u_glow_boost;uniform float u_depth_fade;uniform float u_hue_shift;uniform float u_turbulence_level;uniform float u_bubble_display;uniform float u_bubble_scale;uniform float u_bubble_speed;uniform float u_refraction;uniform float u_opacity;uniform float u_distort_amount;uniform float u_distort_period;uniform float u_beat_shift;uniform float u_beat_distort;uniform float u_beat_glow;uniform float u_beat_move;
#define PI 3.14159265359
#define SIN(a) (0.5 + 0.5 * sin(a))
#define W 0.5
#define RENDERSIZE u_resolution
#define TIME u_time
vec2 _xy;vec2 _uv;vec2 _uvc;vec3 _rgb2hsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=0.0001;return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);}float _hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}float _noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);float a=_hash12(i);float b=_hash12(i+vec2(1.0,0.0));float c=_hash12(i+vec2(0.0,1.0));float d=_hash12(i+vec2(1.0,1.0));vec2 u=f*f*(3.0-2.0*f);return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;}mat2 rot(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}vec3 pal(float x){return 0.5+0.5*(cos(x*2.0*PI-vec3(0.0,2.0,4.0)));}vec2 mirrored(vec2 uv){return abs(mod(uv,2.0)-1.0);}float glowMix(float beatSignal){return u_glow_boost*mix(1.0,beatSignal,u_beat_glow);}
#define tt (u_speed + 0.4 * u_bassTime*u_beat_move)
vec2 logPolar(vec2 uv){float l=length(uv);float a=atan(uv.y,uv.x);return vec2(log(l),abs(a));}vec2 turbulence(vec2 uv,float N){float strength_mult=mix(.9,1.,u_warp_strength);for (int _gen_i=int(0.0); _gen_i<32; _gen_i++) { if (float(_gen_i)>=N) break; float i = float(_gen_i);uv*=rot(length(uv)*1.0*u_warp_strength-0.2*sin(tt)-0.2*tt);uv+=0.1*sin(uv.xy*5.1*strength_mult-0.2*tt);uv.xy-=vec2(0.1,0.2)*0.1;uv+=0.01*cos(uv.xy*1.3*strength_mult-0.2*tt);}return uv;}vec4 renderInfinitWarp(){vec4 fragColor=vec4(0.0);vec2 fragCoord=_xy;vec2 uv=(fragCoord-0.5*RENDERSIZE.xy)/RENDERSIZE.y;vec3 col=vec3(0.0);vec2 uv0=uv;uv=turbulence(uv,u_turbulence_level);vec2 uv1=uv;uv=logPolar(uv.yx);vec2 uvl=uv;uv=vec2(uv.x-0.8*tt,uv.y);vec2 mediaUV=vec2(uv.x*(u_resolution.y/u_resolution.x),uv.y)+0.5;mediaUV=mirrored(mediaUV);vec4 media=vec4(0.0);col.rgb+=media.rgb*media.a;col*=mix(mix(1.,.3,u_depth_fade),1.,smoothstep(0.,.5,length(uv1)));col=mix(col,col.rgb*vec3(0.5)*3.0,glowMix(u_bassHit));vec3 hsv=_rgb2hsv(col.rgb);float hueShift=(2.5*mix(1.0,u_bassHit,u_beat_shift)+0.5*audio_LFO_4)*u_hue_shift;float a=SIN(u_bubble_speed*4.0+mix(1.0,1.0+0.1*u_bassHit*u_distort_period,u_beat_distort)*u_distort_amount*10.0*_noise(uvl*4.0*u_distort_period+0.2*u_bassTime*u_beat_distort+0.2*u_bubble_speed)+((uvl.x)*4.0+uv1.x*8.0+uv0.y*2.0)*u_bubble_scale+sin(uvl.x*0.5+u_bubble_speed)+hsv.x*hueShift);fragColor=vec4(col,a);return fragColor;}vec2 warpUv(vec2 uv,float time,float strength){float scale=max(u_warp_scale,0.01);float waveX=sin((uv.y*8.0*scale)+time*1.5);float waveY=cos((uv.x*6.0*scale)-time*1.2);vec2 offset=vec2(waveX,waveY)*0.02*strength;return uv+offset;}vec2 radialWarpUv(vec2 uv,float time,float strength){vec2 center=vec2(0.5);vec2 delta=uv-center;vec2 aspect=vec2(u_resolution.x/u_resolution.y,1.0);vec2 radialDelta=delta*aspect;float amplitude=strength*0.15;float spread=0.35;float frequency=max(u_warp_scale,0.01)/max(spread,0.01);float radialWave=SIN(length(radialDelta)*frequency*6.2831853-time*3.0);radialDelta*=mix(1.0-amplitude,1.0+amplitude,radialWave);return center+radialDelta/aspect;}vec4 simpleWarp(vec2 uv,bool radialMode){vec2 warpedUv=radialMode?radialWarpUv(uv,u_speed,u_warp_strength):warpUv(uv,u_speed,u_warp_strength);vec4 baseColor=vec4(0.0);vec3 finalColor=mix(baseColor.rgb,baseColor.rgb*vec3(0.5)*2.0,glowMix(u_beatOnset))*baseColor.a;return vec4(finalColor,1.0);}
#define TEX(uv) texture2D(BuffA, uv).a
float _luminance(vec3 color){return dot(color,vec3(0.2126,0.7152,0.0722));}float _luminance(vec4 color){return _luminance(color.rgb);}vec4 renderMainImage(){vec4 fragColor=vec4(0.0);vec2 fragCoord=_xy;vec2 uv=fragCoord.xy/RENDERSIZE.xy;uv=(uv-0.5)*0.98+0.5;vec4 data=texture2D(BuffA,uv);float gray=data.a;if(u_bubble_display<0.5||u_warp_mode<1.){fragColor=vec4(data.rgb,1.0);return fragColor;}float range=3.0;vec2 aspect=vec2(RENDERSIZE.x/RENDERSIZE.y,1.0);vec3 unit=vec3(range/472.0/aspect,0.0);vec3 normal=normalize(vec3(TEX(uv+unit.xz)-TEX(uv-unit.xz),TEX(uv-unit.zy)-TEX(uv+unit.zy),gray*gray*gray));vec3 color=vec3(0.3)*(1.0-abs(dot(normal,vec3(0.0,0.0,1.0))));vec3 dir=normalize(vec3(0.0,1.0,2.0));float spe=pow(dot(normal,dir)*0.5+0.5,20.0);spe+=pow(dot(normal,dir)*0.5+0.5,80.0)*0.5;color+=vec3(0.4)*smoothstep(0.3,1.0,spe);vec3 tint=pal(dot(normal,dir)*1.0-uv.y*1.0-4.0);float c=smoothstep(0.4,0.0,gray);color+=tint*c;vec3 bg=texture2D(BuffA,(uv-.5)*mix(1.0-u_refraction*0.5,1.0,c)+.5).rgb;float c1=1.0-smoothstep(0.0,0.1,gray);color=mix(bg*c1,clamp(color+0.05,0.0,1.0),smoothstep(0.1,0.1,gray));color+=(1.0-u_opacity)*bg*(1.0-c)*vec3(0.5);return vec4(color,1.0);}vec4 renderMain(){if(PASSINDEX==0.0){if(u_warp_mode<.5){vec2 uv=(_xy/u_resolution-.5)*u_media_scale+.5;return simpleWarp(uv,false);}if(u_warp_mode<1.5){vec2 uv=(_xy/u_resolution-.5)*u_media_scale+.5;return simpleWarp(uv,true);}return renderInfinitWarp();}vec4 color=renderMainImage();color.a=smoothstep(0.,0.05,_luminance(color));color.rgb=pow(color.rgb,vec3(2.2));return color;}void main(){_xy=gl_FragCoord.xy;_uvc=(_xy-0.5*u_resolution.xy)/u_resolution.y;_uv=_uvc+0.5;vec4 color=renderMain();gl_FragColor =color;}