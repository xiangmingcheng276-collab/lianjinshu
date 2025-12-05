import React from 'react';

export interface FluidConfig {
  name?: string; 
  description?: string;
  baseColor: string;
  highlightColor: string;
  particleSize: number;
  viscosity: number;     // 0.5 (water) -> 0.99 (tar)
  forceStrength: number; // Reaction to movement
  flowSpeed: number;     // How fast the noise moves
  chaos: number;         // Noise scale/frequency
  glow: number;          // Bloom intensity
}

export interface HandData {
  x: number;      // 0-1
  y: number;      // 0-1
  z: number;
  isPinching: boolean;
  pinchStrength: number;
  active: boolean;
}

export interface AlchemyElement {
  id: string;
  name: string;
  color: string;
  icon: React.ReactNode;
  x: number; 
  y: number; 
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}