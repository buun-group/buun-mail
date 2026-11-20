/**
 * The dissolve.email burn: a noise front burns across an element with a hot edge in the brand's glow and accent, shedding
 * embers, the element breaking into dust of its own colours as it goes. Scaled for list rows here: the embers and dust
 * are small and short-lived, and drawing is clipped to the item, so the burn stays on what is going. Ported from dissolve.email's motion package
 * (`dissolveOut` in `@dissolve/motion/dissolve`, the portal's inbox burn), so an inbox going here looks as it does there.
 *
 * One shared, fixed canvas over the window draws every running burn in its element's box: a single WebGL2 context
 * however many rows go at once, drawing nothing and running no loop while none runs. Without WebGL2, on a software GPU
 * or when the shader fails, the element fades with a little blur; under reduced motion it is a plain short fade.
 * The element stays the source of truth: the canvas only paints over it, and it is hidden (`burn-gone`) at the end.
 */

type GL = WebGL2RenderingContext
type Rgb = readonly [number, number, number]

/** The 3D simplex noise (Ashima Arts and Stefan Gustavson, MIT licence), a hash and fbm, shared by the shaders. */
const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float fbm(vec3 p){float a=0.5;float s=0.0;for(int i=0;i<4;i++){s+=a*snoise(p);p=p*2.03+vec3(17.1,9.2,3.7);a*=0.5;}return s;}
`;

const VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform vec2 uView;
uniform vec2 uPos;
uniform vec2 uSize;
uniform float uMargin;
out vec2 vPx;
void main(){
vec2 px=uPos-uMargin+aCorner*(uSize+uMargin*2.0);
vPx=px-uPos;
vec2 clip=px/uView*2.0-1.0;
gl_Position=vec4(clip.x,-clip.y,0.0,1.0);
}`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vPx;
uniform vec2 uSize;
uniform float uRadius;
uniform float uT;
uniform int uMode;
uniform vec2 uOrigin;
uniform float uSeed;
uniform float uTime;
uniform vec3 uGround;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uCool;
uniform vec3 uDustA;
uniform vec3 uDustB;
uniform float uDust;
out vec4 o;
${GLSL_NOISE}
float sdRound(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
float sparks(vec2 p,float front,float span,float cell,float share,float life,float wob,float lift,float liftK,float sizeK,float salt){
float acc=0.0;
vec2 c0=floor(p/cell);
for(int k=0;k<4;k++){
for(int j=-1;j<=1;j++){
vec2 cc=c0+vec2(float(j),float(k));
float h=hash12(cc+uSeed*13.0+salt);
if(h>share) continue;
vec2 jitter=hash22(cc+uSeed+salt);
vec2 home=(cc+jitter)*cell;
float fe=mix(hash12(cc*1.7+3.0),length(home-uOrigin)/span,0.6);
float age=(front-fe)/life;
if(age<0.0||age>1.0) continue;
vec2 at=home+vec2(sin(h*60.0+age*4.0)*wob,-age*(lift+h*liftK));
float r=(0.9+h*sizeK)*(1.0-age*0.7);
float d=length(p-at);
acc+=smoothstep(r,r*0.2,d)*(1.0-age);
}
}
return acc;
}
void main(){
vec2 p=vPx;
float sd=sdRound(p-uSize*0.5,uSize*0.5,uRadius);
float inside=1.0-smoothstep(-0.5,0.5,sd);
float span=length(uSize);
float big=step(0.001,uDust);
float n=clamp(fbm(vec3(p/mix(110.0,max(110.0,span*0.22),big),uSeed))*0.95+0.5,0.0,1.0);
float d=length(p-uOrigin)/span;
vec3 col=vec3(0.0);
float a=0.0;
if(uMode<2){
float f=mix(n,clamp(d*1.25,0.0,1.0),mix(0.5,0.62,big));
float w=mix(0.07,clamp(24.0/span,0.022,0.07),big);
float front=mix(-w*2.0,1.0+w,uT);
float g=f-front;
float burnt=smoothstep(0.004,-0.004,g);
float cover=uMode==0?burnt:1.0-burnt;
cover*=inside;
float charSide=uMode==0?g:-g;
float charring=inside*smoothstep(w*3.0,0.0,charSide)*step(0.0,charSide)*0.55;
col=uGround*max(cover,charring);
a=max(cover,charring);
float e=inside*(1.0-smoothstep(0.0,w,abs(g)));
float core=1.0-smoothstep(0.0,w*0.22,abs(g));
vec3 hot=mix(uMid,uHot,smoothstep(w,0.0,abs(g)));
hot=mix(hot,mix(uHot,uCool,0.55),core*0.6);
float flick=0.85+0.15*snoise(vec3(p/14.0,uTime*3.0));
col+=hot*e*1.1*flick;
a=max(a,e*flick);
float fade=1.0-smoothstep(0.85,1.0,uT);
float ember=sparks(p,front,span,6.0,0.16,0.14,2.0,6.0,14.0,2.2,0.0)*fade;
col+=mix(uHot,uMid,0.3)*ember;
a=max(a,min(1.0,ember));
if(uDust>0.0){
float dust=sparks(p,front,span,3.0,0.45*uDust,0.2,1.2,3.0,8.0,0.9,7.0)*fade;
vec3 tint=mix(uDustA,uDustB,hash12(floor(p/4.0)+uSeed));
col+=mix(tint,uHot,0.25)*dust*1.2;
a=max(a,min(1.0,dust));
}
} else {
float f=d*0.9+n*0.35;
float front=uT*1.25;
float lit=smoothstep(front+0.02,front-0.02,f);
float ring=1.0-smoothstep(0.4,1.6,abs(sd+0.75));
float halo=exp(-max(sd,0.0)/9.0)*step(0.0,sd)*0.3;
float head=1.0-smoothstep(0.0,0.14,front-f);
float glow=(ring*(0.55+1.4*head)+halo*(0.8+1.6*head))*lit;
vec3 hot=mix(uMid,uHot,head);
hot=mix(hot,uCool,head*ring*0.35);
float flick=0.8+0.2*snoise(vec3(p/18.0,uTime*2.0));
col=hot*glow*flick;
a=min(1.0,glow*flick);
}
o=vec4(col,a);
}`;

interface Effect {
  el: HTMLElement
  start: number
  duration: number
  origin: readonly [number, number]
  seed: number
  ground: Rgb
  radius: number
  dust: number
  done: () => void
}

interface Overlay {
  gl: GL
  canvas: HTMLCanvasElement
  prog: WebGLProgram
  u: Record<string, WebGLUniformLocation>
  vao: WebGLVertexArrayObject | null
  colours: { hot: Rgb; mid: Rgb; cool: Rgb; dustA: Rgb; dustB: Rgb }
}

let overlay: Overlay | null | undefined
const effects = new Set<Effect>()
let raf = 0

/** True when the person asked for less motion. */
function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

let probe: CanvasRenderingContext2D | null | undefined

/** Any CSS colour as 0 to 1 channels and alpha, painted into one pixel and read back so the browser parses it. */
function cssRgba(value: string): readonly [number, number, number, number] {
  if (probe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!probe || !value) return [0.5, 0.5, 0.5, 1]
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = 'transparent'
  probe.fillStyle = value
  probe.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = probe.getImageData(0, 0, 1, 1).data
  if (a === 0) return [0, 0, 0, 0]
  return [r / 255, g / 255, b / 255, a / 255]
}

/** A colour token as 0 to 1 channels, so the canvas paints with the page's tokens. */
function tokenRgb(name: string): Rgb {
  const [r, g, b] = cssRgba(getComputedStyle(document.documentElement).getPropertyValue(name).trim())
  return [r, g, b]
}

function shader(gl: GL, type: number, source: string): WebGLShader {
  const made = gl.createShader(type)
  if (!made) throw new Error('WebGL: no shader')
  gl.shaderSource(made, source)
  gl.compileShader(made)
  if (!gl.getShaderParameter(made, gl.COMPILE_STATUS)) {
    gl.deleteShader(made)
    throw new Error('WebGL: shader did not compile')
  }
  return made
}

function program(gl: GL): WebGLProgram {
  const vs = shader(gl, gl.VERTEX_SHADER, VS)
  const fs = shader(gl, gl.FRAGMENT_SHADER, FS)
  const made = gl.createProgram()
  gl.attachShader(made, vs)
  gl.attachShader(made, fs)
  gl.linkProgram(made)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(made, gl.LINK_STATUS)) {
    gl.deleteProgram(made)
    throw new Error('WebGL: program did not link')
  }
  return made
}

function uniformsOf(gl: GL, prog: WebGLProgram): Record<string, WebGLUniformLocation> {
  const found: Record<string, WebGLUniformLocation> = {}
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(prog, index)
    if (info === null) continue
    const at = gl.getUniformLocation(prog, info.name)
    if (at !== null) found[info.name.replace(/\[0\]$/u, '')] = at
  }
  return found
}

/** True on a software rasteriser, where every pixel costs CPU: the fade is kinder there. */
function softwareGpu(gl: GL): boolean {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    return /swiftshader|llvmpipe|softpipe|software|basic render/iu.test(renderer)
  } catch {
    return false
  }
}

function size(o: Overlay): void {
  const ratio = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  // At most 1.5 device pixels a CSS pixel: the burn is soft by nature, and fewer pixels keep every frame on time.
  const dpr = Math.min(ratio, 1.5)
  o.canvas.width = Math.round(window.innerWidth * dpr)
  o.canvas.height = Math.round(window.innerHeight * dpr)
}

function makeOverlay(): Overlay | null {
  const canvas = document.createElement('canvas')
  canvas.className = 'burn-overlay'
  canvas.setAttribute('aria-hidden', 'true')
  let gl: GL | null = null
  try {
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' })
  } catch {
    gl = null
  }
  if (gl === null) return null
  if (softwareGpu(gl)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }
  let prog: WebGLProgram
  try {
    prog = program(gl)
  } catch {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    for (const effect of effects) effect.done()
    effects.clear()
    canvas.remove()
    overlay = null
  })
  document.body.append(canvas)
  const made: Overlay = {
    gl,
    canvas,
    prog,
    u: uniformsOf(gl, prog),
    vao,
    colours: { hot: tokenRgb('--dissolve-glow'), mid: tokenRgb('--dissolve-accent'), cool: tokenRgb('--dissolve-cyan'), dustA: tokenRgb('--dissolve-accent-light'), dustB: tokenRgb('--dissolve-primary') },
  }
  window.addEventListener('resize', () => size(made), { passive: true })
  size(made)
  return made
}

function getOverlay(): Overlay | null {
  if (overlay === undefined) overlay = makeOverlay()
  return overlay
}

/** The flat colour behind an element: every ancestor's background composited from the page down. */
function groundOf(el: HTMLElement): Rgb {
  const chain: HTMLElement[] = []
  for (let at: HTMLElement | null = el.parentElement; at !== null; at = at.parentElement) chain.unshift(at)
  let ground: Rgb = tokenRgb('--surface-body')
  for (const node of chain) {
    const [r, g, b, opacity] = cssRgba(getComputedStyle(node).backgroundColor)
    if (!(opacity > 0)) continue
    ground = [ground[0] + (r - ground[0]) * opacity, ground[1] + (g - ground[1]) * opacity, ground[2] + (b - ground[2]) * opacity]
  }
  return ground
}

const easeBurn = (t: number): number => 1 - (1 - t) ** 1.6

function loop(now: number): void {
  raf = 0
  const o = overlay
  if (!o) return
  const { gl, u } = o
  gl.viewport(0, 0, o.canvas.width, o.canvas.height)
  gl.disable(gl.SCISSOR_TEST)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  if (effects.size === 0) {
    o.canvas.dataset['on'] = 'false'
    return
  }
  o.canvas.dataset['on'] = 'true'
  gl.enable(gl.BLEND)
  gl.enable(gl.SCISSOR_TEST)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.useProgram(o.prog)
  gl.bindVertexArray(o.vao)
  const w = window.innerWidth
  const h = window.innerHeight
  gl.uniform2f(u['uView'] ?? null, w, h)
  gl.uniform1f(u['uTime'] ?? null, now / 1000)
  gl.uniform3fv(u['uHot'] ?? null, o.colours.hot)
  gl.uniform3fv(u['uMid'] ?? null, o.colours.mid)
  gl.uniform3fv(u['uCool'] ?? null, o.colours.cool)
  gl.uniform3fv(u['uDustA'] ?? null, o.colours.dustA)
  gl.uniform3fv(u['uDustB'] ?? null, o.colours.dustB)
  for (const effect of effects) {
    const raw = effect.duration > 0 ? Math.min(1, (now - effect.start) / effect.duration) : 1
    const box = effect.el.getBoundingClientRect()
    // A thin margin only, and drawing clipped to it, so the burn stays on the item rather than spilling round it.
    const margin = 6
    if (box.bottom + margin > 0 && box.top - margin < h && box.width > 0) {
      gl.uniform2f(u['uPos'] ?? null, box.left, box.top)
      gl.uniform2f(u['uSize'] ?? null, box.width, box.height)
      gl.uniform1f(u['uMargin'] ?? null, margin)
      gl.uniform1f(u['uRadius'] ?? null, effect.radius)
      gl.uniform1f(u['uT'] ?? null, easeBurn(raw))
      gl.uniform1i(u['uMode'] ?? null, 0)
      gl.uniform2f(u['uOrigin'] ?? null, effect.origin[0] * box.width, effect.origin[1] * box.height)
      gl.uniform1f(u['uSeed'] ?? null, effect.seed)
      gl.uniform3fv(u['uGround'] ?? null, effect.ground)
      gl.uniform1f(u['uDust'] ?? null, effect.dust)
      const scale = o.canvas.width / w
      gl.scissor(Math.floor((box.left - margin) * scale), Math.floor((h - box.bottom - margin) * scale), Math.ceil((box.width + margin * 2) * scale), Math.ceil((box.height + margin * 2) * scale))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    if (raw >= 1) {
      effects.delete(effect)
      effect.done()
    }
  }
  raf = requestAnimationFrame(loop)
}

/** A fade with a little blur (or a plain short fade under reduced motion), for when the canvas cannot burn. */
function fade(el: HTMLElement): Promise<void> {
  el.classList.add('burn-fade')
  return new Promise((resolve) =>
    window.setTimeout(() => {
      el.classList.add('burn-gone')
      resolve()
    }, reduced() ? 200 : 360),
  )
}

export interface BurnOptions {
  /** Milliseconds the burn takes. Default 1300, as the portal burns an inbox. */
  duration?: number
  /** How much of the element breaks into dust of the brand's colours as the edge passes, 0 to 1. Default 1. */
  dust?: number
}

/** Burns an element away to its ground; resolves once it has gone, hidden under the last frame so nothing flashes. */
export function burnAway(el: HTMLElement, options: BurnOptions = {}): Promise<void> {
  const o = reduced() ? null : getOverlay()
  if (o === null) return fade(el)
  return new Promise((resolve) => {
    el.classList.add('is-burning')
    effects.add({
      el,
      start: performance.now(),
      duration: options.duration ?? 1300,
      origin: [Math.random() * 0.15, 0.1 + Math.random() * 0.3],
      seed: Math.random() * 100,
      ground: groundOf(el),
      radius: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      dust: Math.max(0, Math.min(1, options.dust ?? 1)),
      done: () => {
        el.classList.remove('is-burning')
        el.classList.add('burn-gone')
        resolve()
      },
    })
    if (raf === 0) raf = requestAnimationFrame(loop)
  })
}
