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

// Sample data
const toolsByCategory: Record<string, Tool[]> = {
  'Containerization & Orchestration': [
    {
      name: 'Docker',
      icon: '🐳',
      description: 'Containerization platform for building, shipping, and running applications',
      proficiency: 90,
      tags: ['Containers', 'DevOps', 'Microservices'],
      link: 'https://www.docker.com',
    },
    {
      name: 'Kubernetes',
      icon: '⚙️',
      description: 'Container orchestration platform for scaling and managing applications',
      proficiency: 85,
      tags: ['Orchestration', 'DevOps', 'Cloud Native'],
      link: 'https://kubernetes.io',
    },
  ],
  'Cloud Platforms': [
    {
      name: 'AWS',
      icon: '☁️',
      description: 'Leading cloud computing platform with comprehensive services',
      proficiency: 88,
      tags: ['Cloud', 'IaaS', 'PaaS'],
      link: 'https://aws.amazon.com',
    },
    {
      name: 'Azure',
      icon: '📊',
      description: 'Microsoft\'s cloud platform for modern applications',
      proficiency: 75,
      tags: ['Cloud', 'Microsoft', 'Enterprise'],
      link: 'https://azure.microsoft.com',
    },
  ],
  'CI/CD & Automation': [
    {
      name: 'Jenkins',
      icon: '🔧',
      description: 'Open-source automation server for CI/CD pipelines',
      proficiency: 92,
      tags: ['CI/CD', 'Automation', 'DevOps'],
      link: 'https://www.jenkins.io',
    },
    {
      name: 'GitLab CI',
      icon: '🦊',
      description: 'Complete DevOps platform with built-in CI/CD',
      proficiency: 80,
      tags: ['CI/CD', 'DevOps', 'Version Control'],
      link: 'https://gitlab.com',
    },
  ],
  'Infrastructure as Code': [
    {
      name: 'Terraform',
      icon: '🏗️',
      description: 'Infrastructure as Code tool for cloud resources',
      proficiency: 95,
      tags: ['IaC', 'Cloud', 'Automation'],
      link: 'https://www.terraform.io',
    },
    {
      name: 'Ansible',
      icon: '🤖',
      description: 'Automation tool for configuration management',
      proficiency: 85,
      tags: ['Configuration', 'Automation', 'DevOps'],
      link: 'https://www.ansible.com',
    },
  ],
}

const certifications = [
  {
    name: 'AWS Certified Solutions Architect',
    issuer: 'Amazon Web Services',
    date: 'March 2024',
    image: 'https://d1.awsstatic.com/training-and-certification/certification-badges/AWS-Certified-Solutions-Architect-Associate_badge.3419559c682629072f1eb968d59dea0741772c0f.png',
    link: '#',
  },
  {
    name: 'Certified Kubernetes Administrator',
    issuer: 'Cloud Native Computing Foundation',
    date: 'January 2024',
    image: 'https://www.cncf.io/wp-content/uploads/2021/09/kubernetes-cka-color.png',
    link: '#',
  },
  {
    name: 'HashiCorp Certified: Terraform Associate',
    issuer: 'HashiCorp',
    date: 'December 2023',
    image: 'https://www.datocms-assets.com/2885/1620155116-brandhcterraformverticalcolor.svg',
    link: '#',
  },
]

export default Tools 