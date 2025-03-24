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

interface Certification {
  name: string
  issuer: string
  date: string
  image: string
  link?: string
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

const certifications: Certification[] = [
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
    image: 'https://www.cncf.io/wp-content/uploads/2022/07/cka-color.png',
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

const Tools = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">DevOps Tools & Certifications</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Technologies and certifications I work with
          </p>
        </div>

        {/* Tools by Category */}
        <div className="space-y-12">
          {Object.entries(toolsByCategory).map(([category, categoryTools], categoryIndex) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: categoryIndex * 0.1 }}
            >
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categoryTools.map((tool: Tool, index: number) => (
                  <motion.div
                    key={tool.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
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
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${tool.proficiency}%` }}
                        ></div>
                      </div>
                    )}
                    {tool.tags && (
                      <div className="flex flex-wrap gap-2">
                        {tool.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {tool.link && (
                      <a
                        href={tool.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        Learn more
                        <svg
                          className="w-4 h-4 ml-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Certifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-16"
        >
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Certifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {certifications.map((cert: Certification, index: number) => (
              <motion.div
                key={cert.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300"
              >
                <img
                  src={cert.image}
                  alt={cert.name}
                  className="w-24 h-24 mx-auto mb-4"
                />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {cert.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  {cert.issuer}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {cert.date}
                </p>
                {cert.link && (
                  <a
                    href={cert.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    View certificate
                    <svg
                      className="w-4 h-4 ml-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Tools 