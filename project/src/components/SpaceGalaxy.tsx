import React from 'react'
import { motion } from 'framer-motion'

const SpaceGalaxy: React.FC = () => {
  // Generate random stars
  const stars = Array.from({ length: 150 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
  }))

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-black">
      {/* Nebula background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-blue-900/30 to-indigo-900/40"
        animate={{
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Stars */}
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
          }}
          animate={{
            opacity: [0.3, 0.9, 0.3],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Shooting stars */}
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={`shooting-star-${i}`}
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{
            x: ['0vw', '100vw'],
            y: ['0vh', '100vh'],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 4,
            delay: i * 2,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Nebula clouds */}
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at 30% 50%, rgba(147, 51, 234, 0.4), transparent 50%)',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.4, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at 70% 50%, rgba(59, 130, 246, 0.4), transparent 50%)',
        }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.3, 0.4, 0.3],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Milky Way effect */}
      <motion.div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(45deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)',
        }}
        animate={{
          x: ['-100%', '100%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  )
}

export default SpaceGalaxy 