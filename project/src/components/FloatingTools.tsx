import { motion } from 'framer-motion';

const tools = [
  { name: 'Docker', icon: '🐳' },
  { name: 'Kubernetes', icon: '⚙️' },
  { name: 'AWS', icon: '☁️' },
  { name: 'Git', icon: '📦' },
  { name: 'Jenkins', icon: '⚡' },
  { name: 'Terraform', icon: '🏗️' },
  { name: 'Ansible', icon: '🤖' },
  { name: 'Prometheus', icon: '📊' },
  { name: 'Grafana', icon: '📈' },
  { name: 'ELK Stack', icon: '🔍' },
];

const FloatingTools = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {tools.map((tool, index) => (
        <motion.div
          key={tool.name}
          className="absolute flex items-center justify-center w-24 h-24 glass-effect rounded-2xl"
          style={{
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          }}
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            scale: 0,
            opacity: 0,
          }}
          animate={{
            x: [
              Math.random() * window.innerWidth * 0.7,
              Math.random() * window.innerWidth * 0.7,
              Math.random() * window.innerWidth * 0.7,
            ],
            y: [
              Math.random() * window.innerHeight * 0.7,
              Math.random() * window.innerHeight * 0.7,
              Math.random() * window.innerHeight * 0.7,
            ],
            rotate: [0, 180, 360],
            scale: [1, 1.1, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear",
            delay: index * 2,
          }}
        >
          <span 
            className="text-5xl relative z-10" 
            style={{ 
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
              transform: 'translateZ(20px)',
            }} 
            title={tool.name}
          >
            {tool.icon}
          </span>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 rounded-2xl animate-glow" />
        </motion.div>
      ))}
    </div>
  );
};

export default FloatingTools; 