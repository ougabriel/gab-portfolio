import React from 'react';

const Background: React.FC = () => {
  return (
    <div className="fixed inset-0 w-full h-full -z-10">
      {/* Static gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0118] via-[#1a0b2e] to-[#261230]" />
      
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 animate-gradient opacity-40" />
      
      {/* Gradient orbs */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-[120px] animate-glow" />
        <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-[100px] animate-float" style={{ animationDelay: '-4s' }} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 blur-[100px] animate-float" style={{ animationDelay: '-2s' }} />
      </div>
      
      {/* Grid overlay */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />
    </div>
  );
};

export default Background; 