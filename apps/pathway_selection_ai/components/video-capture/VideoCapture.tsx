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
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                }
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

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            if (onStreamChange) onStreamChange(null);
        }
    };

    return (
        <div className="relative h-full w-full rounded-[2rem] border border-white/10 bg-slate-950 overflow-hidden shadow-2xl flex flex-col items-center justify-center min-h-[220px]">
            {error ? (
                <div className="text-center p-4 space-y-2">
                    <CameraOff className="h-8 w-8 mx-auto text-red-400 animate-pulse" />
                    <p className="text-xs text-red-200 font-medium">{error}</p>
                </div>
            ) : stream ? (
                <>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover scale-x-[-1]"
                    />
                    <div className="absolute top-4 left-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        Feed Active
                    </div>
                    {/* Simulated eye contact box for premium aesthetic */}
                    <div className="absolute inset-0 border-[2px] border-cyan-400/25 pointer-events-none rounded-[2rem] m-6 animate-pulse"></div>
                    <div className="absolute bottom-4 right-4 bg-slate-900/80 border border-white/5 text-[9px] text-slate-400 px-2 py-1 rounded-md backdrop-blur-sm">
                        FPS: 30 | 720p
                    </div>
                </>
            ) : (
                <div className="text-center p-4 space-y-2">
                    <Video className="h-8 w-8 mx-auto text-slate-500 animate-pulse" />
                    <p className="text-xs text-slate-400">Camera offline. Start session to enable.</p>
                </div>
            )}
        </div>
    );
}
