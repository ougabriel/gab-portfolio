import { motion } from 'framer-motion';

interface Project {
  title: string;
  description: string;
  technologies: string[];
  link: string;
  date: string;
  readTime: string;
}

const projects: Project[] = [
  {
    title: "Deploy 'DeepSeek AI' using OLLAMA API on your Azure Windows Server",
    description: "In this project, we are going to run our own local copy of the most current and trending AI model DeepSeek. Since DeepSeek is OpenSource, we'll explore how to deploy it on Azure Windows Server using the OLLAMA API.",
    technologies: ["Azure", "AI", "Windows Server", "OLLAMA", "DevOps"],
    link: "https://ougabriel.medium.com/deploy-deepseek-ai-using-ollama-api-on-your-azure-windows-server",
    date: "Jan 29, 2024",
    readTime: "8 min read"
  },
  {
    title: "CI/CD Pipeline: Deploy Python App with Healthcheck Endpoint on AWS EKS using Terraform & GitHub",
    description: "A comprehensive guide on setting up a production-ready CI/CD pipeline to deploy a Python application with healthcheck endpoint on AWS EKS using Terraform and GitHub Actions.",
    technologies: ["AWS", "EKS", "Terraform", "GitHub Actions", "Python", "Kubernetes"],
    link: "https://ougabriel.medium.com/cicd-pipeline-deploy-python-app-with-healthcheck-endpoint-on-aws-eks-using-terraform-github",
    date: "Nov 4, 2023",
    readTime: "10 min read"
  },
  {
    title: "CI/CD Project: Deploy a Python App with /healthcheck Endpoint on Docker, ECR, Kubernetes",
    description: "A step-by-step guide to deploying a Python application with healthcheck endpoint using Docker, Amazon ECR, and Kubernetes, including best practices for containerization and orchestration.",
    technologies: ["Docker", "ECR", "Kubernetes", "Python", "CI/CD", "AWS"],
    link: "https://ougabriel.medium.com/cicd-project-deploy-a-python-app-with-healthcheck-endpoint-on-docker-ecr-kubernetes",
    date: "Nov 3, 2023",
    readTime: "12 min read"
  },
  {
    title: "How I Secured Data at Rest, Data On-Transit and Data In-Use on AWS",
    description: "A detailed walkthrough of implementing comprehensive data security measures on AWS, covering encryption, secure transmission, and data protection best practices.",
    technologies: ["AWS", "Security", "Encryption", "Data Protection", "DevOps"],
    link: "https://ougabriel.medium.com/how-i-secured-data-at-rest-data-on-transit-and-data-in-use-on-aws",
    date: "Oct 8, 2023",
    readTime: "12 min read"
  },
  {
    title: "CICD PROJECT: Production Level Blog APP Deployment using EKS, Nexus, SonarQube, Trivy",
    description: "A production-grade deployment project showcasing the integration of various DevOps tools including Jenkins, SonarQube, Nexus, and Trivy for a blog application deployment on EKS.",
    technologies: ["EKS", "Jenkins", "SonarQube", "Nexus", "Trivy", "Kubernetes"],
    link: "https://ougabriel.medium.com/cicd-project-production-level-blog-app-deployment-using-eks-nexus-sonarqube-trivy",
    date: "Sep 19, 2023",
    readTime: "15 min read"
  },
  {
    title: "CI/CD Project: Deploy a 3-tier Microservice Voting App using ArgoCD and Azure DevOps Pipeline",
    description: "A hands-on project demonstrating the deployment of a complex 3-tier microservice voting application using ArgoCD and Azure DevOps for continuous delivery.",
    technologies: ["ArgoCD", "Azure DevOps", "Microservices", "Kubernetes", "CI/CD"],
    link: "https://ougabriel.medium.com/cicd-project-deploy-a-3-tier-microservice-voting-app-using-argocd-and-azure-devops-pipeline",
    date: "Sep 5, 2023",
    readTime: "12 min read"
  },
  {
    title: "DevOps Engineer Scenario and Use Case — Day to Day Activities on the Job",
    description: "A comprehensive guide detailing the daily activities and responsibilities of a DevOps Engineer, including real-world scenarios and best practices.",
    technologies: ["DevOps", "CI/CD", "Cloud", "Automation", "Best Practices"],
    link: "https://ougabriel.medium.com/devops-engineer-scenario-and-use-case-day-to-day-activities-on-the-job",
    date: "Aug 21, 2023",
    readTime: "10 min read"
  },
  {
    title: "How to Dockerize a Python App for your Kubernetes Cluster",
    description: "A practical guide on containerizing Python applications for Kubernetes deployment, including best practices for Docker configuration and Kubernetes integration.",
    technologies: ["Docker", "Kubernetes", "Python", "AWS EC2", "Containerization"],
    link: "https://ougabriel.medium.com/how-to-dockerize-a-python-app-for-your-kubernetes-cluster",
    date: "Jun 26, 2023",
    readTime: "10 min read"
  },
  {
    title: "How to Deploy Kubernetes Cluster in 60-Seconds using KinD Distro on Ubuntu EC2 Instance",
    description: "A quick and efficient guide to deploying a Kubernetes cluster using KinD (Kubernetes in Docker) on an Ubuntu EC2 instance, perfect for development and testing environments.",
    technologies: ["Kubernetes", "KinD", "AWS EC2", "Ubuntu", "DevOps"],
    link: "https://ougabriel.medium.com/how-to-deploy-kubernetes-cluster-in-60-seconds-using-kind-distro-on-ubuntu-ec2-instance",
    date: "May 23, 2023",
    readTime: "7 min read"
  }
];

const Project = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-12"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Technical Articles & Projects</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-6">
            Transforming Complex Technical Challenges into Scalable Solutions
          </p>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            As a DevOps Engineer, I specialize in architecting robust, scalable solutions that drive business growth. 
            My expertise in cloud infrastructure, automation, and containerization helps organizations achieve:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Production-Grade Deployments</h3>
              <p className="text-gray-600 dark:text-gray-300">Using modern CI/CD tools and best practices</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Cloud-Native Solutions</h3>
              <p className="text-gray-600 dark:text-gray-300">Leveraging AWS and Azure for scalable infrastructure</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Security-First Approach</h3>
              <p className="text-gray-600 dark:text-gray-300">Implementing comprehensive security measures</p>
            </div>
          </div>
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
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{project.date}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{project.readTime}</span>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">
                  {project.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {project.description}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded-full text-sm"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  Read on Medium
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
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </a>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="https://ougabriel.medium.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
          >
            View All Articles on Medium
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
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </a>
        </div>
      </div>
    </motion.div>
  );
};

export default Project; 