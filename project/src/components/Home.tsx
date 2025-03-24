import React from 'react'
import { motion } from 'framer-motion'
import FloatingTools from './FloatingTools'
import Background from './Background'

interface Tool {
  name: string
  icon: string
  description: string
}

interface BlogPost {
  title: string
  date: string
  image: string
  excerpt: string
  href: string
}

const Home: React.FC = () => {
  const handleDownloadCV = () => {
    // Add your CV download logic here
    window.open('/cv.pdf', '_blank')
  }

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

// Sample data
const tools: Tool[] = [
  {
    name: 'Docker',
    icon: '🐳',
    description: 'Container platform for building, shipping, and running applications',
  },
  {
    name: 'Kubernetes',
    icon: '⚙️',
    description: 'Container orchestration platform for scaling and managing applications',
  },
  {
    name: 'AWS',
    icon: '☁️',
    description: 'Cloud computing platform for building and deploying applications',
  },
  {
    name: 'Jenkins',
    icon: '🔧',
    description: 'Continuous Integration and Continuous Deployment automation server',
  },
  {
    name: 'Terraform',
    icon: '🏗️',
    description: 'Infrastructure as Code tool for building and managing cloud resources',
  },
  {
    name: 'Ansible',
    icon: '🤖',
    description: 'Automation tool for configuration management and application deployment',
  },
]

const blogPosts: BlogPost[] = [
  {
    title: 'Implementing Zero-Trust Security in Kubernetes',
    date: '2024-03-15',
    image: 'https://picsum.photos/800/450',
    excerpt: 'Learn how to implement a zero-trust security model in your Kubernetes clusters...',
    href: '/blog/zero-trust-kubernetes',
  },
  {
    title: 'Scaling Microservices with AWS ECS',
    date: '2024-03-10',
    image: 'https://picsum.photos/800/451',
    excerpt: 'A comprehensive guide to scaling microservices using Amazon ECS...',
    href: '/blog/scaling-microservices-ecs',
  },
]

export default Home 