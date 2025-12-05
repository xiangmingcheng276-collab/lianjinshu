import { GoogleGenAI, Type } from "@google/genai";
import { FluidConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const DEFAULT_ELEMENT: FluidConfig = {
  name: "Liquid Void",
  description: "A dark, primordial ocean waiting for creation.",
  baseColor: "#1e1b4b", // Indigo-950
  highlightColor: "#6366f1", // Indigo-500
  particleSize: 2.0,
  viscosity: 0.92,
  forceStrength: 2.0,
  flowSpeed: 0.3,
  chaos: 0.5,
  glow: 1.0
};

// Helper for schema
const FLUID_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    baseColor: { type: Type.STRING },
    highlightColor: { type: Type.STRING },
    particleSize: { type: Type.NUMBER },
    viscosity: { type: Type.NUMBER },
    forceStrength: { type: Type.NUMBER },
    flowSpeed: { type: Type.NUMBER },
    chaos: { type: Type.NUMBER },
    glow: { type: Type.NUMBER },
  },
  required: ["name", "baseColor", "highlightColor", "particleSize", "viscosity", "forceStrength", "flowSpeed", "chaos", "glow"]
};

export const generateElementalRecipe = async (prompt: string): Promise<FluidConfig> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Invent a digital fluid: "${prompt}". Define visual/physics properties.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: FLUID_SCHEMA
      }
    });

    if (response.text) return { ...DEFAULT_ELEMENT, ...JSON.parse(response.text) };
    return DEFAULT_ELEMENT;
  } catch (error) {
    console.error("Gen Error:", error);
    return DEFAULT_ELEMENT;
  }
};

export const mixFluids = async (current: FluidConfig, ingredient: string): Promise<FluidConfig> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `I am mixing the element "${ingredient}" into a fluid called "${current.name}".
      Current properties: Viscosity ${current.viscosity}, Chaos ${current.chaos}.
      
      Generate the RESULTING fluid properties.
      Example: "Water" + "Fire" = "Boiling Plasma" (High chaos, Red/White, Fast).
      Example: "Void" + "Life" = "Bioluminescent Gel" (Green/Blue, Slow, Glow).
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: FLUID_SCHEMA
      }
    });

    if (response.text) return { ...DEFAULT_ELEMENT, ...JSON.parse(response.text) };
    return DEFAULT_ELEMENT;
  } catch (error) {
    console.error("Mix Error:", error);
    return current;
  }
};

export const decipherElement = async (imageBase64: string): Promise<string> => {
  try {
    const data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: data } },
          { text: "Analyze this fluid art. Describe it as a magical substance. 2 sentences max." }
        ]
      }
    });
    return response.text || "The vision is unclear.";
  } catch (error) {
    return "The scrying glass is clouded.";
  }
};