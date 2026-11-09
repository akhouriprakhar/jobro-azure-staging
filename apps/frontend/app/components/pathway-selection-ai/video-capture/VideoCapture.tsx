"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Video } from "lucide-react";

interface VideoCaptureProps {
    isActive: boolean;
    onStreamChange?: (stream: MediaStream | null) => void;
}

export default function VideoCapture({ isActive, onStreamChange }: VideoCaptureProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive) {
            stopStream();
            return;
        }

        async function startStream() {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
                setStream(s);
                setError(null);
                if (onStreamChange) onStreamChange(s);
            } catch (err) {
                console.error("Camera acquisition failed:", err);
                setError("Unable to locate active camera feed. Verify permissions.");
            }
        }
        startStream();

        return () => {
            stopStream();
        };
    }, [isActive]);

    // Bind stream once the video element is mounted in the DOM
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, videoRef]);

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            if (onStreamChange) onStreamChange(null);
        }
    };

    return (
        <div className="relative h-full w-full bg-[#FFF6F0]/50 overflow-hidden flex flex-col items-center justify-center">
            {error ? (
                <div className="text-center p-4 space-y-2">
                    <CameraOff className="h-8 w-8 mx-auto text-[#150E56] animate-pulse" />
                    <p className="text-xs text-[#150E56] font-bold">{error}</p>
                </div>
            ) : stream ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover scale-x-[-1]"
                />
            ) : (
                <div className="text-center p-4 space-y-2">
                    <Video className="h-8 w-8 mx-auto text-[#5C6485] animate-pulse" />
                    <p className="text-xs text-[#5C6485] font-semibold">Camera offline. Start session to enable.</p>
                </div>
            )}
        </div>
    );
}
