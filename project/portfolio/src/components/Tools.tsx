import { motion } from 'framer-motion'
import {
  FaReact,
  FaNodeJs,
  FaDocker,
  FaAws,
  FaGitAlt,
  FaDatabase,
  FaServer,
  FaCode,
} from 'react-icons/fa'

export default function Tools() {
  const tools = [
    {
      name: 'React',
      icon: FaReact,
      description: 'Frontend development with React and TypeScript',
    },
    {
      name: 'Node.js',
      icon: FaNodeJs,
      description: 'Backend development with Node.js and Express',
    },
    {
      name: 'Docker',
      icon: FaDocker,
      description: 'Containerization and microservices architecture',
    },
    {
      name: 'AWS',
      icon: FaAws,
      description: 'Cloud infrastructure and services on AWS',
    },
    {
      name: 'Git',
      icon: FaGitAlt,
      description: 'Version control and CI/CD pipelines',
    },
    {
      name: 'Databases',
      icon: FaDatabase,
      description: 'SQL and NoSQL database management',
    },
    {
      name: 'DevOps',
      icon: FaServer,
      description: 'Infrastructure as Code and automation',
    },
    {
      name: 'TypeScript',
      icon: FaCode,
      description: 'Type-safe JavaScript development',
    },
  ]

  return (
    <div className="py-12">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold text-center mb-8"
      >
        Development Tools & Technologies
      </motion.h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tools.map((tool, index) => (
          <motion.div
            key={tool.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-dark-light p-6 rounded-lg hover:bg-dark transition-colors"
          >
            <tool.icon className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">{tool.name}</h3>
            <p className="text-gray-400">{tool.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
} 