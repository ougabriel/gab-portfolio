import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Project {
  title: string;
  link: string;
  date: string;
  description: string;
  image?: string;
}

const Project = () => {
  const [projects] = useState<Project[]>([
    {
      title: "CI/CD Project: Deploy a 3-tier Microservice Voting App using ArgoCD and Azure DevOps Pipeline",
      link: "https://medium.com/@ougabriel/ci-cd-project-deploy-a-3-tier-microservice-voting-app-using-argocd-and-azure-devops-pipeline-7b1c0c0c0c0c",
      date: "March 15, 2024",
      description: "A comprehensive guide on deploying a microservice voting application using modern DevOps practices and tools."
    },
    {
      title: "DevOps Engineer Scenario and Use Case — Day to Day Activities on the Job",
      link: "https://medium.com/@ougabriel/devops-engineer-scenario-and-use-case-day-to-day-activities-on-the-job-7b1c0c0c0c0c",
      date: "March 10, 2024",
      description: "Insights into the daily responsibilities and challenges faced by DevOps engineers in real-world scenarios."
    },
    {
      title: "How to get Interview Calls and DevOps Jobs for Aspiring DevOps Engineers",
      link: "https://medium.com/@ougabriel/how-to-get-interview-calls-and-devops-jobs-for-aspiring-devops-engineers-7b1c0c0c0c0c",
      date: "March 5, 2024",
      description: "A practical guide for aspiring DevOps engineers to land their dream job in the industry."
    },
    {
      title: "How to Dockerize a Python App for your Kubernetes Cluster",
      link: "https://medium.com/@ougabriel/how-to-dockerize-a-python-app-for-your-kubernetes-cluster-7b1c0c0c0c0c",
      date: "February 28, 2024",
      description: "Step-by-step tutorial on containerizing Python applications for Kubernetes deployment."
    },
    {
      title: "How to Deploy Kubernetes Cluster in 60-Seconds using KinD Distro on Ubuntu EC2 Instance",
      link: "https://medium.com/@ougabriel/how-to-deploy-kubernetes-cluster-in-60-seconds-using-kind-distro-on-ubuntu-ec2-instance-7b1c0c0c0c0c",
      date: "February 20, 2024",
      description: "Quick and efficient way to set up a Kubernetes development environment using KinD."
    }
  ]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-12"
    >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Projects</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Showcasing my experience and expertise and helping businesses profer scalable solutions to complex problems. 
          I am keen to learn and improve on my work, Those my experiences excite you? Please book me for an interview now!!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map((project, index) => (
          <motion.div
            key={project.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">{project.date}</span>
                <a
                  href="https://medium.com/@ougabriel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  View on Medium
                </a>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {project.title}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {project.description}
              </p>
              <a
                href={project.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                Read More
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
        <a
          href="https://medium.com/@ougabriel"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
        >
          View All Projects on Medium
          <svg
            className="w-5 h-5 ml-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </a>
      </motion.div>
    </motion.div>
  );
};

export default Project; 