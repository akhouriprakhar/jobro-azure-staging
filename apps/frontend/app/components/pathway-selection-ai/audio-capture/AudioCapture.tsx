"use client";

import React, { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";

interface AudioCaptureProps {
    isActive: boolean;
    onVolumeChange?: (volume: number) => void;
}

export default function AudioCapture({ isActive, onVolumeChange }: AudioCaptureProps) {
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!isActive) {
            setAudioLevel(0);
            return;
        }

        let audioContext: AudioContext | null = null;
        let analyser: AnalyserNode | null = null;
        let microphone: MediaStreamAudioSourceNode | null = null;
        let javascriptNode: ScriptProcessorNode | null = null;
        let stream: MediaStream | null = null;

        async function initAudio() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });

                audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                microphone = audioContext.createMediaStreamSource(stream);
                javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

                analyser.smoothingTimeConstant = 0.8;
                analyser.fftSize = 1024;

                microphone.connect(analyser);
                analyser.connect(javascriptNode);
                javascriptNode.connect(audioContext.destination);

                javascriptNode.onaudioprocess = () => {
                    const array = new Uint8Array(analyser!.frequencyBinCount);
                    analyser!.getByteFrequencyData(array);
                    let values = 0;

                    const length = array.length;
                    for (let i = 0; i < length; i++) {
                        values += array[i];
                    }

                    const average = values / length;
                    const normalized = Math.min(100, Math.round((average / 48) * 100));
                    setAudioLevel(normalized);
                    if (onVolumeChange) onVolumeChange(normalized);
                };
                setError(false);
            } catch (err) {
                console.error("Audio initialization failed:", err);
                setError(true);
            }
        }

        initAudio();

        return () => {
            if (javascriptNode) javascriptNode.disconnect();
            if (microphone) microphone.disconnect();
            if (audioContext) audioContext.close();
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [isActive]);

    return (
        <div className="flex items-center gap-4 bg-white/70 border border-[#150E56]/10 rounded-2xl p-4 shadow-clayBtn select-none backdrop-blur">
            <div className={`h-10 w-10 flex items-center justify-center rounded-xl transition ${isActive && !error ? "bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/20" : "bg-[#FFF6F0]/50 text-[#5C6485]"}`}>
                {isActive && !error ? <Mic className="h-5 w-5 animate-pulse" /> : <MicOff className="h-5 w-5" />}
            </div>
            <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-[#5C6485]">
                    <span>Microphone Stream</span>
                    <span className={isActive && !error ? "text-[#00917C]" : ""}>
                        {isActive && !error ? `${audioLevel}% Level` : error ? "No Access" : "Offline"}
                    </span>
                </div>
                <div className="h-2 w-full bg-[#FFF6F0] rounded-full overflow-hidden flex gap-0.5">
                    {/* Simulated decibel indicators for aesthetic enhancement */}
                    <div 
                        className="h-full bg-gradient-to-r from-[#00917C] to-[#150E56] transition-all duration-100 rounded-full" 
                        style={{ width: `${isActive ? audioLevel : 0}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
