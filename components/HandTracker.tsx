import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandData } from '../types';

interface HandTrackerProps {
  onHandUpdate: (data: HandData) => void;
  onCameraReady: () => void;
}

const HandTracker: React.FC<HandTrackerProps> = ({ onHandUpdate, onCameraReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const lastVideoTime = useRef(-1);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    let active = true;

    const setupMediaPipe = async () => {
      try {
        // Ensure this version matches the package version in index.html exactly
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        if (!active) return;

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        if (active) startWebcam();
      } catch (err) {
        console.error("MediaPipe Init Error:", err);
        setError("Failed to initialize vision.");
      }
    };

    setupMediaPipe();

    return () => {
      active = false;
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWebcam = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser API not supported");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user" 
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          videoRef.current?.play().catch(e => console.error("Play error", e));
          onCameraReady();
          predictWebcam();
        };
      }
    } catch (err) {
      console.error("Webcam Error:", err);
      setError("Camera access denied.");
    }
  };

  const predictWebcam = () => {
    if (handLandmarkerRef.current && videoRef.current) {
      const startTimeMs = performance.now();
      
      // Ensure video is playing and has data
      if (videoRef.current.currentTime !== lastVideoTime.current && !videoRef.current.paused && !videoRef.current.ended) {
        lastVideoTime.current = videoRef.current.currentTime;
        
        try {
          const results = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

          if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            
            // Index Tip (8)
            const indexTip = landmarks[8];
            // Thumb Tip (4)
            const thumbTip = landmarks[4];

            // Calculate Pinch (Distance between thumb and index)
            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Thresholds for pinch
            const pinchThreshold = 0.05; 
            const isPinching = distance < pinchThreshold;
            const pinchStrength = Math.max(0, Math.min(1, 1 - (distance / 0.15)));

            onHandUpdate({
              x: 1 - indexTip.x, // Mirror X for natural feel
              y: indexTip.y,
              z: indexTip.z,
              isPinching,
              pinchStrength,
              active: true
            });
          } else {
            onHandUpdate({ x: 0.5, y: 0.5, z: 0, isPinching: false, pinchStrength: 0, active: false });
          }
        } catch (e) {
          console.warn("Detection error", e);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    // CRITICAL FIX: Use opacity-0 instead of hidden/display:none. 
    // display:none often prevents the browser from updating the video texture for WebGL/AI processing.
    <div className="absolute top-0 left-0 w-1 h-1 overflow-hidden opacity-0 pointer-events-none">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export default HandTracker;