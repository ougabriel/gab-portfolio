import { motion } from 'framer-motion';

const HireMe = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-12 max-w-4xl"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">GABRIEL OKOM</h1>
          <p className="text-gray-600 dark:text-gray-300">London, SE6 3LE ENG</p>
          <p className="text-gray-600 dark:text-gray-300">ougabriel@gmail.com</p>
          <p className="text-gray-600 dark:text-gray-300">Portfolio Website</p>
        </div>

        {/* Summary */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">SUMMARY</h2>
          <p className="text-gray-700 dark:text-gray-300">
            I am a Senior DevOps Engineer with a growth mindset and a passion for continuous improvement, I excel in aligning 
            technology solutions with business objectives to deliver reliable and scalable applications. With my proven ability to 
            implement robust security practices, I can help ensure a secure and efficient application deployment environment.
          </p>
        </section>

        {/* Skills */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">SKILLS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-gray-700 dark:text-gray-300">• Versioning Tools - GIT</p>
              <p className="text-gray-700 dark:text-gray-300">• CICD - Jenkins, Azure DevOps, GitActions</p>
              <p className="text-gray-700 dark:text-gray-300">• Ticket Tracking Tool - JIRA</p>
              <p className="text-gray-700 dark:text-gray-300">• Containerization Tool - Docker, Kubernetes</p>
              <p className="text-gray-700 dark:text-gray-300">• Operating System - Windows, Centos, Ubuntu</p>
              <p className="text-gray-700 dark:text-gray-300">• Sec: ArgoCD, Trivy, SonarQube, Nexus</p>
            </div>
            <div className="space-y-2">
              <p className="text-gray-700 dark:text-gray-300">• Cloud: AWS, Azure</p>
              <p className="text-gray-700 dark:text-gray-300">• Scripting Language: YAML, Bash, and Python</p>
              <p className="text-gray-700 dark:text-gray-300">• Web server - Apache Tomcat</p>
              <p className="text-gray-700 dark:text-gray-300">• Database - MySQL</p>
              <p className="text-gray-700 dark:text-gray-300">• Monitoring Tool - ELK, Prometheus, Grafana</p>
              <p className="text-gray-700 dark:text-gray-300">• IaC – Terraform, Helm</p>
              <p className="text-gray-700 dark:text-gray-300">• Config - Ansible</p>
            </div>
          </div>
        </section>

        {/* Experience */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">EXPERIENCE</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">DevOps Engineer</h3>
              <p className="text-gray-600 dark:text-gray-400">Green Culture Media and Tech Ltd | 11/2022 to Current</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>Architected and deployed NGINX Ingress Controllers for Kubernetes environments, optimizing load balancing and traffic management, and achieving a 99.99% uptime for critical applications</li>
                <li>Created and maintained 20+ Ansible playbooks and roles, reducing deployment time by 30% and enhancing environment consistency</li>
                <li>Implemented Prometheus and Grafana for comprehensive monitoring, enabling proactive issue detection and 99.9% uptime</li>
                <li>Configured CICD pipelines with Jenkins to automate build processes and ensuring software security</li>
                <li>Orchestrated a shift to infrastructure as code with Terraform, leading to a 50% reduction in deployment errors and improved reusability across environments</li>
                <li>Setup Ansible workstation, client and wrote YAML scripts to deploy software updates and upgrades</li>
                <li>Deployed Azure Kubernetes Services and ensured high availability, scalability, and fault tolerance</li>
                <li>Integrated Cloudflare for CDN, security, and performance optimization, leading to a reduction in latency and improvement in global content delivery speeds</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">DevOps Engineer</h3>
              <p className="text-gray-600 dark:text-gray-400">Sterling Oil and Energy Production Ltd | 03/2021 to 12/2023</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>Helped to streamline deployment workflows by implementing automated CICD pipelines</li>
                <li>Acted as SRE engineer by integrating monitoring and alerting tools reducing downtime</li>
                <li>Created automated shell scripts to streamline tasks, reducing manual workload by 40%</li>
                <li>Implemented unit tests in CICD pipelines to enhance code reliability, supporting error free SDLC</li>
                <li>Designed backup strategies and disaster recovery reducing manual intervention for cloud resources</li>
                <li>Pioneered the adoption of Kubernetes, scaling up from initial deployment to managing clusters with 100+ nodes, boosting application deployment speed by 70%</li>
                <li>Managed domain registration, DNS configuration, and SSL/TLS certificates for high-traffic applications</li>
                <li>Led the transition to IaC with Terraform and Ansible, automating complex multi-cloud environment provisioning and reducing manual configuration errors by 70%</li>
                <li>Successfully orchestrated the migration of a critical applications from on-premise infrastructure to Azure cloud services</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">DevOps Engineer</h3>
              <p className="text-gray-600 dark:text-gray-400">Bluegate Hospitals | 08/2020 to 09/2021</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>Implemented DevSecOps approach to pipeline deployments reducing security vulnerabilities in prod</li>
                <li>Conducted thorough testing and debugging to ensure high-quality code and application performance</li>
                <li>Developed automated python scripts that helped ensure continuous compliance and app security</li>
                <li>Analyzed and helped to optimize AWS cloud resource usage reducing cost by 30%</li>
                <li>Played a key role in a major migration project to AWS, facilitating seamless transition of legacy systems with zero downtime</li>
                <li>Developed disaster recovery strategies for critical app functions and established automated backup solutions and failover mechanisms</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Cyber Security Analyst</h3>
              <p className="text-gray-600 dark:text-gray-400">University of Greenwich | 09/2021 to 09/2022</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>Mitigated DDoS attacks by implementing advanced firewall rules and traffic analysis, resulting in a 40% reduction in downtime during peak attack periods</li>
                <li>Created Azure users and groups, implemented MFA to enhance security, and managed access control</li>
                <li>Managed, maintained incident records, led thorough documentation and analysis of security events</li>
                <li>Regular monitoring and logging in Grafana to identify, proactively addressed potential security issues</li>
                <li>Performed Internal IT Audit and Risk Analysis using ISO frameworks, NIST and COBIT</li>
                <li>Implemented and managed NSGs to control inbound/outbound traffic to institution wide VNets</li>
                <li>Configured and maintained Azure Security Center, Azure Firewall, Azure VPN, and Azure Key Vault</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Senior IT Support Engineer</h3>
              <p className="text-gray-600 dark:text-gray-400">Goodmasters | 01/2015 to 08/2020</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>Conducted root cause analyses to improve preventative measures and reduce incident recurrence</li>
                <li>Administered and maintained network infrastructure, including switches, routers, and firewalls</li>
                <li>Managed User accounts, permissions, and group policies to ensure security and access control</li>
                <li>Provided first and second-line technical support, resolving hardware, software, and network issues</li>
                <li>Provided technical support within SLA, consistently resolving customer issues promptly</li>
                <li>Demonstrated strong problem-solving skills and technical expertise, contributing to a 95% first-call resolution rate and enhancing overall customer satisfaction</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Projects */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">PROJECTS</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Full-stack Blog App Deployment on AWS</h3>
              <p className="text-gray-600 dark:text-gray-400">Using Jenkins as CICD, Terraform as IaC, SonarQube and GitOps with monitoring tools</p>
              <p className="text-gray-700 dark:text-gray-300">Tools used: GIT, GitOps, Jenkins, Nexus, Docker, AWS EKS, Terraform, Prometheus & Grafana etc.</p>
              <p className="text-gray-700 dark:text-gray-300">Result: Fully functional, scalable and efficient App deployed on AWS</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Microservice Vote App with ArgoCD and Azure DevOps</h3>
              <p className="text-gray-700 dark:text-gray-300">Tools used: GIT, Bash, Azure Devops, Kubernetes, ArgoCD, Docker, etc.</p>
              <p className="text-gray-700 dark:text-gray-300">Result: Fully functional, scalable and efficient App deployed on Azure</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Python App with /Healthcheck Endpoint</h3>
              <p className="text-gray-700 dark:text-gray-300">Tools used: Docker, ECR, Kubernetes, Trivy, SonarQube, Pytest, Bandit, Flake8, Terraform, and GitActions</p>
              <p className="text-gray-700 dark:text-gray-300">Result: Fully functional, scalable and efficient App that outputs its last_commit_sha in Json format for versioning security and integrity</p>
            </div>
          </div>
        </section>

        {/* Certifications */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">CERTIFICATIONS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-gray-700 dark:text-gray-300">• GitHub Foundations Certification</p>
              <p className="text-gray-700 dark:text-gray-300">• GitHub Actions Certification</p>
              <p className="text-gray-700 dark:text-gray-300">• Microsoft Certified Azure DevOps Expert AZ-400</p>
              <p className="text-gray-700 dark:text-gray-300">• Microsoft Certified Azure Administrator AZ-104</p>
            </div>
            <div className="space-y-2">
              <p className="text-gray-700 dark:text-gray-300">• Microsoft Certified Developer Associate AZ-204</p>
              <p className="text-gray-700 dark:text-gray-300">• Microsoft Certified Security Operation Analyst SC-200</p>
              <p className="text-gray-700 dark:text-gray-300">• Google Certified IT Support</p>
              <p className="text-gray-700 dark:text-gray-300">• AWS Solution Architect (In view)</p>
            </div>
          </div>
        </section>

        {/* Education */}
        <section>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">EDUCATION</h2>
          <div className="space-y-2">
            <div>
              <p className="text-gray-700 dark:text-gray-300">Master of Science: Cyber Security</p>
              <p className="text-gray-600 dark:text-gray-400">University of Greenwich | 09/2022</p>
            </div>
            <div>
              <p className="text-gray-700 dark:text-gray-300">Bachelor of Science: Technology Education</p>
              <p className="text-gray-600 dark:text-gray-400">Delta State University | 02/2014</p>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default HireMe; 