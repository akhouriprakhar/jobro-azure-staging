'use client';

import { motion } from 'framer-motion';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = 'Loading workspace...' }: LoadingScreenProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-transparent px-4 text-[#2C3454] overflow-hidden">
      {/* Grid overlay for subtle texture */}
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.2]"></div>
      
      <div className="relative z-10 flex flex-col items-center">
        {/* Halo Effect Container */}
        <div className="relative flex items-center justify-center">
          {/* Outer Pulsing Glow (Halo) */}
          <motion.div
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.05, 0.15, 0.05],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute h-44 w-44 rounded-full bg-gradient-to-tr from-[#00917C] to-[#150E56] blur-3xl"
          />

          {/* Inner Sharp Halo Ring */}
          <motion.div
            animate={{
              rotate: 360,
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute h-36 w-36 rounded-full border-2 border-dashed border-[#00917C]/20"
          />

          {/* Logo container with breathing animation */}
          <motion.div
            animate={{
              scale: [0.95, 1.05, 0.95],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="relative h-28 w-28 overflow-hidden rounded-[2.5rem] border border-[#150E56]/10 bg-white shadow-clay flex items-center justify-center"
          >
            <img
              src="/JoBro-colorful.png"
              alt="JoBro Logo"
              className="h-full w-full object-contain p-2"
            />
          </motion.div>
        </div>

        {/* Loading text with slide up and fade */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-8 text-center text-xs font-bold uppercase tracking-[0.25em] text-[#150E56]"
        >
          {message}
        </motion.p>

        {/* Sleek dynamic progress bar */}
        <div className="mt-4 h-[3px] w-48 overflow-hidden rounded-full bg-[#150E56]/10">
          <motion.div
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="h-full w-1/2 bg-gradient-to-r from-[#00917C] to-[#150E56]"
          />
        </div>
      </div>
    </div>
  );
}
