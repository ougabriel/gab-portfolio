import React from 'react'
import { motion } from 'framer-motion'

interface Tool {
  name: string
  category: string
  icon: string
  description: string
}

const tools: Tool[] = [
  // Cloud & Infrastructure
  { name: 'AWS', category: 'Cloud & Infrastructure', icon: '☁️', description: 'Amazon Web Services' },
  { name: 'Azure', category: 'Cloud & Infrastructure', icon: '🌤️', description: 'Microsoft Azure' },
  { name: 'Terraform', category: 'Cloud & Infrastructure', icon: '🏗️', description: 'Infrastructure as Code' },
  { name: 'Helm', category: 'Cloud & Infrastructure', icon: '⚓', description: 'Kubernetes Package Manager' },
  { name: 'Ansible', category: 'Cloud & Infrastructure', icon: '⚙️', description: 'Configuration Management' },

  // Containerization & Orchestration
  { name: 'Docker', category: 'Containerization & Orchestration', icon: '🐳', description: 'Container Platform' },
  { name: 'Kubernetes', category: 'Containerization & Orchestration', icon: '⚙️', description: 'Container Orchestration' },
  { name: 'ArgoCD', category: 'Containerization & Orchestration', icon: '🔄', description: 'GitOps Continuous Delivery' },

  // CI/CD & DevOps
  { name: 'Jenkins', category: 'CI/CD & DevOps', icon: '⚡', description: 'Continuous Integration' },
  { name: 'Azure DevOps', category: 'CI/CD & DevOps', icon: '🔄', description: 'DevOps Platform' },
  { name: 'GitHub Actions', category: 'CI/CD & DevOps', icon: '⚡', description: 'Automated Workflows' },
  { name: 'Git', category: 'CI/CD & DevOps', icon: '📚', description: 'Version Control' },
  { name: 'JIRA', category: 'CI/CD & DevOps', icon: '📋', description: 'Project Management' },

  // Monitoring & Security
  { name: 'Prometheus', category: 'Monitoring & Security', icon: '📊', description: 'Monitoring System' },
  { name: 'Grafana', category: 'Monitoring & Security', icon: '📈', description: 'Visualization Platform' },
  { name: 'ELK Stack', category: 'Monitoring & Security', icon: '🔍', description: 'Log Management' },
  { name: 'Trivy', category: 'Monitoring & Security', icon: '🔒', description: 'Security Scanner' },
  { name: 'SonarQube', category: 'Monitoring & Security', icon: '🔍', description: 'Code Quality' },
  { name: 'Nexus', category: 'Monitoring & Security', icon: '📦', description: 'Artifact Repository' },

  // Scripting & Development
  { name: 'Python', category: 'Scripting & Development', icon: '🐍', description: 'Programming Language' },
  { name: 'Bash', category: 'Scripting & Development', icon: '💻', description: 'Shell Scripting' },
  { name: 'YAML', category: 'Scripting & Development', icon: '📝', description: 'Configuration Language' },

  // Operating Systems
  { name: 'Windows', category: 'Operating Systems', icon: '🪟', description: 'Windows OS' },
  { name: 'CentOS', category: 'Operating Systems', icon: '🐧', description: 'Linux Distribution' },
  { name: 'Ubuntu', category: 'Operating Systems', icon: '🐧', description: 'Linux Distribution' },

  // Web & Database
  { name: 'Apache Tomcat', category: 'Web & Database', icon: '🌐', description: 'Web Server' },
  { name: 'MySQL', category: 'Web & Database', icon: '🗄️', description: 'Database System' },
]

const Tools = () => {
  const categories = [...new Set(tools.map(tool => tool.category))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-12"
    >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">My Technical Arsenal</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300">Tools that I have used so far</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {categories.map((category, index) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300"
          >
            <div className="p-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                {category}
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {tools
                  .filter(tool => tool.category === category)
                  .map((tool, toolIndex) => (
                    <motion.div
                      key={tool.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: toolIndex * 0.05 }}
                      className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200"
                    >
                      <span className="text-2xl">{tool.icon}</span>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{tool.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{tool.description}</p>
                      </div>
                    </motion.div>
                  ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-12 text-center"
      >
        <p className="text-gray-600 dark:text-gray-300 italic">
          "The right tools in the right hands can create extraordinary results"
        </p>
      </motion.div>
    </motion.div>
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