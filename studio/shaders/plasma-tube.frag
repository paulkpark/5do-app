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
uniform vec2 u_resolution;uniform float u_time;uniform float u_viewScale;uniform float u_mod_freq;uniform float u_mod_length;uniform float u_exponent;uniform float u_hole_radius;uniform float u_speed;uniform float u_beat_sync;uniform float u_mirror;uniform float u_glow;uniform float u_media_blend;
#define PI 3.14159265359
#define RENDERSIZE u_resolution
#define TIME u_time

vec2 _xy;vec2 _uv;vec2 _uvc;
#define SIN(t) (.5 + .5 * sin(t))
mat2 rot(float x){return mat2(cos(x),-sin(x),sin(x),cos(x));}vec4 renderMainImage(){vec4 fragColor=vec4(0.0);vec2 fragCoord=_xy;vec2 uv=(fragCoord-.5*RENDERSIZE.xy)/RENDERSIZE.y;float tt=u_speed*.5;uv.xy*=mix(.8,1.2,SIN(-tt+5.*length(uv.xy)));vec3 col=vec3(0.0);vec3 rd=vec3(uv,1.0);float t=0.0;float alpha=0.;if(false){t=.001*vec4(0.0).a;}for(float i=0.;i<80.;i++){vec3 p=t*rd+rd;p.z+=tt+u_bassTime*0.;float z=p.z;p=mix(p,abs(p),u_mirror);p.xy*=rot(p.z);p=abs(p)-.5;for(float j=0.;j<3.;j++){float a=exp(j)/exp2(j)/(u_exponent+.5*0.0);p+=cos(u_mod_freq*p.yzx*a+.9*tt+(audio_LFO_8*2.-1.)*u_beat_sync-length(p.xy)*(u_mod_length+1.*SIN(.01*tt+.0*u_midTime)))/a;}float d=0.009+abs((p+vec3(0.0,u_hole_radius+.7*SIN(tt),0.0)).y-1.)/14.;float k=t*.7+length(p)*.1-.2*tt+z*.1+.0*u_midTime;vec3 c=palette(k);c=mix(c,c*vec3(0.918,1.000,0.620),SIN(z*.5-length(uv)*2.));col+=c*1e-3/d;alpha+=1.*1e-3/d;t+=d/5.;}float gl=exp(-10.*length(uv.xy));col+=.7*mix(vec3(0.361,0.957,1.000),vec3(0.847,1.000,0.561),SIN(gl*2.-tt))*pow(gl*11.,1.)*mix(.5,1.,u_bassHit)*u_glow;col*=mix(1.,mix(.8,1.1,smoothstep(0.0,1.,SIN(length(uv.xy)*3.-(tt+0.*u_midTime)))),u_glow);vec3 media=vec4(0.0).rgb;col=mix(col,col*media*1.2+.2*media,u_media_blend);col*=mix(1.,.5,smoothstep(0.0,.8,length(uv.y)));col*=tanh(col*.2);fragColor=vec4(col,alpha);return fragColor;}void main(){_xy=gl_FragCoord.xy;_uvc=(_xy-.5*u_resolution.xy)/u_resolution.y;_uv=_uvc+.5;gl_FragColor =renderMainImage();}