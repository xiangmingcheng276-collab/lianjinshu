import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FluidConfig, HandData } from '../types';

// --- ADVANCED ALCHEMY SHADER ---
const vertexShader = `
  uniform float uTime;
  uniform vec4 uHand; 
  uniform float uFlowSpeed;
  uniform float uChaos;
  uniform float uForceStrength;
  uniform float uParticleSize;
  uniform float uReaction; // 0.0 to 1.0 (Boiling effect)
  
  attribute vec3 initialPosition;
  attribute float randomOffset;
  
  varying float vLife;
  varying float vDist;
  varying float vReaction;

  // Noise Functions
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vec3 pos = initialPosition;
    float time = uTime * uFlowSpeed;
    
    // Base Flow
    float n1 = snoise(vec3(pos.xy * uChaos, time));
    float n2 = snoise(vec3(pos.xy * uChaos * 2.0, time * 1.5));
    
    pos.x += n1 * 0.4;
    pos.y += n2 * 0.4;
    pos.z += (n1 + n2) * 0.2;

    // REACTION EFFECT (Boiling)
    // When uReaction > 0, particles jitter rapidly and expand
    if (uReaction > 0.01) {
       float jitter = snoise(vec3(pos.xy * 10.0, uTime * 20.0)) * uReaction;
       pos.z += jitter * 2.0;
       pos.xy += jitter * 0.5;
    }

    // INTERACTION
    float d = distance(pos.xy, uHand.xy);
    vDist = d;
    vReaction = uReaction;
    
    float pinchStrength = uHand.w;
    
    // Pinch (Gravity Well)
    if (pinchStrength > 0.1) {
       float pull = smoothstep(3.5, 0.0, d) * pinchStrength;
       pos = mix(pos, vec3(uHand.xy, 0.0), pull * 0.6); 
       pos.z *= (1.0 - pull);
    } else {
       // Repulsion
       float push = smoothstep(2.0, 0.0, d);
       vec3 dir = normalize(pos - vec3(uHand.xy, 0.0));
       pos += dir * push * uForceStrength;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    float size = uParticleSize;
    if (d < 1.0) size *= 1.5; 
    
    // Expand particles during reaction
    if (uReaction > 0.01) size *= (1.0 + uReaction);

    gl_PointSize = size * (300.0 / -mvPosition.z);
    vLife = n1;
  }
`;

const fragmentShader = `
  uniform vec3 uBaseColor;
  uniform vec3 uHighlightColor;
  uniform float uGlow;
  
  varying float vLife;
  varying float vDist;
  varying float vReaction;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float r = length(coord);
    if(r > 0.5) discard;
    
    float alpha = 1.0 - (r * 2.0);
    alpha = pow(alpha, 1.5);
    
    // Color Logic
    vec3 col = mix(uBaseColor, uHighlightColor, smoothstep(-1.0, 1.0, vLife));
    
    // Reaction Color Shift (Flash White/Orange)
    if (vReaction > 0.01) {
       vec3 reactionColor = vec3(1.0, 0.8, 0.5); // Hot glow
       col = mix(col, reactionColor, vReaction * 0.7);
    }
    
    // Proximity Highlight
    if (vDist < 1.5) {
       col = mix(col, vec3(1.0), 0.3 * (1.5 - vDist));
    }
    
    gl_FragColor = vec4(col * uGlow, alpha);
  }
`;

// --- SPELL TRAIL ---
// A glowing ribbon that follows the hand
const SpellTrail = ({ handRef }: { handRef: React.MutableRefObject<HandData> }) => {
  const pointsRef = useRef<THREE.Vector3[]>([]);
  const meshRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const trailLength = 30;

  useFrame(() => {
    if (!meshRef.current) return;
    
    const h = handRef.current;
    
    // Map hand to world
    const x = (h.x - 0.5) * viewport.width;
    const y = -(h.y - 0.5) * viewport.height;
    const z = 0;

    // Add new point if active
    if (h.active) {
      pointsRef.current.unshift(new THREE.Vector3(x, y, z));
    } else if (pointsRef.current.length > 0) {
       // Decay if not active
       pointsRef.current.shift(); 
    }

    // Trim
    if (pointsRef.current.length > trailLength) {
      pointsRef.current.pop();
    }

    // Update meshes (simple spheres for now as a ribbon)
    meshRef.current.children.forEach((mesh, i) => {
      const point = pointsRef.current[i];
      if (point) {
        mesh.position.copy(point);
        const scale = 1.0 - (i / trailLength);
        mesh.scale.setScalar(scale * 0.5); // Adjust size
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    });
  });

  return (
    <group ref={meshRef}>
      {Array.from({ length: trailLength }).map((_, i) => (
        <mesh key={i}>
          <planeGeometry args={[0.5, 0.5]} />
          <meshBasicMaterial 
            color="#a855f7" 
            transparent 
            opacity={0.3} 
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

// --- CURSOR ---
const HandCursor = ({ handRef }: { handRef: React.MutableRefObject<HandData> }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  useFrame((state) => {
    if (!groupRef.current) return;
    
    const h = handRef.current;
    if (!h.active) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    const x = (h.x - 0.5) * viewport.width;
    const y = -(h.y - 0.5) * viewport.height;
    
    groupRef.current.position.lerp(new THREE.Vector3(x, y, 0), 0.25);
    
    if (ring1Ref.current && ring2Ref.current) {
      ring1Ref.current.rotation.z -= 0.05;
      ring2Ref.current.rotation.z += 0.03;
      
      const pinchScale = 1.0 - (h.pinchStrength * 0.6);
      groupRef.current.scale.setScalar(pinchScale);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer Rune Ring */}
      <mesh ref={ring1Ref}>
        <ringGeometry args={[0.4, 0.45, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner Energy Ring */}
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.2, 0.25, 32]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Core */}
      <mesh>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
};

// --- PARTICLES ---
const Particles = ({ 
  handRef, 
  config, 
  reactionState 
}: { 
  handRef: React.MutableRefObject<HandData>; 
  config: FluidConfig;
  reactionState: number; // 0-1
}) => {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  const count = 18000;
  
  const particles = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for(let i=0; i<count; i++) {
      pos[i*3] = (Math.random()-0.5) * viewport.width * 1.5;
      pos[i*3+1] = (Math.random()-0.5) * viewport.height * 1.5;
      pos[i*3+2] = (Math.random()-0.5) * 6.0;
    }
    return pos;
  }, [viewport]);

  useFrame((state) => {
    if (!shaderRef.current) return;
    
    const h = handRef.current;
    const wx = (h.x - 0.5) * viewport.width;
    const wy = -(h.y - 0.5) * viewport.height;
    
    const u = shaderRef.current.uniforms;
    u.uTime.value = state.clock.getElapsedTime();
    
    // Physics
    u.uHand.value.x += (wx - u.uHand.value.x) * 0.2;
    u.uHand.value.y += (wy - u.uHand.value.y) * 0.2;
    u.uHand.value.z = h.isPinching ? 1.0 : 0.0;
    u.uHand.value.w = h.pinchStrength;
    
    // Config Smoothing
    u.uBaseColor.value.lerp(new THREE.Color(config.baseColor), 0.04);
    u.uHighlightColor.value.lerp(new THREE.Color(config.highlightColor), 0.04);
    u.uParticleSize.value = config.particleSize;
    u.uFlowSpeed.value = config.flowSpeed;
    u.uChaos.value = config.chaos;
    u.uGlow.value = config.glow;
    u.uForceStrength.value = config.forceStrength;
    
    // Reaction State Smoothing
    u.uReaction.value += (reactionState - u.uReaction.value) * 0.1;
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uHand: { value: new THREE.Vector4(0,0,0,0) },
    uBaseColor: { value: new THREE.Color(config.baseColor) },
    uHighlightColor: { value: new THREE.Color(config.highlightColor) },
    uParticleSize: { value: config.particleSize },
    uFlowSpeed: { value: config.flowSpeed },
    uChaos: { value: config.chaos },
    uGlow: { value: config.glow },
    uForceStrength: { value: config.forceStrength },
    uReaction: { value: 0.0 }
  }), []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={particles} itemSize={3} />
        <bufferAttribute attach="attributes-initialPosition" count={count} array={particles} itemSize={3} />
      </bufferGeometry>
      <shaderMaterial 
        ref={shaderRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const FluidCanvas: React.FC<{
  handRef: React.MutableRefObject<HandData>;
  config: FluidConfig;
  reactionState?: number;
  onCanvasCreated: (canvas: HTMLCanvasElement) => void;
}> = ({ handRef, config, reactionState = 0, onCanvasCreated }) => {
  return (
    <div className="absolute inset-0 z-0 bg-black">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, antialias: false }}
        onCreated={({ gl }) => onCanvasCreated(gl.domElement)}
      >
        <Particles handRef={handRef} config={config} reactionState={reactionState} />
        <SpellTrail handRef={handRef} />
        <HandCursor handRef={handRef} />
      </Canvas>
    </div>
  );
};

export default FluidCanvas;