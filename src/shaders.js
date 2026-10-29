import * as THREE from 'three';

// ---------- shared GLSL ----------
export const NOISE3 = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm3(vec3 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*snoise(p);p*=2.03;a*=0.5;}return s;}
float fbm3l(vec3 p){float a=0.5,s=0.0;for(int i=0;i<3;i++){s+=a*snoise(p);p*=2.03;a*=0.5;}return s;}
vec3 hash33(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453123);}
float vor3(vec3 x){vec3 p=floor(x),f=fract(x);float d=8.0;
  for(int k=-1;k<=1;k++)for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 b=vec3(float(i),float(j),float(k));vec3 r=b-f+hash33(p+b);d=min(d,dot(r,r));}
  return sqrt(d);}
`;

export const VNOISE2 = /* glsl */ `
float h12(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h12(i),h12(i+vec2(1.0,0.0)),f.x),mix(h12(i+vec2(0.0,1.0)),h12(i+vec2(1.0,1.0)),f.x),f.y);}
`;

const LOG_V_PARS = `#include <common>\n#include <logdepthbuf_pars_vertex>\n`;
const LOG_V = `\n#include <logdepthbuf_vertex>\n`;
const LOG_F_PARS = `#include <logdepthbuf_pars_fragment>\n`;
const LOG_F = `\n#include <logdepthbuf_fragment>\n`;

// ---------- planets ----------
export const PLANET_TYPES = { rocky: 0, earth: 1, mars: 2, venus: 3, jupiter: 4, saturn: 5, uranus: 6, neptune: 7, moon: 9 };

export function makePlanetMaterial(type, opts = {}) {
  const c = (h) => new THREE.Color(h);
  return new THREE.ShaderMaterial({
    uniforms: {
      uType: { value: PLANET_TYPES[type] ?? 0 },
      uSunPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSeed: { value: opts.seed ?? 1.7 },
      uC1: { value: c(opts.c1 ?? 0x888888) },
      uC2: { value: c(opts.c2 ?? 0x555555) },
      uC3: { value: c(opts.c3 ?? 0xaaaaaa) },
      uAmb: { value: opts.amb ?? 0.03 },
    },
    vertexShader: LOG_V_PARS + `
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      void main(){
        vO = normal;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        ${LOG_V}
      }`,
    fragmentShader: LOG_F_PARS + NOISE3 + `
      uniform int uType; uniform vec3 uSunPos; uniform float uTime; uniform float uSeed;
      uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uAmb;
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      void main(){
        ${LOG_F}
        vec3 p = normalize(vO);
        vec3 N = normalize(vN);
        vec3 L = normalize(uSunPos - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        float lit = smoothstep(-0.12, 0.25, ndl) * (0.35 + 0.65 * max(ndl, 0.0));
        float lat = p.y;
        vec3 col = uC1; vec3 emis = vec3(0.0); float spec = 0.0;
        if (uType == 0 || uType == 9) {
          float n = fbm3(p * 3.0 + uSeed);
          float maria = smoothstep(0.05, 0.3, fbm3l(p * 1.3 + uSeed * 2.0));
          col = mix(uC1, uC2, n * 0.5 + 0.5);
          col = mix(col, uC3, maria * (uType == 9 ? 0.7 : 0.3));
          float c1 = vor3(p * 7.0 + uSeed), c2 = vor3(p * 19.0 - uSeed);
          col *= 1.0 - smoothstep(0.32, 0.0, c1) * 0.25 + smoothstep(0.3, 0.38, c1) * smoothstep(0.46, 0.38, c1) * 0.35;
          col *= 1.0 - smoothstep(0.3, 0.0, c2) * 0.15 + smoothstep(0.28, 0.36, c2) * smoothstep(0.44, 0.36, c2) * 0.2;
        } else if (uType == 1) {
          float h = fbm3(p * 1.7 + uSeed) + 0.3 * fbm3l(p * 7.0);
          float land = smoothstep(0.03, 0.07, h);
          vec3 ocean = mix(vec3(0.01, 0.05, 0.18), vec3(0.04, 0.22, 0.42), smoothstep(-0.25, 0.04, h));
          float desert = smoothstep(0.42, 0.12, abs(lat + 0.08 * snoise(p * 4.0))) * smoothstep(0.0, 0.2, fbm3l(p * 3.0 + 5.0));
          vec3 lc = mix(vec3(0.13, 0.3, 0.1), vec3(0.72, 0.6, 0.38), desert);
          lc = mix(lc, vec3(0.4, 0.33, 0.25), smoothstep(0.25, 0.45, h));
          col = mix(ocean, lc, land);
          float ice = smoothstep(0.78, 0.84, abs(lat) + 0.04 * snoise(p * 6.0));
          col = mix(col, vec3(0.92, 0.95, 1.0), ice);
          vec3 H = normalize(L + V);
          spec = (1.0 - land) * (1.0 - ice) * pow(max(dot(N, H), 0.0), 60.0) * 0.8;
          vec3 q = p + vec3(uTime * 0.004, 0.0, 0.0);
          float cl = fbm3(q * 3.0 + fbm3l(q * 2.0 + uTime * 0.01));
          cl = smoothstep(0.05, 0.55, cl);
          float city = land * (1.0 - ice) * smoothstep(0.55, 0.85, snoise(p * 60.0) * 0.5 + 0.5 + 0.3 * snoise(p * 9.0));
          emis += vec3(1.0, 0.65, 0.3) * city * (1.0 - smoothstep(-0.2, 0.05, ndl)) * (1.0 - cl) * 1.4;
          col = mix(col, vec3(1.0), cl * 0.9);
          spec *= 1.0 - cl;
        } else if (uType == 2) {
          float n = fbm3(p * 2.5 + uSeed);
          col = mix(uC1, uC2, smoothstep(-0.3, 0.4, n));
          col = mix(col, uC3, smoothstep(0.15, 0.4, fbm3l(p * 1.5 + 3.0)) * 0.6);
          float canyon = smoothstep(0.035, 0.0, abs(p.y - 0.05 * sin(p.x * 9.0) + 0.1)) * smoothstep(-0.2, 0.3, p.z);
          col *= 1.0 - canyon * 0.5;
          float cr = vor3(p * 10.0);
          col *= 1.0 - smoothstep(0.25, 0.0, cr) * 0.15;
          col = mix(col, vec3(0.95, 0.93, 0.9), smoothstep(0.86, 0.9, abs(lat) + 0.03 * snoise(p * 8.0)));
        } else if (uType == 3) {
          vec3 q = p + 0.35 * vec3(fbm3l(p * 2.0 + uTime * 0.01), fbm3l(p * 2.0 + 4.0), fbm3l(p * 2.0 - 3.0));
          float v = fbm3(q * 3.0 + vec3(uTime * 0.006, 0.0, 0.0));
          float b = lat * 4.0 + v * 1.5;
          col = mix(uC1, uC2, 0.5 + 0.5 * sin(b * 3.0));
          col = mix(col, uC3, smoothstep(0.2, 0.6, v));
        } else if (uType == 4 || uType == 5 || uType == 6 || uType == 7) {
          float freq = uType == 4 ? 14.0 : uType == 5 ? 20.0 : uType == 6 ? 6.0 : 9.0;
          float warpA = uType == 4 ? 0.9 : uType == 5 ? 0.35 : 0.25;
          vec3 q = p + vec3(uTime * 0.003, 0.0, 0.0);
          float w = fbm3(vec3(q.x * 3.0, q.y * 10.0, q.z * 3.0) + uSeed) * warpA;
          float b = lat * freq + w + 0.3 * fbm3l(p * 6.0);
          float s1 = 0.5 + 0.5 * sin(b * 3.0), s2 = 0.5 + 0.5 * sin(b * 1.3 + 1.0);
          col = mix(uC1, uC2, s1);
          col = mix(col, uC3, s2 * (uType == 6 ? 0.25 : 0.5));
          if (uType == 4) {
            vec2 sp = vec2(atan(p.z, p.x) - 1.0, (lat + 0.33) * 3.2);
            float e = length(sp * vec2(1.0, 1.6));
            float sw = smoothstep(0.32, 0.12, e + 0.05 * snoise(p * 25.0));
            col = mix(col, vec3(0.75, 0.3, 0.15) * (0.8 + 0.4 * sin(e * 30.0 - uTime * 0.5)), sw);
          }
          if (uType == 7) {
            vec2 sp = vec2(atan(p.z, p.x) + 0.6, (lat + 0.25) * 4.0);
            col *= 1.0 - 0.55 * smoothstep(0.25, 0.1, length(sp * vec2(1.0, 1.8)));
            col = mix(col, vec3(0.9, 0.95, 1.0), smoothstep(0.55, 0.75, fbm3l(vec3(p.x * 2.0, p.y * 25.0, p.z * 2.0))) * 0.6);
          }
        }
        vec3 outc = col * (lit + uAmb) + spec * vec3(1.0, 0.95, 0.85) + emis;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        outc += uC3 * rim * 0.25 * smoothstep(-0.2, 0.4, ndl) * float(uType != 0 && uType != 9);
        gl_FragColor = vec4(outc, 1.0);
      }`,
  });
}

export function makeAtmoMaterial(color, strength = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: { uSunPos: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(color) }, uStr: { value: strength } },
    vertexShader: LOG_V_PARS + `
      varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; ${LOG_V} }`,
    fragmentShader: LOG_F_PARS + `
      uniform vec3 uSunPos; uniform vec3 uColor; uniform float uStr;
      varying vec3 vN; varying vec3 vW;
      void main(){ ${LOG_F}
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); vec3 L = normalize(uSunPos - vW);
        float rim = 1.0 - abs(dot(N, V));
        float a = pow(rim, 2.2) * smoothstep(-0.35, 0.3, dot(N, L));
        gl_FragColor = vec4(uColor * a * uStr * 1.6, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
}

export function makeSunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: LOG_V_PARS + `
      varying vec3 vO; varying vec3 vN; varying vec3 vW;
      void main(){ vO = normal; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; ${LOG_V} }`,
    fragmentShader: LOG_F_PARS + NOISE3 + `
      uniform float uTime; varying vec3 vO; varying vec3 vN; varying vec3 vW;
      void main(){ ${LOG_F}
        vec3 p = normalize(vO);
        float n = fbm3(p * 6.0 + vec3(0.0, uTime * 0.05, 0.0));
        float g = vor3(p * 40.0 + uTime * 0.1);
        float t = clamp(0.55 + n * 0.6 - g * 0.25, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.45), t);
        float mu = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
        col *= 0.55 + 0.45 * pow(mu, 0.5);
        gl_FragColor = vec4(col * 4.0, 1.0);
      }`,
  });
}

export function makeRingMaterial(inner, outer, c1, c2, opacity = 0.9) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uIn: { value: inner }, uOut: { value: outer }, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) },
      uSunPos: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uR: { value: 1 }, uOp: { value: opacity },
    },
    vertexShader: LOG_V_PARS + `
      varying vec3 vW; varying vec3 vL;
      void main(){ vL = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; ${LOG_V} }`,
    fragmentShader: LOG_F_PARS + `
      uniform float uIn; uniform float uOut; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uSunPos; uniform vec3 uCenter; uniform float uR; uniform float uOp;
      varying vec3 vW; varying vec3 vL;
      float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      float bands(float t){ float s = 0.0; for (int i = 1; i < 6; i++) { float f = float(i) * float(i) * 9.0; float k = t * f; s += mix(hh(floor(k)), hh(floor(k) + 1.0), smoothstep(0.0, 1.0, fract(k))) / float(i); } return s / 2.28; }
      void main(){ ${LOG_F}
        float r = length(vL.xy);
        float t = (r - uIn) / (uOut - uIn);
        if (t < 0.0 || t > 1.0) discard;
        float d = bands(t);
        float a = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.93, t) * (0.25 + 0.75 * d);
        a *= 1.0 - 0.85 * smoothstep(0.53, 0.55, t) * smoothstep(0.6, 0.58, t);
        vec3 col = mix(uC1, uC2, d);
        vec3 toSun = normalize(uSunPos - vW);
        vec3 oc = vW - uCenter; float b = dot(oc, toSun); float c = dot(oc, oc) - uR * uR;
        float sh = (b < 0.0 && b * b - c > 0.0) ? 0.15 : 1.0;
        gl_FragColor = vec4(col * sh, a * uOp);
      }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
}

// ---------- surface sky ----------
export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) }, uSunSize: { value: 0.012 }, uSpace: { value: 0 }, uStars: { value: 0 },
      uGround: { value: new THREE.Color() }, uSkyRot: { value: new THREE.Matrix3() },
    },
    vertexShader: LOG_V_PARS + `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 w = modelMatrix*vec4(position,1.0); gl_Position = projectionMatrix*viewMatrix*w; ${LOG_V} }`,
    fragmentShader: LOG_F_PARS + `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
      uniform float uSpace; uniform float uStars; uniform vec3 uGround; uniform mat3 uSkyRot;
      varying vec3 vDir;
      float hs(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){ ${LOG_F}
        vec3 d = normalize(vDir);
        float el = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(el, 0.0, 1.0), 0.5));
        col = mix(col, uGround, smoothstep(0.0, -0.25, el));
        float sd = dot(d, uSunDir);
        col += uSunColor * pow(max(sd, 0.0), 6.0) * 0.25 * (1.0 - uSpace * 0.7);
        col += uSunColor * pow(max(sd, 0.0), 200.0) * 0.8;
        float disk = smoothstep(cos(uSunSize), cos(uSunSize * 0.8), sd);
        col = mix(col, uSunColor * 8.0, disk);
        float spaceMix = uSpace * (0.35 + 0.65 * smoothstep(-0.05, 0.35, el));
        col = mix(col, vec3(0.0, 0.0, 0.006), spaceMix * (1.0 - disk));
        vec3 sdir = uSkyRot * d;
        vec3 sp = sdir * 300.0; vec3 cell = floor(sp); float h = hs(cell);
        if (h > 0.996) {
          vec3 f = fract(sp) - 0.5 - (hash3(cell) - 0.5) * 0.5;
          float st = smoothstep(0.12, 0.0, length(f)) * (h - 0.996) * 250.0;
          col += vec3(0.85 + 0.15 * h, 0.9, 1.0) * st * uStars * smoothstep(-0.1, 0.1, el + uSpace);
        }
        gl_FragColor = vec4(col, 1.0);
      }`.replace('float hs(', 'vec3 hash3(vec3 p){ return fract(sin(vec3(dot(p,vec3(12.9,78.2,37.7)),dot(p,vec3(39.3,11.1,83.7)),dot(p,vec3(73.1,52.2,9.4))))*43758.5); }\nfloat hs('),
    side: THREE.BackSide, depthWrite: false,
  });
}

// ---------- liquid surface ----------
export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x06243d) }, uSky: { value: new THREE.Color(0x6aa0e0) },
      uHor: { value: new THREE.Color(0xbcd4ef) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uLava: { value: 0 }, uAlpha: { value: 0.9 },
    }]),
    vertexShader: `#include <common>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n` + VNOISE2 + `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform float uLava; uniform float uAlpha;
      varying vec3 vW;
      float wv(vec2 p){ return vn(p*0.05 + uTime*vec2(0.05,0.03))*1.0 + vn(p*0.17 - uTime*vec2(0.09,0.02))*0.45 + vn(p*0.6 + uTime*vec2(0.1,-0.17))*0.15; }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vW.xz;
        float dist = length(cameraPosition - vW);
        float e = 0.8;
        float h0 = wv(p), hx = wv(p + vec2(e, 0.0)), hz = wv(p + vec2(0.0, e));
        float str = 2.2 / (1.0 + dist * 0.004);
        vec3 n = normalize(vec3((h0 - hx) * str, e, (h0 - hz) * str));
        vec3 v = normalize(cameraPosition - vW);
        vec3 col;
        if (uLava > 0.5) {
          float c = vn(p * 0.02 + uTime * 0.03) * 0.6 + vn(p * 0.09 - uTime * 0.08) * 0.4;
          vec3 lava = mix(vec3(1.6, 0.3, 0.02), vec3(3.2, 1.3, 0.25), c);
          float crust = smoothstep(0.42, 0.62, vn(p * 0.035 + vec2(uTime * 0.015, 0.0)) * 0.7 + vn(p * 0.2) * 0.3);
          col = mix(lava, vec3(0.07, 0.04, 0.03), crust * 0.85);
        } else {
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 r = reflect(-v, n);
          vec3 sky = mix(uHor, uSky, clamp(r.y * 1.5, 0.0, 1.0));
          col = mix(uDeep, sky, fres);
          float sp = max(dot(r, uSunDir), 0.0);
          col += uSunColor * (pow(sp, 400.0) * 8.0 + pow(sp, 30.0) * 0.15);
        }
        gl_FragColor = vec4(col, uLava > 0.5 ? 1.0 : uAlpha);
        #include <fog_fragment>
      }`,
    transparent: true, fog: true, side: THREE.DoubleSide,
  });
}

// ---------- billboard clouds ----------
export function makeCloudMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      map: { value: null }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.6, 0.65, 0.75) }, uOpacity: { value: 0.85 },
    }]),
    vertexShader: `#include <common>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>
      attribute vec4 aCloud; attribute vec3 aTint;
      varying vec2 vUv; varying float vFade; varying vec3 vTint; varying float vRot;
      void main(){
        vUv = uv; vTint = aTint;
        vec3 c = aCloud.xyz; float size = aCloud.w;
        vec4 mvPosition = viewMatrix * vec4(c, 1.0);
        float rot = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5) * 6.2831;
        vRot = rot;
        vec2 o = position.xy * size; float cs = cos(rot), sn = sin(rot);
        mvPosition.xy += vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs) * vec2(1.0, 0.6);
        float d = -mvPosition.z;
        vFade = smoothstep(size * 0.15, size * 0.9, d);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform vec3 uLit; uniform vec3 uShade; uniform float uOpacity;
      varying vec2 vUv; varying float vFade; varying vec3 vTint; varying float vRot;
      void main(){
        #include <logdepthbuf_fragment>
        vec4 t = texture2D(map, vUv);
        float a = t.a * uOpacity * vFade;
        if (a < 0.01) discard;
        float up = clamp(0.5 + (vUv.y - 0.5) * cos(vRot) * 1.2, 0.0, 1.0);
        vec3 col = mix(uShade, uLit, up * 0.7 + t.r * 0.3) * vTint;
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
}

export function makeCloudTexture() {
  const s = 128, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = s * (0.25 + Math.random() * 0.5), y = s * (0.3 + Math.random() * 0.45), r = s * (0.12 + Math.random() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const l = 200 + Math.random() * 55;
    gr.addColorStop(0, `rgba(${l},${l},${l},0.55)`);
    gr.addColorStop(1, `rgba(${l},${l},${l},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,200,120,0.35)') {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.15, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
