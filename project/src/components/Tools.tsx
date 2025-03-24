import React from 'react'
import { motion } from 'framer-motion'

interface Tool {
  name: string
  icon: React.ReactNode
  description: string
  proficiency?: number
  tags?: string[]
  link?: string
}

const tools: Tool[] = [
  {
    name: 'Docker',
    icon: '🐳',
    description: 'Container platform for building, shipping, and running applications',
    proficiency: 90
  },
  {
    name: 'Kubernetes',
    icon: '⚙️',
    description: 'Container orchestration platform for scaling and managing applications',
    proficiency: 85
  },
  {
    name: 'AWS',
    icon: '☁️',
    description: 'Cloud computing platform for building and deploying applications',
    proficiency: 88
  },
  {
    name: 'Jenkins',
    icon: '🔧',
    description: 'Continuous Integration and Continuous Deployment automation server',
    proficiency: 85
  },
  {
    name: 'Terraform',
    icon: '🏗️',
    description: 'Infrastructure as Code tool for building and managing cloud resources',
    proficiency: 90
  },
  {
    name: 'Ansible',
    icon: '🤖',
    description: 'Automation tool for configuration management and application deployment',
    proficiency: 85
  },
  {
    name: 'Prometheus',
    icon: '📊',
    description: 'Monitoring and alerting toolkit for cloud-native applications',
    proficiency: 80
  },
  {
    name: 'Grafana',
    icon: '📈',
    description: 'Data visualization and analytics platform',
    proficiency: 85
  }
]

const Tools = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">DevOps Tools</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Technologies and tools I work with
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool, index) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300"
            >
              <div className="text-4xl mb-4">{tool.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {tool.name}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {tool.description}
              </p>
              {tool.proficiency && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${tool.proficiency}%` }}
                  ></div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Tools 