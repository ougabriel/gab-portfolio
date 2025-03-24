import React from 'react'
import { motion } from 'framer-motion'
import FloatingTools from './FloatingTools'
import Background from './Background'

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0118] relative">
      {/* Background */}
      <Background />

      {/* Main Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="min-h-screen flex items-center justify-center">
          {/* Profile Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative w-48 h-48 mx-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full blur-2xl opacity-30 animate-pulse" />
            <div className="relative w-full h-full rounded-full overflow-hidden border-4 border-white/20">
              <img 
                src="/profile.jpg" 
                alt="Gabriel" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/assets/profile.jpg';
                }}
              />
            </div>
          </motion.div>
        </section>

        {/* Floating Tools */}
        <FloatingTools />
      </div>
    </div>
  )
}

export default Home 