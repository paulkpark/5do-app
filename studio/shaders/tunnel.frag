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
uniform vec2 u_resolution;uniform float u_time;uniform float u_viewScale;uniform float u_speed;uniform float u_dark_mode;uniform float u_zoom;uniform float u_kaleidoscope;uniform float u_tousle;uniform float u_spread;uniform float u_frequency;uniform float u_nlines;uniform float u_nlayers;uniform float u_auto_animate;uniform float u_layer_offset;uniform float u_line_width;uniform float u_beat_move;uniform float u_beat_wave;uniform float u_beat_glow;uniform float u_hue_auto_offset;uniform float u_hue_offset;uniform float u_hue_spread;uniform float u_media_blend;
#define PI 3.14159265359
#define TAU 6.28318530718
#define SIN(x) (sin(x) * 0.5 + 0.5)
#define S(a, b, x) smoothstep(a, b, x)
mat2 rot(float a){float s=sin(a);float c=cos(a);return mat2(c,s,-s,c);}float smoothNoise21(vec2 p){vec2 i=floor(p);vec2 f=fract(p);float n00=dot(vec2(cos(dot(i,vec2(127.1,311.7))),sin(dot(i,vec2(127.1,311.7)))),f-vec2(0.0,0.0));float n01=dot(vec2(cos(dot(i+vec2(0.0,1.0),vec2(127.1,311.7))),sin(dot(i+vec2(0.0,1.0),vec2(127.1,311.7)))),f-vec2(0.0,1.0));float n10=dot(vec2(cos(dot(i+vec2(1.0,0.0),vec2(127.1,311.7))),sin(dot(i+vec2(1.0,0.0),vec2(127.1,311.7)))),f-vec2(1.0,0.0));float n11=dot(vec2(cos(dot(i+vec2(1.0,1.0),vec2(127.1,311.7))),sin(dot(i+vec2(1.0,1.0),vec2(127.1,311.7)))),f-vec2(1.0,1.0));vec2 u=f*f*(3.0-2.0*f);return mix(mix(n00,n10,u.x),mix(n01,n11,u.x),u.y);}vec4 layer(vec2 uv,float il,float t){uv=uv.yx;float alpha=0.;float neigh=step(1.1,u_zoom);uv=mix(uv,vec2(fract(u_zoom*uv.x),uv.y),neigh);float t2=2.0*t*(1.0-u_kaleidoscope*0.6)+u_bassTime*u_beat_move*2.;vec2 uvO=uv;float bass=u_bassHit*u_beat_move;float mid=mix(SIN(t*1.3),u_midHit,u_beat_move);float _line_width=mix(0.2,.8,u_line_width)*mix(1.,1.5,(u_zoom-1.)/4.);vec3 col=vec3(0);for(float off=-1.;off<=1.;off++){if(abs(off)>neigh)continue;uv=uvO+vec2(off,0.);vec2 UV=uv;vec2 kv=abs(uv);kv*=rot(0.25*PI);kv=abs(kv);kv*=rot(0.6*PI+0.1*t2);kv=abs(kv);uv=mix(UV,kv,u_kaleidoscope);for(float i=0.;i<10.;i++){if(i>=u_nlines)break;float s=sin(0.25*t2*u_auto_animate)*i;uv.x+=u_spread*mix(.5,1.,u_auto_animate)*0.05*sin(s*2.+u_frequency*uv.y-t2);uv.x+=smoothNoise21(vec2(50.*uv.y,t2))*u_midHit*0.01*u_beat_wave;uv.x+=smoothNoise21(vec2(200.*uv.y,t2))*u_trebleHit*0.001*u_beat_wave;uv.x+=0.15*sin(20.*i+8.*uv.y+0.5*t2)*u_tousle;float d=abs(_line_width*0.04/uv.x)*_line_width*(0.2+0.1*u_beat_glow*u_beatOnset);col+=d*palette(il/4.*S(.0,.3,u_hue_spread)+mix(t*0.05,1.*u_hue_offset,1.-u_hue_auto_offset)+i/10.*S(.3,1.,u_hue_spread));alpha+=d;}}return vec4(col,alpha);}void main(){vec2 uv=(gl_FragCoord.xy-0.5*u_resolution.xy)/u_resolution.y;vec2 screenUv=gl_FragCoord.xy/u_resolution.xy;float t=u_speed;vec3 bg=vec3(0.0);if(false){vec4 media=vec4(0.0);bg=media.rgb*media.a;}vec3 col=vec3(0.0);vec4 colA=layer(uv,0.,t);for(float i=0.;i<3.;i++){if(i>=u_nlines)break;colA+=layer(uv*(1.-(3.-i)/4.),i,t);}col=colA.rgb;col*=col;col=mix(col,bg+col,u_media_blend);col=mix(1.0-col,col,u_dark_mode);col=pow(col,vec3(2.2));gl_FragColor =vec4(col,colA.a);}