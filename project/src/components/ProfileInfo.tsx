import { motion } from 'framer-motion';

const ProfileInfo = () => {
  return (
    <div className="flex flex-col items-center space-y-4">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        {/* Animated background gradient */}
        <motion.div
          className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full blur opacity-75"
          animate={{
            rotate: 360,
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }}
        />
        
        {/* Main profile picture container */}
        <div className="relative rounded-full overflow-hidden border-4 border-white/10 backdrop-blur-sm">
          <motion.img
            src="/profile.jpg"
            alt="Gabriel"
            className="w-48 h-48 object-cover"
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.3 }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/assets/profile.jpg';
            }}
          />
          
          {/* Artistic overlay effects */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          />
          
          {/* Animated border dots */}
          <motion.div
            className="absolute -inset-2 border-2 border-dashed border-white/30 rounded-full"
            animate={{
              rotate: 360,
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </div>

        {/* Floating particles */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white/30 rounded-full"
            initial={{
              x: 0,
              y: 0,
              scale: 0,
              opacity: 0,
            }}
            animate={{
              x: [0, 50, 0],
              y: [0, -50, 0],
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeInOut",
            }}
            style={{
              left: `${30 + i * 20}%`,
              top: `${30 + i * 20}%`,
            }}
          />
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-center"
      >
        <motion.h2 
          className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.3 }}
        >
          Gabriel Okom
        </motion.h2>
        <motion.p 
          className="text-gray-300 text-lg"
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.3 }}
        >
          Senior DevOps Engineer
        </motion.p>
      </motion.div>
    </div>
  );
};

export default ProfileInfo; 